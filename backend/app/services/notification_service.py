"""
Notification Service — creates in-app notifications and optionally sends emails.
Called by DetectionEngine and other backend services whenever an alert is needed.

DISCLAIMER: Email sending requires SMTP credentials in .env
            SMS/WhatsApp requires a third-party service (Twilio / MSG91) — not configured here.
"""
import uuid
import logging
import os
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

DISCLAIMER = (
    "⚠ PRELIMINARY ALERT — This is an automated system finding based on geometric analysis "
    "and land-use comparison. It does NOT constitute proof of illegal encroachment or any "
    "legal determination of ownership. All findings require verification by an authorized surveyor."
)


def _generate_incident_ref() -> str:
    """Generate a unique incident reference number."""
    suffix = uuid.uuid4().hex[:8].upper()
    year = datetime.now(timezone.utc).year
    return f"INC-{year}-{suffix}"


def _get_admins():
    """Return all active admin users."""
    from app.models import User, UserRole, UserStatus
    return User.query.filter_by(role=UserRole.ADMIN, status=UserStatus.ACTIVE).all()


def _find_owner_user(parcel):
    """
    Try to find a registered system user whose email matches the parcel owner's contact email.
    Returns User or None.
    """
    if not parcel or not parcel.owner:
        return None
    owner_email = (parcel.owner.contact_email or "").strip().lower()
    if not owner_email:
        return None
    from app.models import User
    return User.query.filter(
        User.email.ilike(owner_email)
    ).first()


