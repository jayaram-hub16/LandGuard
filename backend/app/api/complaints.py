"""
Complaints API Blueprint — /api/complaints
Public citizen complaint portal with rate limiting and acknowledgment numbers.
"""
from flask import Blueprint, request, jsonify
from app import db
from app.models import Complaint, Case, CaseStatus, CaseHistory, UserRole
from app.utils.auth import login_required, admin_required
from app.utils.audit import log_action
from datetime import datetime, timezone
import hashlib

complaints_bp = Blueprint("complaints", __name__)

# Simple in-memory rate limiter (IP → list of timestamps)
# For production use Flask-Limiter
_RATE_STORE: dict = {}
_RATE_LIMIT_WINDOW = 3600   # 1 hour
_RATE_LIMIT_MAX    = 5      # max complaints per IP per hour


def _check_rate_limit(ip: str) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    import time
    now = time.time()
    window = _RATE_STORE.get(ip, [])
    window = [t for t in window if now - t < _RATE_LIMIT_WINDOW]
    if len(window) >= _RATE_LIMIT_MAX:
        _RATE_STORE[ip] = window
        return False
    window.append(now)
    _RATE_STORE[ip] = window
    return True


# ── Public Endpoints ─────────────────────────────────────────────────────────

@complaints_bp.route("", methods=["POST"])
def submit_complaint():
    """
    PUBLIC — No authentication required.
    Citizen submits a suspected encroachment complaint.
    Returns an acknowledgment number for tracking.
    Rate limited: max 5 per IP per hour.
    """
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    if not _check_rate_limit(ip):
        return jsonify({
            "error": "Too many submissions from your location. Please wait an hour and try again."
        }), 429

    data = request.get_json(silent=True) or {}
    errors = {}

    name  = (data.get("complainant_name") or "").strip()
    desc  = (data.get("description") or "").strip()
    if not name:
        errors["complainant_name"] = "Your name is required."
    if not desc or len(desc) < 20:
        errors["description"] = "Please provide a description of at least 20 characters."

    email = (data.get("complainant_email") or "").strip().lower()
    phone = (data.get("complainant_phone") or "").strip()
    if email and "@" not in email:
        errors["complainant_email"] = "Please provide a valid email address."

    if errors:
        return jsonify({"errors": errors}), 422

    # Generate unique ack number
    ack = Complaint.generate_ack_number()
    while Complaint.query.filter_by(ack_number=ack).first():
        ack = Complaint.generate_ack_number()

    # Determine submitter (if logged in as CITIZEN / USER)
    submitted_by = None
    auth_header  = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from app.utils.auth import get_current_user
            # Temporarily set auth header so get_current_user() can read it
            submitted_by_user = get_current_user()
            if submitted_by_user:
                submitted_by = submitted_by_user.id
        except Exception:
            pass


    complaint = Complaint(
        ack_number        = ack,
        complainant_name  = name,
        complainant_email = email or None,
        complainant_phone = phone or None,
        description       = desc,
        location_address  = data.get("location_address"),
        location_lat      = data.get("location_lat"),
        location_lng      = data.get("location_lng"),
        parcel_ref        = (data.get("parcel_ref") or "").strip() or None,
        status            = "Submitted",
        submitted_by      = submitted_by,
    )
    db.session.add(complaint)
    db.session.flush()
    log_action(None, "COMPLAINT_SUBMITTED", "Complaint", complaint.id,
               {"ack": ack, "from_ip": ip})
    db.session.commit()

    return jsonify({
        "id":         complaint.id,
        "ack_number": ack,
        "status":     complaint.status,
        "message":    (
            f"Your complaint has been received. Your acknowledgment number is {ack}. "
            "Please keep this number to track your complaint status."
        ),
    }), 201


