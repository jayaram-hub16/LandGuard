"""
Datasets API Blueprint — /api/datasets
"""
import os
import json
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from app import db
from app.models import Dataset, DatasetStatus
from app.utils.auth import login_required, admin_required
from app.utils.audit import log_action
from app.services.gis_service import validate_geojson, parse_geojson_features

datasets_bp = Blueprint("datasets", __name__)

ALLOWED = {"geojson", "json", "csv"}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED


@datasets_bp.route("", methods=["GET"])
@login_required
def list_datasets():
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 50)
    pagination = Dataset.query.order_by(Dataset.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "datasets": [d.to_dict() for d in pagination.items],
        "total": pagination.total,
        "page": page,
        "pages": pagination.pages,
    })


@datasets_bp.route("/<dataset_id>", methods=["GET"])
@login_required
def get_dataset(dataset_id):
    ds = Dataset.query.get_or_404(dataset_id)
    return jsonify(ds.to_dict())


@datasets_bp.route("", methods=["POST"])
@admin_required
def upload_dataset():
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    name = request.form.get("name", file.filename)
    description = request.form.get("description", "")

    if not file or file.filename == "":
        return jsonify({"error": "Empty filename."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": f"File type not allowed. Supported: {ALLOWED}"}), 422

    # Enforce size limit
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    max_size = current_app.config.get("MAX_CONTENT_LENGTH", 50 * 1024 * 1024)
    if size > max_size:
        return jsonify({"error": "File too large."}), 413

    filename = secure_filename(file.filename or "")
    upload_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)

    # Prevent path traversal
    if not os.path.abspath(filepath).startswith(os.path.abspath(upload_dir)):
        return jsonify({"error": "Invalid file path."}), 400

    file.save(filepath)

    ds = Dataset(
        name=name,
        description=description,
        file_path=filepath,
        file_type=filename.rsplit(".", 1)[1].lower(),
        file_size_bytes=size,
        status=DatasetStatus.VALIDATING,
        uploaded_by=request.current_user.id,
    )
    db.session.add(ds)
    db.session.flush()

    # Validate content
    errors, feature_count, crs = _validate_file(filepath, ds.file_type)
    if errors:
        ds.status = DatasetStatus.INVALID
        ds.validation_errors = json.dumps(errors)
    else:
        ds.status = DatasetStatus.VALID
        ds.feature_count = feature_count
        ds.crs = crs

    log_action(request.current_user.id, "DATASET_UPLOADED", "Dataset", ds.id,
               {"name": name, "status": ds.status.value})
    db.session.commit()
    return jsonify(ds.to_dict()), 201


def _validate_file(filepath, file_type):
    errors = []
    feature_count = 0
    crs = "EPSG:4326"
    try:
        if file_type in ("geojson", "json"):
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            errs, count = validate_geojson(data)
            errors.extend(errs)
            feature_count = count
        elif file_type == "csv":
            import csv
            with open(filepath, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            feature_count = len(rows)
            if feature_count == 0:
                errors.append("CSV file has no data rows.")
    except json.JSONDecodeError as e:
        errors.append(f"Invalid JSON: {e}")
    except Exception as e:
        errors.append(f"File validation error: {e}")
    return errors, feature_count, crs
