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

    # Log SMTP env var presence at startup (never log values)
    _smtp_vars = ["SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD",
                  "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "MAIL_SERVER",
                  "MAIL_USERNAME", "MAIL_PASSWORD", "MAIL_USE_TLS"]
    _smtp_present = [v for v in _smtp_vars if os.environ.get(v, "").strip()]
    _smtp_missing = [v for v in _smtp_vars if not os.environ.get(v, "").strip()]
    logging.getLogger(__name__).info(
        "STARTUP SMTP env vars — present: %s | missing: %s | env: %s",
        _smtp_present, _smtp_missing, config_name
    )

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

    # Root homepage / health-check route
    @app.route("/")
    def index():
        from flask import jsonify
        return jsonify({
            "status": "healthy",
            "application": "LandGuard",
            "message": "LandGuard backend is running successfully"
        }), 200

    # Favicon route returning 204 No Content
    @app.route("/favicon.ico")
    def favicon():
        from flask import Response
        return Response(status=204)

    # Health check
    @app.route("/api/health")
    def health():
        return {"status": "ok", "service": "LandGuard API", "version": "1.0.0"}

    # ── Serve optional static frontend assets (if dist/ exists) ─────────────
    _backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _frontend_dist = os.path.normpath(os.path.join(_backend_dir, "..", "frontend", "dist"))
    if not os.path.isdir(_frontend_dist):
        _alt_dist = os.path.normpath(os.path.join(os.getcwd(), "frontend", "dist"))
        if os.path.isdir(_alt_dist):
            _frontend_dist = _alt_dist

    if os.path.isdir(_frontend_dist):
        from flask import send_from_directory

        @app.route("/<path:path>")
        def serve_frontend_assets(path):
            if path.startswith("api/"):
                from flask import jsonify
                return jsonify({"error": "Not found"}), 404
            full = os.path.join(_frontend_dist, path)
            if os.path.exists(full):
                return send_from_directory(_frontend_dist, path)
            from flask import jsonify
            return jsonify({"error": "Not found"}), 404

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

        # Optional admin bootstrap on startup if configured via environment variables
        admin_bootstrap_email = (
            os.environ.get("ADMIN_BOOTSTRAP_EMAIL")
            or app.config.get("ADMIN_BOOTSTRAP_EMAIL")
            or ""
        ).strip()
        admin_bootstrap_pwd = (
            os.environ.get("ADMIN_BOOTSTRAP_PASSWORD")
            or app.config.get("ADMIN_BOOTSTRAP_PASSWORD")
            or ""
        ).strip()
        admin_bootstrap_name = (
            os.environ.get("ADMIN_BOOTSTRAP_NAME")
            or "Jayaram"
        ).strip()

        if admin_bootstrap_email and admin_bootstrap_pwd and len(admin_bootstrap_pwd) >= 8:
            try:
                from app.models import User, UserRole, UserStatus
                from app.utils.auth import hash_password

                existing_admin = User.query.filter_by(email=admin_bootstrap_email).first()
                if existing_admin:
                    existing_admin.password_hash = hash_password(admin_bootstrap_pwd)
                    existing_admin.full_name = admin_bootstrap_name
                    existing_admin.role = UserRole.ADMIN
                    existing_admin.status = UserStatus.ACTIVE
                    db.session.commit()
                    app.logger.info("Admin bootstrap: updated %s", admin_bootstrap_email)
                else:
                    new_admin = User(
                        email=admin_bootstrap_email,
                        password_hash=hash_password(admin_bootstrap_pwd),
                        full_name=admin_bootstrap_name,
                        role=UserRole.ADMIN,
                        status=UserStatus.ACTIVE,
                    )
                    db.session.add(new_admin)
                    db.session.commit()
                    app.logger.info("Admin bootstrap: created %s", admin_bootstrap_email)
            except Exception as exc:
                db.session.rollback()
                app.logger.error("Admin bootstrap error: %s", str(exc))

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


def __getattr__(name):
    """
    Support WSGI servers (Gunicorn) configured with 'gunicorn app:app'.
    Lazily creates and returns the Flask application instance on attribute access.
    """
    if name == "app":
        global _lazy_app
        if "_lazy_app" not in globals():
            _lazy_app = create_app()
        return _lazy_app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
