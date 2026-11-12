"""
LandGuard - GIS-Based Land Encroachment Detection System
Flask Application Factory
"""
import os
import logging
from logging.handlers import RotatingFileHandler
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_login import LoginManager

# Initialize extensions
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()


def create_app(config_name=None):
    """Application factory pattern."""
    app = Flask(__name__)

    # Load configuration
    config_name = config_name or os.environ.get("FLASK_ENV", "development")
    from app.config import config_map
    app.config.from_object(config_map.get(config_name, config_map["development"]))

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # CORS configuration
    import re
    configured_origins = app.config.get("CORS_ORIGINS", ["http://localhost:5173"])
    allowed_origins = [o for o in configured_origins if isinstance(o, str) and o]
    # Automatically permit Vercel domains (*.vercel.app)
    allowed_origins.append(re.compile(r"^https://[a-zA-Z0-9._-]+\.vercel\.app$"))
    CORS(app, origins=allowed_origins, supports_credentials=True,
         allow_headers=["Content-Type", "Authorization"],
         methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])

    # Configure logging
    _configure_logging(app)

    # Register blueprints
    from app.api.auth import auth_bp
    from app.api.parcels import parcels_bp
    from app.api.datasets import datasets_bp
    from app.api.classification import classification_bp
    from app.api.detections import detections_bp
    from app.api.admin import admin_bp
    from app.api.reports import reports_bp
    from app.api.cases import cases_bp
    from app.api.surveys import surveys_bp
    from app.api.complaints import complaints_bp
    from app.api.uploads import uploads_bp
    from app.api.notifications import notifications_bp
    from app.api.ai_models import ai_models_bp

    app.register_blueprint(auth_bp,           url_prefix="/api/auth")
    app.register_blueprint(parcels_bp,        url_prefix="/api/parcels")
    app.register_blueprint(datasets_bp,       url_prefix="/api/datasets")
    app.register_blueprint(classification_bp, url_prefix="/api/classification")
    app.register_blueprint(detections_bp,     url_prefix="/api/detections")
    app.register_blueprint(admin_bp,          url_prefix="/api/admin")
    app.register_blueprint(reports_bp,        url_prefix="/api/reports")
    app.register_blueprint(cases_bp,          url_prefix="/api/cases")
    app.register_blueprint(surveys_bp,        url_prefix="/api/surveys")
    app.register_blueprint(complaints_bp,     url_prefix="/api/complaints")
    app.register_blueprint(uploads_bp,        url_prefix="/api/uploads")
    app.register_blueprint(notifications_bp,  url_prefix="/api/notifications")
    app.register_blueprint(ai_models_bp,     url_prefix="/api/ai-models")

    # Health check
    @app.route("/api/health")
    def health():
        return {"status": "ok", "service": "LandGuard API", "version": "1.0.0"}

    # ── Serve React frontend in production ──────────────────────────────────
    # In production Flask serves the Vite-built dist/ as static files so that
    # a single Render web service handles both the API and the React SPA.
    # In development, Vite's dev-server + proxy handles this instead.
    _backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _frontend_dist = os.path.normpath(os.path.join(_backend_dir, "..", "frontend", "dist"))
    if not os.path.isdir(_frontend_dist):
        _alt_dist = os.path.normpath(os.path.join(os.getcwd(), "frontend", "dist"))
        if os.path.isdir(_alt_dist):
            _frontend_dist = _alt_dist

    if os.path.isdir(_frontend_dist):
        from flask import send_from_directory

        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_frontend(path):
            # Let API routes fall through to their own blueprints
            if path.startswith("api/"):
                from flask import jsonify
                return jsonify({"error": "Not found"}), 404
            full = os.path.join(_frontend_dist, path)
            if path and os.path.exists(full):
                return send_from_directory(_frontend_dist, path)
            # SPA fallback: serve index.html for all unknown client-side routes
            return send_from_directory(_frontend_dist, "index.html")

    # Import models to register with SQLAlchemy, then ensure all tables exist.
    # db.create_all() is idempotent: it skips tables that already exist, so
    # existing data is never lost.
    with app.app_context():
        from app.models import user, parcel, detection, dataset, report, audit  # noqa
        # Import new models so SQLAlchemy registers them before create_all()
        from app.models import (
            Case, CaseHistory, CaseEvidence,    # noqa
            FieldSurvey, Complaint,             # noqa
            ParcelBoundaryHistory               # noqa
        )
        from app.models.notification import Notification  # noqa
        from app.models.ai_model_run import AIModelRun    # noqa
        db.create_all()   # Additive — never drops existing tables or data

    return app


def _configure_logging(app):
    """Configure application logging for cloud stdout and optional file."""
    import sys
    log_format = logging.Formatter(
        "%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]"
    )
    # Cloud stdout handler (Render log stream)
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(log_format)
    stdout_handler.setLevel(logging.INFO)
    app.logger.addHandler(stdout_handler)
    app.logger.setLevel(logging.INFO)

    if not app.debug:
        try:
            base_dir = app.config.get("BASE_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            logs_dir = os.path.join(base_dir, "logs")
            os.makedirs(logs_dir, exist_ok=True)
            file_handler = RotatingFileHandler(
                os.path.join(logs_dir, "landguard.log"), maxBytes=10_485_760, backupCount=10
            )
            file_handler.setFormatter(log_format)
            file_handler.setLevel(logging.INFO)
            app.logger.addHandler(file_handler)
        except Exception:
            pass  # stdout is primary in production containers

    app.logger.info("LandGuard startup")
