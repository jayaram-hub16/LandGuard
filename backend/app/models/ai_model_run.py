"""
AIModelRun — SQLAlchemy model for tracking AI & GIS model runs.
Stores input parameters, output summary, result GeoJSON and status for each run.
"""
import json
import uuid
from datetime import datetime, timezone

from app import db


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _generate_uuid():
    return str(uuid.uuid4())


class AIModelRun(db.Model):
    """
    Records each execution of an AI or GIS model.
    Result GeoJSON is stored as text to avoid large column bloat in the main row;
    retrieve selectively via to_dict(include_geojson=True).
    """
    __tablename__ = "ai_model_runs"

    id              = db.Column(db.String(36),   primary_key=True, default=_generate_uuid)
    model_name      = db.Column(db.String(50),   nullable=False, index=True)
    status          = db.Column(db.String(20),   nullable=False, default="pending")
    # status values: pending | processing | completed | failed

    input_params    = db.Column(db.Text)         # JSON — never store secrets
    output_summary  = db.Column(db.Text)         # JSON summary of results
    result_geojson  = db.Column(db.Text)         # GeoJSON FeatureCollection (large)

    confidence      = db.Column(db.Float)        # Average or overall confidence score
    error_message   = db.Column(db.Text)         # Only populated when status = failed

    started_at      = db.Column(db.DateTime,     default=_utcnow)
    completed_at    = db.Column(db.DateTime)

    created_by      = db.Column(db.String(36),   db.ForeignKey("users.id"), nullable=True)
    creator         = db.relationship("User",    foreign_keys=[created_by])

    report_path     = db.Column(db.String(512))  # Optional: path to generated report file

    def to_dict(self, include_geojson: bool = False) -> dict:
        d = {
            "id":              self.id,
            "model_name":      self.model_name,
            "status":          self.status,
            "confidence":      self.confidence,
            "error_message":   self.error_message,
            "started_at":      self.started_at.isoformat() if self.started_at else None,
            "completed_at":    self.completed_at.isoformat() if self.completed_at else None,
            "created_by":      self.created_by,
            "creator_name":    self.creator.full_name if self.creator else None,
            "report_path":     self.report_path,
            "input_params":    json.loads(self.input_params) if self.input_params else None,
            "output_summary":  json.loads(self.output_summary) if self.output_summary else None,
        }
        if include_geojson and self.result_geojson:
            try:
                d["result_geojson"] = json.loads(self.result_geojson)
            except (json.JSONDecodeError, TypeError):
                d["result_geojson"] = None
        return d

    def __repr__(self):
        return f"<AIModelRun {self.model_name} [{self.status}] {self.id[:8]}>"