def _send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Send an email via SMTP if credentials are configured in environment variables.
    Returns True if sent, False if skipped (not configured).

    Required .env variables:
        MAIL_SERVER, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM
    """
    mail_server = os.environ.get("MAIL_SERVER", "").strip()
    mail_username = os.environ.get("MAIL_USERNAME", "").strip()
    mail_password = os.environ.get("MAIL_PASSWORD", "").strip()
    mail_from = os.environ.get("MAIL_FROM", mail_username).strip()
    mail_port = int(os.environ.get("MAIL_PORT", "587"))

    if not mail_server or not mail_username or not mail_password:
        logger.info("Email not sent (SMTP not configured): subject='%s' to='%s'", subject, to_email)
        return False

    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = mail_from
        msg["To"] = to_email
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(mail_server, mail_port) as server:
            server.ehlo()
            server.starttls()
            server.login(mail_username, mail_password)
            server.sendmail(mail_from, [to_email], msg.as_string())

        logger.info("Email sent: subject='%s' to='%s'", subject, to_email)
        return True
    except Exception as exc:
        logger.warning("Email send failed to '%s': %s", to_email, exc)
        return False


def _send_sms_stub(phone: str, message: str):
    """
    SMS / WhatsApp notification stub.
    Requires Twilio or MSG91 configuration — NOT implemented in this version.
    Log the intent so the admin can configure it later.
    """
    logger.info(
        "SMS notification not sent (service not configured). "
        "Phone: %s | Message preview: %.80s",
        phone, message
    )


class NotificationService:
    """
    Service class for creating and dispatching notifications.
    All methods are safe to call even if the DB session is not yet committed.
    """

    @staticmethod
    def create_detection_alerts(
        detection,
        parcel,
        case,
        incident_ref: str,
    ) -> int:
        """
        Create in-app notifications for:
        1. All system administrators
        2. The registered landowner (if a matching system user is found)

        Returns the number of notifications created.
        """
        from app import db
        from app.models.notification import Notification

        notifications_created = 0

        # Build location string
        location_parts = [
            parcel.administrative_area,
            parcel.district,
            parcel.state,
        ]
        location_str = ", ".join(p for p in location_parts if p) or "Location not recorded"

        # Affected area in both units
        area_sqm = detection.overlap_area_sqm or detection.area_difference_sqm or detection.observed_area_sqm
        area_sqft = round(area_sqm * 10.7639, 1) if area_sqm else None
        area_str = (
            f"{area_sqm:.1f} m² ({area_sqft:.1f} sq ft)" if area_sqm and area_sqft else "Unknown area"
        )

        detected_at_str = (
            detection.detected_at.strftime("%d %b %Y, %H:%M UTC")
            if detection.detected_at else "Unknown"
        )

        # Coordinates
        coord_str = "Not recorded"
        if parcel.centroid_lat and parcel.centroid_lng:
            coord_str = f"{parcel.centroid_lat:.6f}, {parcel.centroid_lng:.6f}"

        admin_title = f"⚠ Occupation Alert: Parcel {parcel.parcel_id}"
        admin_msg = (
            f"Incident Reference: {incident_ref}\n"
            f"Parcel ID: {parcel.parcel_id}\n"
            f"Owner: {parcel.owner.owner_name if parcel.owner else 'Unknown'}\n"
            f"Location: {location_str}\n"
            f"Suspected Affected Area: {area_str}\n"
            f"Detection Date: {detected_at_str}\n"
            f"Coordinates: {coord_str}\n"
            f"Severity: {detection.severity}\n"
            f"Confidence: {detection.model_confidence:.0%} (AI estimate)\n"
            f"Case Number: {case.case_number if case else 'Not assigned'}\n"
            f"Reason: {detection.detection_reason}\n\n"
            f"{DISCLAIMER}"
        )

        # 1. Notify all admins
        for admin in _get_admins():
            notif = Notification(
                user_id=admin.id,
                title=admin_title,
                message=admin_msg,
                notification_type="detection_alert",
                detection_id=detection.id,
                case_id=case.id if case else None,
                parcel_id=parcel.parcel_id,
                incident_ref=incident_ref,
            )
            db.session.add(notif)
            notifications_created += 1

            # Email admin
            _send_email(
                admin.email,
                f"[LandGuard] {admin_title}",
                admin_msg,
            )

        # 2. Notify landowner (if system user found)
        owner_user = _find_owner_user(parcel)
        if owner_user:
            owner_title = f"Alert: Activity detected on your land parcel {parcel.parcel_id}"
            owner_msg = (
                f"Dear {owner_user.full_name},\n\n"
                f"The LandGuard system has detected a potential unauthorized land-use change "
                f"on a parcel registered to your name.\n\n"
                f"Incident Reference: {incident_ref}\n"
                f"Parcel ID: {parcel.parcel_id}\n"
                f"Location: {location_str}\n"
                f"Suspected Affected Area: {area_str}\n"
                f"Detection Date: {detected_at_str}\n"
                f"Coordinates: {coord_str}\n\n"
                f"This alert has been assigned for verification by an authorized surveyor. "
                f"You can track the status of this case using the reference number above.\n\n"
                f"To submit additional evidence or objections, please log in to the LandGuard portal "
                f"and visit the Citizen Portal section.\n\n"
                f"{DISCLAIMER}"
            )
            owner_notif = Notification(
                user_id=owner_user.id,
                title=owner_title,
                message=owner_msg,
                notification_type="detection_alert",
                detection_id=detection.id,
                case_id=case.id if case else None,
                parcel_id=parcel.parcel_id,
                incident_ref=incident_ref,
            )
            db.session.add(owner_notif)
            notifications_created += 1

            _send_email(
                owner_user.email,
                f"[LandGuard] {owner_title}",
                owner_msg,
            )

            # SMS stub (phone from ownership record)
            if parcel.owner and parcel.owner.contact_phone:
                _send_sms_stub(parcel.owner.contact_phone, owner_msg[:160])

        return notifications_created

    @staticmethod
    def create_case_update_notification(user_id: str, case, notes: str = ""):
        """Notify a user that a case they are involved in has been updated."""
        from app import db
        from app.models.notification import Notification

        notif = Notification(
            user_id=user_id,
            title=f"Case {case.case_number} Updated",
            message=(
                f"Case {case.case_number}: {case.title}\n"
                f"New Status: {case.status}\n"
                f"{notes}"
            ),
            notification_type="case_update",
            case_id=case.id,
        )
        db.session.add(notif)

