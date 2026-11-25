"""
Admin API Blueprint — /api/admin
"""
from flask import Blueprint, request, jsonify, current_app
from app import db
from app.models import (
    User, UserRole, UserStatus, AuditLog, LandParcel,
    EncroachmentDetection, Dataset, ReviewStatus
)
from app.utils.auth import admin_required, login_required
from app.utils.audit import log_action

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/dashboard", methods=["GET"])
@admin_required
def dashboard():
    """Admin dashboard statistics."""
    total_parcels = LandParcel.query.count()
    flagged_parcels = LandParcel.query.filter_by(is_flagged=True).count()
    total_detections = EncroachmentDetection.query.count()
    pending_detections = EncroachmentDetection.query.filter_by(
        review_status=ReviewStatus.PENDING
    ).count()
    total_users = User.query.count()
    active_users = User.query.filter_by(status=UserStatus.ACTIVE).count()
    total_datasets = Dataset.query.count()

    # Land use distribution
    from app.models import LandUseCategory
    from sqlalchemy import func
    lu_counts = db.session.query(
        LandParcel.registered_land_use, func.count(LandParcel.id)
    ).group_by(LandParcel.registered_land_use).all()
    land_use_stats = {(k.value if k else "Unknown"): v for k, v in lu_counts}

    # Detection severity
    sev_counts = db.session.query(
        EncroachmentDetection.severity, func.count(EncroachmentDetection.id)
    ).group_by(EncroachmentDetection.severity).all()
    severity_stats = {(k or "Unknown"): v for k, v in sev_counts}

    # Recent activity
    recent_logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(10).all()

    return jsonify({
        "parcels": {"total": total_parcels, "flagged": flagged_parcels},
        "detections": {"total": total_detections, "pending": pending_detections},
        "users": {"total": total_users, "active": active_users},
        "datasets": {"total": total_datasets},
        "land_use_distribution": land_use_stats,
        "severity_distribution": severity_stats,
        "recent_activity": [l.to_dict() for l in recent_logs],
    })


@admin_bp.route("/occupation-monitor", methods=["GET"])
@admin_required
def occupation_monitor():
    """
    Dedicated stats for the Unauthorized Occupation Monitoring panel.
    Groups detections by review_status and returns recent detection details.
    """
    from app.models import ReviewStatus, Case
    from sqlalchemy import func

    # Count detections by review status
    status_counts = dict(db.session.query(
        EncroachmentDetection.review_status, func.count(EncroachmentDetection.id)
    ).group_by(EncroachmentDetection.review_status).all())

    # Map to human labels
    def _count(status: ReviewStatus) -> int:
        return status_counts.get(status, 0)

    # Recent detections (last 20) with parcel info
    recent_detections = (
        EncroachmentDetection.query
        .order_by(EncroachmentDetection.detected_at.desc())
        .limit(20)
        .all()
    )

    # Counts by severity
    sev_counts = dict(db.session.query(
        EncroachmentDetection.severity, func.count(EncroachmentDetection.id)
    ).group_by(EncroachmentDetection.severity).all())

    # Linked case stats
    total_cases = Case.query.count()
    open_cases = Case.query.filter(
        Case.status.notin_(["Resolved", "Referred for Appeal"])
    ).count()

    return jsonify({
        "summary": {
            "newly_detected":       _count(ReviewStatus.PENDING),
            "under_investigation":  _count(ReviewStatus.UNDER_INVESTIGATION),
            "field_inspection":     Case.query.filter_by(status="Field Survey Assigned").count(),
            "human_verified":       _count(ReviewStatus.VERIFIED),
            "rejected_false":       _count(ReviewStatus.FALSE_POSITIVE),
            "resolved":             _count(ReviewStatus.RESOLVED),
            "total_detections":     EncroachmentDetection.query.count(),
            "total_cases":          total_cases,
            "open_cases":           open_cases,
        },
        "severity_counts": sev_counts,
        "recent_detections": [d.to_dict() for d in recent_detections],
    })


@admin_bp.route("/users", methods=["GET"])
@admin_required
def list_users():
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    search = request.args.get("search", "").strip()
    q = User.query
    if search:
        q = q.filter(
            db.or_(
                User.email.ilike(f"%{search}%"),
                User.full_name.ilike(f"%{search}%"),
                User.organization.ilike(f"%{search}%"),
            )
        )
    pagination = q.order_by(User.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "users": [u.to_dict() for u in pagination.items],
        "total": pagination.total,
        "page": page,
        "pages": pagination.pages,
    })


@admin_bp.route("/users", methods=["POST"])
@admin_required
def create_user():
    """Admin-only: create a new USER or ADMIN account with a secure hashed password."""
    from app.utils.auth import hash_password
    data = request.get_json(silent=True) or {}
    errors = {}

    email = (data.get("email") or "").strip().lower()
    full_name = (data.get("full_name") or "").strip()
    password = data.get("password", "")
    role_str = (data.get("role") or "USER").strip().upper()
    organization = (data.get("organization") or "").strip() or None

    if not email or "@" not in email:
        errors["email"] = "A valid email address is required."
    elif User.query.filter_by(email=email).first():
        errors["email"] = "An account with this email already exists."

    if not full_name:
        errors["full_name"] = "Full name is required."

    if not password or len(password) < 8:
        errors["password"] = "Password must be at least 8 characters."

    try:
        role = UserRole(role_str)
    except ValueError:
        errors["role"] = f"Invalid role. Must be one of: {[r.value for r in UserRole]}"
        role = UserRole.USER

    if errors:
        return jsonify({"errors": errors}), 422

    new_user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        organization=organization,
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.session.add(new_user)
    db.session.flush()
    log_action(request.current_user.id, "USER_CREATED", "User", new_user.id,
               {"email": email, "role": role.value, "by": request.current_user.email})
    db.session.commit()
    return jsonify(new_user.to_dict()), 201



