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
    allowed_origins = app.config.get("CORS_ORIGINS", ["http://localhost:5173"])
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

    # Health check
    @app.route("/api/health")
    def health():
        return {"status": "ok", "service": "LandGuard API", "version": "1.0.0"}

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
        db.create_all()   # Additive — never drops existing tables or data

    return app


def _configure_logging(app):
    """Configure application logging."""
    if not app.debug:
        if not os.path.exists("logs"):
            os.mkdir("logs")
        handler = RotatingFileHandler(
            "logs/landguard.log", maxBytes=10_485_760, backupCount=10
        )
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]"
        ))
        handler.setLevel(logging.INFO)
        app.logger.addHandler(handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info("LandGuard startup")
