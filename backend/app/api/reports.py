"""
Reports API Blueprint — /api/reports
"""
import os
import json
from flask import Blueprint, request, jsonify, send_file, current_app
from app import db
from app.models import Report, LandParcel, EncroachmentDetection
from app.utils.auth import login_required, admin_required
from app.utils.audit import log_action
from app.services.report_service import generate_pdf_report, generate_csv_report

reports_bp = Blueprint("reports", __name__)


@reports_bp.route("", methods=["GET"])
@login_required
def list_reports():
    user = request.current_user
    q = Report.query
    if not user.is_admin():
        q = q.filter_by(created_by=user.id)
    reports = q.order_by(Report.created_at.desc()).all()
    return jsonify({"reports": [r.to_dict() for r in reports]})


@reports_bp.route("", methods=["POST"])
@login_required
def create_report():
    data = request.get_json(silent=True) or {}
    report_type = data.get("report_type", "detection_summary")
    fmt = data.get("format", "pdf").lower()
    title = data.get("title", f"LandGuard {report_type.replace('_', ' ').title()} Report")
    filters = data.get("filters", {})

    if fmt not in ("pdf", "csv"):
        return jsonify({"error": "Format must be 'pdf' or 'csv'."}), 422

    output_dir = current_app.config.get("REPORTS_FOLDER", "reports_output")
    os.makedirs(output_dir, exist_ok=True)

    report = Report(
        title=title,
        report_type=report_type,
        format=fmt,
        filters_applied=json.dumps(filters),
        created_by=request.current_user.id,
    )
    db.session.add(report)
    db.session.flush()

    try:
        if fmt == "pdf":
            path = generate_pdf_report(report, output_dir, filters)
        else:
            path = generate_csv_report(report, output_dir, filters)
        report.file_path = path
    except Exception as e:
        report.file_path = None
        current_app.logger.error(f"Report generation failed: {e}")

    log_action(request.current_user.id, "REPORT_GENERATED", "Report", report.id,
               {"type": report_type, "format": fmt})
    db.session.commit()
    return jsonify(report.to_dict()), 201


@reports_bp.route("/<report_id>/download", methods=["GET"])
@login_required
def download_report(report_id):
    report = Report.query.get_or_404(report_id)
    user = request.current_user

    # Enforce access control
    if not user.is_admin() and report.created_by != user.id:
        return jsonify({"error": "Access denied."}), 403

    if not report.file_path or not os.path.exists(report.file_path):
        return jsonify({"error": "Report file not found."}), 404

    mime = "application/pdf" if report.format == "pdf" else "text/csv"
    return send_file(
        report.file_path,
        mimetype=mime,
        as_attachment=True,
        download_name=f"landguard_{report.report_type}_{report.id[:8]}.{report.format}",
    )
