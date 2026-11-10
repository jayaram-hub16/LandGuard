"""
Secure File Upload API Blueprint — /api/uploads
Handles case evidence and complaint attachments.
Uploaded files are stored in a sandboxed upload directory.
"""
import os
import uuid
import re
from flask import Blueprint, request, jsonify, send_file, current_app
from app import db
from app.models import CaseEvidence, Complaint, Case
from app.utils.auth import login_required
from app.utils.audit import log_action

uploads_bp = Blueprint("uploads", __name__)

# Allowed MIME types for uploaded evidence/attachments
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/tiff",
    "application/pdf",
    "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",        # xlsx
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB per file


def _safe_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal."""
    filename = re.sub(r"[^a-zA-Z0-9._\-]", "_", os.path.basename(filename))
    return filename[:120]  # limit length


def _get_upload_dir(subfolder: str) -> str:
    base = current_app.config.get("UPLOAD_FOLDER", "uploads")
    path = os.path.join(base, subfolder)
    os.makedirs(path, exist_ok=True)
    return path


@uploads_bp.route("/case-evidence/<case_id>", methods=["POST"])
@login_required
def upload_case_evidence(case_id):
    """
    Upload a file as evidence for a case.
    Multipart form: file (required), evidence_type, description,
    coordinates_lat, coordinates_lng, capture_date.
    """
    from app.models import UserRole

    case = Case.query.get_or_404(case_id)
    user = request.current_user

    # Access control: admin, reviewer, or the assigned surveyor
    allowed = (
        user.role.value in (UserRole.ADMIN.value, UserRole.REVIEWER.value) or
        case.assigned_surveyor == user.id
    )
    if not allowed:
        return jsonify({"error": "Access denied."}), 403

    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    if file.filename == "" or not file.filename:
        return jsonify({"error": "No file selected."}), 400

    # Check MIME type
    mime = file.mimetype or "application/octet-stream"
    if mime not in ALLOWED_TYPES:
        return jsonify({"error": f"File type '{mime}' is not allowed."}), 415

    # Read and check size
    content = file.read()
    if len(content) > MAX_FILE_SIZE:
        return jsonify({"error": "File exceeds 10 MB limit."}), 413

    safe_name = _safe_filename(file.filename or "")
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    upload_dir = _get_upload_dir("case_evidence")
    file_path = os.path.join(upload_dir, unique_name)

    with open(file_path, "wb") as f:
        f.write(content)

    ev = CaseEvidence(
        case_id         = case.id,
        submitted_by    = user.id,
        evidence_type   = request.form.get("evidence_type", "photo"),
        file_path       = file_path,
        file_name       = safe_name,
        file_mime       = mime,
        description     = request.form.get("description", ""),
        coordinates_lat = _float(request.form.get("coordinates_lat")),
        coordinates_lng = _float(request.form.get("coordinates_lng")),
    )
    db.session.add(ev)
    log_action(user.id, "EVIDENCE_FILE_UPLOADED", "Case", case.id,
               {"file_name": safe_name, "mime": mime, "case_number": case.case_number})
    db.session.commit()
    return jsonify(ev.to_dict()), 201


@uploads_bp.route("/case-evidence/download/<evidence_id>", methods=["GET"])
@login_required
def download_evidence(evidence_id):
    """Download an evidence file. Access-controlled."""
    from app.models import UserRole

    ev = CaseEvidence.query.get_or_404(evidence_id)
    case = Case.query.get(ev.case_id)
    user = request.current_user

    allowed = (
        user.role.value in (UserRole.ADMIN.value, UserRole.REVIEWER.value) or
        (case and case.assigned_surveyor == user.id)
    )
    if not allowed:
        return jsonify({"error": "Access denied."}), 403

    if not ev.file_path or not os.path.exists(ev.file_path):
        return jsonify({"error": "File not found on server."}), 404

    log_action(user.id, "EVIDENCE_DOWNLOADED", "CaseEvidence", ev.id, {})
    return send_file(
        ev.file_path,
        mimetype=ev.file_mime or "application/octet-stream",
        as_attachment=True,
        download_name=ev.file_name or "evidence_file",
    )


@uploads_bp.route("/complaint-attachment/<complaint_id>", methods=["POST"])
def upload_complaint_attachment(complaint_id):
    """
    Upload an attachment for a public complaint (no auth required, matches complaint portal).
    Strict limits apply.
    """
    complaint = Complaint.query.get_or_404(complaint_id)

    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    mime = file.mimetype or "application/octet-stream"
    if mime not in ALLOWED_TYPES:
        return jsonify({"error": f"File type '{mime}' is not allowed."}), 415

    content = file.read()
    if len(content) > 5 * 1024 * 1024:  # 5 MB for complaint attachments
        return jsonify({"error": "File exceeds 5 MB limit."}), 413

    safe_name = _safe_filename(file.filename or "")
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    upload_dir = _get_upload_dir("complaint_attachments")
    file_path = os.path.join(upload_dir, unique_name)

    with open(file_path, "wb") as f:
        f.write(content)

    # Store attachment path in complaint admin_notes (append)
    existing = complaint.admin_notes or ""
    complaint.admin_notes = (existing + f"\n[ATTACHMENT] {safe_name} → {file_path}").strip()
    db.session.commit()

    return jsonify({
        "message": "Attachment uploaded successfully.",
        "file_name": safe_name,
        "ack_number": complaint.ack_number,
    }), 201


def _float(val):
    try:
        return float(val) if val else None
    except (ValueError, TypeError):
        return None

