"""
Detections API Blueprint — /api/detections
"""
import csv
import io
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, Response
from app import db
from app.models import EncroachmentDetection, ReviewStatus, LandParcel
from app.utils.auth import login_required, admin_required
from app.utils.audit import log_action

detections_bp = Blueprint("detections", __name__)


@detections_bp.route("", methods=["GET"])
@login_required
def list_detections():
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    status_filter = request.args.get("status", "").strip()
    parcel_filter = request.args.get("parcel_id", "").strip()
    severity_filter = request.args.get("severity", "").strip()

    q = EncroachmentDetection.query

    if status_filter:
        try:
            q = q.filter(EncroachmentDetection.review_status == ReviewStatus(status_filter))
        except ValueError:
            pass
    if parcel_filter:
        q = q.join(LandParcel).filter(LandParcel.parcel_id.ilike(f"%{parcel_filter}%"))
    if severity_filter:
        q = q.filter(EncroachmentDetection.severity == severity_filter)

    pagination = q.order_by(EncroachmentDetection.detected_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "detections": [d.to_dict() for d in pagination.items],
        "total": pagination.total,
        "page": page,
        "pages": pagination.pages,
    })


@detections_bp.route("/<detection_id>", methods=["GET"])
@login_required
def get_detection(detection_id):
    det = EncroachmentDetection.query.get_or_404(detection_id)
    return jsonify(det.to_dict())


@detections_bp.route("/<detection_id>/review", methods=["PATCH"])
@admin_required
def review_detection(detection_id):
    det = EncroachmentDetection.query.get_or_404(detection_id)
    data = request.get_json(silent=True) or {}

    old_status = det.review_status.value if det.review_status else None
    status_str = data.get("review_status", "")
    try:
        det.review_status = ReviewStatus(status_str)
    except ValueError:
        return jsonify({"error": f"Invalid status. Valid: {[s.value for s in ReviewStatus]}"}), 422

    det.reviewer_id = request.current_user.id
    det.reviewer_notes = data.get("reviewer_notes", det.reviewer_notes)
    det.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Update parcel flag status
    if det.review_status in (ReviewStatus.FALSE_POSITIVE, ReviewStatus.RESOLVED):
        parcel = det.parcel
        if parcel:
            remaining = EncroachmentDetection.query.filter(
                EncroachmentDetection.parcel_id == parcel.id,
                EncroachmentDetection.id != det.id,
                EncroachmentDetection.review_status.notin_([ReviewStatus.FALSE_POSITIVE, ReviewStatus.RESOLVED])
            ).count()
            parcel.is_flagged = remaining > 0

    log_action(request.current_user.id, "DETECTION_REVIEWED", "EncroachmentDetection",
               det.id, {"old_status": old_status, "new_status": status_str})
    db.session.commit()
    return jsonify(det.to_dict())


@detections_bp.route("/run", methods=["POST"])
@admin_required
def run_detection():
    """Trigger encroachment detection on all parcels."""
    from app.services.detection_service import DetectionEngine
    engine = DetectionEngine()
    result = engine.run_detection()
    log_action(request.current_user.id, "DETECTION_RUN", "System", None,
               {"detections_created": result["created"], "parcels_scanned": result["scanned"]})
    db.session.commit()
    return jsonify(result)


@detections_bp.route("/export/csv", methods=["GET"])
@login_required
def export_detections_csv():
    """Export detections as CSV."""
    import csv
    import io
    from flask import Response

    status_filter = request.args.get("status", "").strip()
    severity_filter = request.args.get("severity", "").strip()

    q = EncroachmentDetection.query
    if status_filter:
        try:
            q = q.filter(EncroachmentDetection.review_status == ReviewStatus(status_filter))
        except ValueError:
            pass
    if severity_filter:
        q = q.filter(EncroachmentDetection.severity == severity_filter)

    detections = q.order_by(EncroachmentDetection.detected_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Detection ID", "Parcel ID", "Severity", "Review Status",
        "Registered Area (sqm)", "Observed Area (sqm)", "Overlap Area (sqm)",
        "Area Difference (sqm)", "Area Difference (%)", "Detection Reason",
        "Model Confidence", "Registered Land Use", "Detected Land Use",
        "Detected At", "Reviewer Notes"
    ])
    for d in detections:
        writer.writerow([
            d.id, d.parcel.parcel_id if d.parcel else d.parcel_id,
            d.severity,
            d.review_status.value if d.review_status else "",
            d.registered_area_sqm or "", d.observed_area_sqm or "",
            d.overlap_area_sqm or "", d.area_difference_sqm or "",
            f"{d.area_difference_pct:.2f}" if d.area_difference_pct is not None else "",
            d.detection_reason or "",
            f"{d.model_confidence:.3f}" if d.model_confidence is not None else "",
            d.registered_land_use.value if d.registered_land_use else "",
            d.detected_land_use.value if d.detected_land_use else "",
            d.detected_at.isoformat() if d.detected_at else "",
            d.reviewer_notes or "",
        ])

    log_action(request.current_user.id, "DETECTIONS_CSV_EXPORTED", "EncroachmentDetection", None,
               {"count": len(detections)})

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=landguard_detections.csv"}
    )