@complaints_bp.route("/status/<ack_number>", methods=["GET"])
def check_status(ack_number):
    """
    PUBLIC — No authentication required.
    Citizens check their complaint status using the acknowledgment number.
    Returns only public-safe fields (no private landowner info, no admin notes).
    """
    # Normalize input
    ack = ack_number.strip().upper()
    complaint = Complaint.query.filter_by(ack_number=ack).first()
    if not complaint:
        return jsonify({
            "error": "No complaint found with that acknowledgment number. "
                     "Please check the number and try again."
        }), 404

    STATUS_DESCRIPTIONS = {
        "Submitted":     "Your complaint has been received and is awaiting review by our team.",
        "Acknowledged":  "Your complaint has been acknowledged and is being assessed.",
        "Under Review":  "Your complaint is under active review. A surveyor may be assigned.",
        "Resolved":      "This complaint has been reviewed and a decision has been recorded.",
        "Closed":        "This complaint has been closed. No further action will be taken.",
    }

    return jsonify({
        "ack_number":   complaint.ack_number,
        "status":       complaint.status,
        "description":  STATUS_DESCRIPTIONS.get(complaint.status, complaint.status),
        "submitted_at": complaint.submitted_at.isoformat() if complaint.submitted_at else None,
        "updated_at":   complaint.updated_at.isoformat() if complaint.updated_at else None,
        "has_case":     bool(complaint.case_id),
    })


# ── Admin / Staff Endpoints ───────────────────────────────────────────────────

@complaints_bp.route("", methods=["GET"])
@login_required
def list_complaints():
    """ADMIN/REVIEWER — list all complaints with admin-view details."""
    user = request.current_user
    if user.role.value not in (UserRole.ADMIN.value, UserRole.REVIEWER.value):
        return jsonify({"error": "Insufficient permissions."}), 403

    page     = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    status   = request.args.get("status", "").strip()

    q = Complaint.query
    if status:
        q = q.filter(Complaint.status == status)
    pagination = q.order_by(Complaint.submitted_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "complaints": [c.to_dict(admin_view=True) for c in pagination.items],
        "total":      pagination.total,
        "page":       page,
        "pages":      pagination.pages,
    })


@complaints_bp.route("/<complaint_id>", methods=["GET"])
@login_required
def get_complaint(complaint_id):
    user = request.current_user
    if user.role.value not in (UserRole.ADMIN.value, UserRole.REVIEWER.value):
        return jsonify({"error": "Insufficient permissions."}), 403
    complaint = Complaint.query.get_or_404(complaint_id)
    return jsonify(complaint.to_dict(admin_view=True))


@complaints_bp.route("/<complaint_id>/status", methods=["PATCH"])
@login_required
def update_complaint_status(complaint_id):
    """ADMIN/REVIEWER — update complaint status and open a case if needed."""
    user = request.current_user
    if user.role.value not in (UserRole.ADMIN.value, UserRole.REVIEWER.value):
        return jsonify({"error": "Insufficient permissions."}), 403

    complaint = Complaint.query.get_or_404(complaint_id)
    data       = request.get_json(silent=True) or {}
    new_status = data.get("status", complaint.status)
    admin_note = (data.get("admin_notes") or "").strip()

    valid_statuses = {"Submitted", "Acknowledged", "Under Review", "Resolved", "Closed"}
    if new_status not in valid_statuses:
        return jsonify({"error": f"Invalid status. Choose from {sorted(valid_statuses)}"}), 422

    complaint.status = new_status
    if admin_note:
        complaint.admin_notes = admin_note

    # Optionally auto-open a case
    open_case = bool(data.get("open_case"))
    if open_case and not complaint.case_id:
        from app.models import Case
        case_number = Case.generate_case_number()
        while Case.query.filter_by(case_number=case_number).first():
            case_number = Case.generate_case_number()
        case = Case(
            case_number  = case_number,
            title        = f"Complaint {complaint.ack_number}: {complaint.description[:80]}",
            description  = complaint.description,
            complaint_id = complaint.id,
            opened_by    = user.id,
            status       = CaseStatus.REPORTED.value,
        )
        db.session.add(case)
        db.session.flush()
        db.session.add(CaseHistory(
            case_id=case.id, changed_by=user.id,
            old_status=None, new_status=CaseStatus.REPORTED.value,
            notes=f"Case opened from complaint {complaint.ack_number}.",
        ))
        complaint.case_id = case.id

    log_action(user.id, "COMPLAINT_STATUS_UPDATED", "Complaint", complaint.id,
               {"ack": complaint.ack_number, "status": new_status})
    db.session.commit()
    return jsonify(complaint.to_dict(admin_view=True))
