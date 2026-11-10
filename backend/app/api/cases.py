"""
Cases API Blueprint — /api/cases
Case management workflow: Reported → Under Review → … → Resolved
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app import db
from app.models import (
    Case, CaseHistory, CaseEvidence, CaseStatus,
    User, UserRole, FieldSurvey
)
from app.utils.auth import login_required, admin_required
from app.utils.audit import log_action

cases_bp = Blueprint("cases", __name__)

# Valid status transitions (enforced server-side)
ALLOWED_TRANSITIONS = {
    CaseStatus.REPORTED.value:          {CaseStatus.UNDER_REVIEW.value, CaseStatus.SURVEY_ASSIGNED.value},
    CaseStatus.UNDER_REVIEW.value:      {CaseStatus.SURVEY_ASSIGNED.value, CaseStatus.DECISION_PENDING.value, CaseStatus.DISPUTED.value},
    CaseStatus.SURVEY_ASSIGNED.value:   {CaseStatus.SURVEY_SUBMITTED.value, CaseStatus.UNDER_REVIEW.value},
    CaseStatus.SURVEY_SUBMITTED.value:  {CaseStatus.DECISION_PENDING.value, CaseStatus.DISPUTED.value},
    CaseStatus.DECISION_PENDING.value:  {CaseStatus.RESOLVED.value, CaseStatus.DISPUTED.value, CaseStatus.REFERRED_APPEAL.value},
    CaseStatus.DISPUTED.value:          {CaseStatus.REFERRED_APPEAL.value, CaseStatus.DECISION_PENDING.value},
    CaseStatus.RESOLVED.value:          set(),
    CaseStatus.REFERRED_APPEAL.value:   {CaseStatus.DECISION_PENDING.value},
}


def _can_manage(user: User) -> bool:
    """ADMIN or REVIEWER can manage cases."""
    return user.role.value in (UserRole.ADMIN.value, UserRole.REVIEWER.value)


def _can_view(user: User, case: Case) -> bool:
    """ADMIN/REVIEWER see all; SURVEYOR sees assigned; CITIZEN/USER sees nothing internal."""
    r = user.role.value
    if r in (UserRole.ADMIN.value, UserRole.REVIEWER.value):
        return True
    if r == UserRole.SURVEYOR.value:
        return case.assigned_surveyor == user.id
    return False


@cases_bp.route("", methods=["GET"])
@login_required
def list_cases():
    user = request.current_user
    page     = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    status   = request.args.get("status", "").strip()
    priority = request.args.get("priority", "").strip()
    search   = request.args.get("search", "").strip()

    q = Case.query
    if user.role.value == UserRole.SURVEYOR.value:
        q = q.filter(Case.assigned_surveyor == user.id)
    elif user.role.value not in (UserRole.ADMIN.value, UserRole.REVIEWER.value):
        return jsonify({"error": "Insufficient permissions."}), 403

    if status:
        q = q.filter(Case.status == status)
    if priority:
        q = q.filter(Case.priority == priority)
    if search:
        q = q.filter(
            db.or_(
                Case.case_number.ilike(f"%{search}%"),
                Case.title.ilike(f"%{search}%"),
            )
        )

    pagination = q.order_by(Case.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "cases":    [c.to_dict() for c in pagination.items],
        "total":    pagination.total,
        "page":     page,
        "pages":    pagination.pages,
    })


@cases_bp.route("", methods=["POST"])
@login_required
def create_case():
    if not _can_manage(request.current_user):
        return jsonify({"error": "Only admins and reviewers can create cases."}), 403
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"errors": {"title": "Case title is required."}}), 422

    case_number = Case.generate_case_number()
    # Ensure unique
    while Case.query.filter_by(case_number=case_number).first():
        case_number = Case.generate_case_number()

    case = Case(
        case_number      = case_number,
        title            = title,
        description      = data.get("description"),
        parcel_id        = data.get("parcel_id"),
        detection_id     = data.get("detection_id"),
        complaint_id     = data.get("complaint_id"),
        opened_by        = request.current_user.id,
        priority         = data.get("priority", "Medium"),
        status           = CaseStatus.REPORTED.value,
    )
    db.session.add(case)
    db.session.flush()

    # Log initial status
    hist = CaseHistory(
        case_id    = case.id,
        changed_by = request.current_user.id,
        old_status = None,
        new_status = CaseStatus.REPORTED.value,
        notes      = "Case opened.",
    )
    db.session.add(hist)
    log_action(request.current_user.id, "CASE_CREATED", "Case", case.id,
               {"case_number": case_number, "title": title})
    db.session.commit()
    return jsonify(case.to_dict()), 201


@cases_bp.route("/<case_id>", methods=["GET"])
@login_required
def get_case(case_id):
    case = Case.query.filter(
        db.or_(Case.id == case_id, Case.case_number == case_id)
    ).first_or_404()
    if not _can_view(request.current_user, case):
        return jsonify({"error": "Access denied."}), 403
    result = case.to_dict()
    result["history"]  = [h.to_dict() for h in case.history]
    result["evidence"] = [e.to_dict() for e in case.evidence]
    result["surveys"]  = [s.to_dict() for s in case.surveys]
    return jsonify(result)


@cases_bp.route("/<case_id>/status", methods=["PATCH"])
@login_required
def update_case_status(case_id):
    user = request.current_user
    if not _can_manage(user):
        return jsonify({"error": "Insufficient permissions."}), 403

    case = Case.query.filter(
        db.or_(Case.id == case_id, Case.case_number == case_id)
    ).first_or_404()

    data       = request.get_json(silent=True) or {}
    new_status = data.get("status", "")
    notes      = data.get("notes", "")

    allowed = ALLOWED_TRANSITIONS.get(case.status, set())
    if new_status not in allowed:
        return jsonify({"error": f"Cannot transition from '{case.status}' to '{new_status}'."}), 422

    old_status  = case.status
    case.status = new_status
    if new_status == CaseStatus.RESOLVED.value:
        case.decision_reason = data.get("decision_reason", "")
        case.resolved_at     = datetime.now(timezone.utc).replace(tzinfo=None)

    hist = CaseHistory(
        case_id    = case.id,
        changed_by = user.id,
        old_status = old_status,
        new_status = new_status,
        notes      = notes,
    )
    db.session.add(hist)
    log_action(user.id, "CASE_STATUS_CHANGED", "Case", case.id,
               {"case_number": case.case_number, "old": old_status, "new": new_status})
    db.session.commit()
    return jsonify(case.to_dict())


@cases_bp.route("/<case_id>/assign", methods=["PATCH"])
@login_required
def assign_case(case_id):
    user = request.current_user
    if not _can_manage(user):
        return jsonify({"error": "Insufficient permissions."}), 403

    case = Case.query.filter(
        db.or_(Case.id == case_id, Case.case_number == case_id)
    ).first_or_404()
    data = request.get_json(silent=True) or {}

    if "surveyor_id" in data:
        sid = data["surveyor_id"]
        s = None
        if sid:
            s = User.query.get(sid)
            if not s or s.role.value not in (UserRole.SURVEYOR.value, UserRole.ADMIN.value):
                return jsonify({"error": "User is not a surveyor."}), 422
        case.assigned_surveyor = sid or None
        if case.status == CaseStatus.REPORTED.value or case.status == CaseStatus.UNDER_REVIEW.value:
            case.status = CaseStatus.SURVEY_ASSIGNED.value
            db.session.add(CaseHistory(
                case_id=case.id, changed_by=user.id,
                old_status=case.status, new_status=CaseStatus.SURVEY_ASSIGNED.value,
                notes=f"Assigned to surveyor {s.full_name if s else sid}",
            ))

    if "reviewer_id" in data:
        rid = data["reviewer_id"]
        r = None
        if rid:
            r = User.query.get(rid)
            if not r or r.role.value not in (UserRole.REVIEWER.value, UserRole.ADMIN.value):
                return jsonify({"error": "User is not a reviewer."}), 422
        case.assigned_reviewer = rid or None

    log_action(user.id, "CASE_ASSIGNED", "Case", case.id, {"case_number": case.case_number})
    db.session.commit()
    return jsonify(case.to_dict())


@cases_bp.route("/<case_id>/evidence", methods=["POST"])
@login_required
def add_evidence(case_id):
    case = Case.query.get_or_404(case_id)
    user = request.current_user
    if not _can_view(user, case):
        return jsonify({"error": "Access denied."}), 403

    data = request.get_json(silent=True) or {}
    ev = CaseEvidence(
        case_id         = case.id,
        submitted_by    = user.id,
        evidence_type   = data.get("evidence_type", "note"),
        description     = data.get("description"),
        coordinates_lat = data.get("coordinates_lat"),
        coordinates_lng = data.get("coordinates_lng"),
    )
    db.session.add(ev)
    log_action(user.id, "EVIDENCE_ADDED", "Case", case.id, {"type": ev.evidence_type})
    db.session.commit()
    return jsonify(ev.to_dict()), 201


@cases_bp.route("/stats", methods=["GET"])
@login_required
def case_stats():
    if not _can_manage(request.current_user):
        return jsonify({"error": "Insufficient permissions."}), 403
    from sqlalchemy import func
    status_counts = db.session.query(
        Case.status, func.count(Case.id)
    ).group_by(Case.status).all()
    priority_counts = db.session.query(
        Case.priority, func.count(Case.id)
    ).group_by(Case.priority).all()
    overdue = Case.query.filter(
        Case.deadline < datetime.now(timezone.utc).replace(tzinfo=None),
        Case.status.notin_([CaseStatus.RESOLVED.value, CaseStatus.REFERRED_APPEAL.value])
    ).count()
    return jsonify({
        "by_status":   {s: c for s, c in status_counts},
        "by_priority": {p: c for p, c in priority_counts},
        "overdue":     overdue,
        "total":       Case.query.count(),
    })
