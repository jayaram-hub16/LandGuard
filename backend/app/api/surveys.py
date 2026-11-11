"""
Field Surveys API Blueprint — /api/surveys
Surveyor field submission workflow: draft → submitted → accepted/rejected
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app import db
from app.models import FieldSurvey, Case, LandParcel, User, UserRole, CaseStatus, CaseHistory
from app.utils.auth import login_required, admin_required
from app.utils.audit import log_action

surveys_bp = Blueprint("surveys", __name__)


def _is_surveyor_or_admin(user: User) -> bool:
    return user.role.value in (UserRole.SURVEYOR.value, UserRole.ADMIN.value, UserRole.REVIEWER.value)


@surveys_bp.route("", methods=["GET"])
@login_required
def list_surveys():
    user     = request.current_user
    page     = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    status   = request.args.get("status", "").strip()
    case_id  = request.args.get("case_id", "").strip()

    if not _is_surveyor_or_admin(user):
        return jsonify({"error": "Only surveyors, reviewers, and admins can access surveys."}), 403

    q = FieldSurvey.query
    # Surveyors only see their own
    if user.role.value == UserRole.SURVEYOR.value:
        q = q.filter(FieldSurvey.surveyor_id == user.id)

    if status:
        q = q.filter(FieldSurvey.status == status)
    if case_id:
        q = q.filter(FieldSurvey.case_id == case_id)

    pagination = q.order_by(FieldSurvey.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "surveys": [s.to_dict() for s in pagination.items],
        "total":   pagination.total,
        "page":    page,
        "pages":   pagination.pages,
    })


@surveys_bp.route("", methods=["POST"])
@login_required
def create_survey():
    """Create a new draft field survey. Surveyors and admins only."""
    user = request.current_user
    if not _is_surveyor_or_admin(user):
        return jsonify({"error": "Only surveyors and admins can create surveys."}), 403

    data = request.get_json(silent=True) or {}
    errors = {}

    case_id   = data.get("case_id")
    parcel_id = data.get("parcel_id")

    # Validate case exists and surveyor is assigned
    if case_id:
        case = Case.query.get(case_id)
        if not case:
            errors["case_id"] = "Case not found."
        elif user.role.value == UserRole.SURVEYOR.value and case.assigned_surveyor != user.id:
            errors["case_id"] = "You are not assigned to this case."

    if errors:
        return jsonify({"errors": errors}), 422

    survey = FieldSurvey(
        case_id             = case_id,
        parcel_id           = parcel_id,
        surveyor_id         = user.id,
        survey_number       = data.get("survey_number"),
        survey_date         = _parse_date(data.get("survey_date")),
        status              = "draft",
        observed_area_sqm   = data.get("observed_area_sqm"),
        measurement_unit    = data.get("measurement_unit", "sqm"),
        accuracy_meters     = data.get("accuracy_meters"),
        centroid_lat        = data.get("centroid_lat"),
        centroid_lng        = data.get("centroid_lng"),
        land_use_observed   = data.get("land_use_observed"),
        encroachment_found  = bool(data.get("encroachment_found", False)),
        notes               = data.get("notes"),
        recommendations     = data.get("recommendations"),
    )
    db.session.add(survey)
    db.session.flush()
    log_action(user.id, "SURVEY_CREATED", "FieldSurvey", survey.id,
               {"case_id": case_id, "parcel_id": parcel_id, "status": "draft"})
    db.session.commit()
    return jsonify(survey.to_dict()), 201


@surveys_bp.route("/<survey_id>", methods=["GET"])
@login_required
def get_survey(survey_id):
    survey = FieldSurvey.query.get_or_404(survey_id)
    user   = request.current_user
    if user.role.value == UserRole.SURVEYOR.value and survey.surveyor_id != user.id:
        return jsonify({"error": "Access denied."}), 403
    return jsonify(survey.to_dict())


@surveys_bp.route("/<survey_id>", methods=["PUT"])
@login_required
def update_survey(survey_id):
    """Update a draft survey. Only the owning surveyor or admin may edit."""
    survey = FieldSurvey.query.get_or_404(survey_id)
    user   = request.current_user

    if user.role.value == UserRole.SURVEYOR.value and survey.surveyor_id != user.id:
        return jsonify({"error": "Access denied."}), 403
    if survey.status == "submitted" and user.role.value == UserRole.SURVEYOR.value:
        return jsonify({"error": "Submitted surveys cannot be edited. Contact your reviewer."}), 409

    data = request.get_json(silent=True) or {}
    for field in ("survey_number", "notes", "recommendations", "land_use_observed",
                  "observed_area_sqm", "measurement_unit", "accuracy_meters",
                  "centroid_lat", "centroid_lng"):
        if field in data:
            setattr(survey, field, data[field])

    if "survey_date" in data:
        survey.survey_date = _parse_date(data["survey_date"])
    if "encroachment_found" in data:
        survey.encroachment_found = bool(data["encroachment_found"])

    log_action(user.id, "SURVEY_UPDATED", "FieldSurvey", survey.id)
    db.session.commit()
    return jsonify(survey.to_dict())


@surveys_bp.route("/<survey_id>/submit", methods=["POST"])
@login_required
def submit_survey(survey_id):
    """Submit a draft survey for review. Only the owning surveyor or admin."""
    survey = FieldSurvey.query.get_or_404(survey_id)
    user   = request.current_user

    if user.role.value == UserRole.SURVEYOR.value and survey.surveyor_id != user.id:
        return jsonify({"error": "Access denied."}), 403
    if survey.status != "draft":
        return jsonify({"error": f"Survey is already '{survey.status}'"}), 409

    # Require at minimum: survey_date and notes or observations
    if not survey.survey_date:
        return jsonify({"errors": {"survey_date": "Survey date is required before submitting."}}), 422

    survey.status       = "submitted"
    survey.submitted_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Advance case status if applicable
    if survey.case_id:
        case = Case.query.get(survey.case_id)
        if case and case.status == CaseStatus.SURVEY_ASSIGNED.value:
            old = case.status
            case.status = CaseStatus.SURVEY_SUBMITTED.value
            db.session.add(CaseHistory(
                case_id=case.id, changed_by=user.id,
                old_status=old, new_status=CaseStatus.SURVEY_SUBMITTED.value,
                notes=f"Field survey {survey_id[:8]} submitted.",
            ))

    log_action(user.id, "SURVEY_SUBMITTED", "FieldSurvey", survey.id)
    db.session.commit()
    return jsonify(survey.to_dict())


@surveys_bp.route("/<survey_id>/review", methods=["PATCH"])
@login_required
def review_survey(survey_id):
    """Accept or reject a submitted survey. ADMIN/REVIEWER only."""
    user = request.current_user
    if user.role.value not in (UserRole.ADMIN.value, UserRole.REVIEWER.value):
        return jsonify({"error": "Only reviewers and admins can review surveys."}), 403

    survey = FieldSurvey.query.get_or_404(survey_id)
    if survey.status != "submitted":
        return jsonify({"error": "Only submitted surveys can be reviewed."}), 409

    data   = request.get_json(silent=True) or {}
    action = data.get("action", "")  # "accept" or "reject"
    if action not in ("accept", "reject"):
        return jsonify({"error": "Action must be 'accept' or 'reject'."}), 422

    survey.status = "accepted" if action == "accept" else "rejected"
    log_action(user.id, f"SURVEY_{survey.status.upper()}", "FieldSurvey", survey.id)
    db.session.commit()
    return jsonify(survey.to_dict())


def _parse_date(val):
    if not val:
        return None
    try:
        from datetime import date
        return datetime.strptime(val, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