@admin_bp.route("/users/<user_id>/status", methods=["PATCH"])
@admin_required
def update_user_status(user_id):
    target = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}
    actor = request.current_user

    # Prevent self-deactivation
    if target.id == actor.id:
        return jsonify({"error": "You cannot change your own status."}), 403

    new_status_str = data.get("status", "")
    try:
        new_status = UserStatus(new_status_str)
    except ValueError:
        return jsonify({"error": f"Invalid status. Valid: {[s.value for s in UserStatus]}"}), 422

    # Prevent locking out last admin
    if target.role == UserRole.ADMIN and new_status == UserStatus.INACTIVE:
        active_admin_count = User.query.filter_by(
            role=UserRole.ADMIN, status=UserStatus.ACTIVE
        ).count()
        if active_admin_count <= 1:
            return jsonify({"error": "Cannot deactivate the last active administrator."}), 403

    old_status = target.status.value
    target.status = new_status
    log_action(actor.id, "USER_STATUS_CHANGED", "User", target.id,
               {"old": old_status, "new": new_status_str, "target_email": target.email})
    db.session.commit()
    return jsonify(target.to_dict())


@admin_bp.route("/users/<user_id>/role", methods=["PATCH"])
@admin_required
def update_user_role(user_id):
    target = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}
    actor = request.current_user

    if target.id == actor.id:
        return jsonify({"error": "You cannot change your own role."}), 403

    new_role_str = data.get("role", "")
    try:
        new_role = UserRole(new_role_str)
    except ValueError:
        return jsonify({"error": f"Invalid role. Valid: {[r.value for r in UserRole]}"}), 422

    # Prevent demotion of last admin
    if target.role == UserRole.ADMIN and new_role != UserRole.ADMIN:
        admin_count = User.query.filter_by(role=UserRole.ADMIN, status=UserStatus.ACTIVE).count()
        if admin_count <= 1:
            return jsonify({"error": "Cannot demote the last active administrator."}), 403

    old_role = target.role.value
    target.role = new_role
    log_action(actor.id, "USER_ROLE_CHANGED", "User", target.id,
               {"old": old_role, "new": new_role_str, "target_email": target.email})
    db.session.commit()
    return jsonify(target.to_dict())


@admin_bp.route("/audit-logs", methods=["GET"])
@admin_required
def audit_logs():
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 50, type=int), 200)
    action_filter = request.args.get("action", "").strip()

    q = AuditLog.query
    if action_filter:
        q = q.filter(AuditLog.action.ilike(f"%{action_filter}%"))

    pagination = q.order_by(AuditLog.timestamp.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "logs": [l.to_dict() for l in pagination.items],
        "total": pagination.total,
        "page": page,
        "pages": pagination.pages,
    })


@admin_bp.route("/staff", methods=["GET"])
@admin_required
def list_staff():
    """Return surveyors and reviewers for case-assignment dropdowns.
    Only exposes id, full_name, email, and role — no sensitive fields.
    """
    role_filter = request.args.get("role", "").strip().upper()
    q = User.query.filter(
        User.status == UserStatus.ACTIVE,
        User.role.in_([UserRole.SURVEYOR, UserRole.REVIEWER, UserRole.ADMIN])
    )
    if role_filter and role_filter in ("SURVEYOR", "REVIEWER", "ADMIN"):
        q = q.filter(User.role == UserRole(role_filter))

    staff = q.order_by(User.full_name).all()
    return jsonify({
        "staff": [
            {
                "id":        u.id,
                "full_name": u.full_name,
                "email":     u.email,
                "role":      u.role.value,
            }
            for u in staff
        ]
    })


@admin_bp.route("/stats", methods=["GET"])
@login_required
def stats():
    """Extended stats including cases and complaints. Available to all authenticated users."""
    from app.models import Case, Complaint

    try:
        total_parcels = LandParcel.query.count()
        flagged_parcels = LandParcel.query.filter_by(is_flagged=True).count()
        total_detections = EncroachmentDetection.query.count()
        pending_detect = EncroachmentDetection.query.filter_by(
            review_status=ReviewStatus.PENDING
        ).count()

        total_cases = Case.query.count()
        open_cases = Case.query.filter(
            db.or_(
                Case.status.notin_(["Resolved", "Referred for Appeal"]),
                Case.status.is_(None),
            )
        ).count()
        total_complaints = Complaint.query.count()
        open_complaints = Complaint.query.filter(
            db.or_(
                Complaint.status.notin_(["Resolved", "Rejected"]),
                Complaint.status.is_(None),
            )
        ).count()

        return jsonify({
            "parcels":    {"total": total_parcels,    "flagged": flagged_parcels},
            "detections": {"total": total_detections, "pending": pending_detect},
            "cases":      {"total": total_cases,      "open": open_cases},
            "complaints": {"total": total_complaints, "open": open_complaints},
        })
    except Exception as exc:
        db.session.rollback()
        current_app.logger.exception("Error computing /api/admin/stats: %s", exc)
        return jsonify({"error": "Failed to compute admin statistics."}), 500

