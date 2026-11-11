"""
Notification Model — in-app notification records for LandGuard users.
Every notification is linked to a user and optionally to a detection, case, or parcel.
Notifications are created by the system; users can mark them as read.
"""
from app import db
from app.models import generate_uuid, utcnow


class Notification(db.Model):
    """
    In-app notification delivered to a specific user.
    Not a legal notice. For informational purposes only.
    """
    __tablename__ = "notifications"

    id              = db.Column(db.String(36),  primary_key=True, default=generate_uuid)
    user_id         = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=False, index=True)

    # Notification content
    title           = db.Column(db.String(255), nullable=False)
    message         = db.Column(db.Text,        nullable=False)
    notification_type = db.Column(db.String(50), nullable=False, default="info")
    # types: "detection_alert", "case_update", "survey_assigned", "complaint_update", "info"

    # Related entities (all optional)
    detection_id    = db.Column(db.String(36),  nullable=True)
    case_id         = db.Column(db.String(36),  nullable=True)
    parcel_id       = db.Column(db.String(36),  nullable=True)   # human-readable parcel_id string

    # Incident reference (unique per detection event)
    incident_ref    = db.Column(db.String(50),  nullable=True, index=True)

    # State
    is_read         = db.Column(db.Boolean,     default=False, nullable=False)
    read_at         = db.Column(db.DateTime,    nullable=True)

    created_at      = db.Column(db.DateTime,    default=utcnow, index=True)

    # Relationship
    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self):
        return {
            "id":                   self.id,
            "user_id":              self.user_id,
            "title":                self.title,
            "message":              self.message,
            "notification_type":    self.notification_type,
            "detection_id":         self.detection_id,
            "case_id":              self.case_id,
            "parcel_id":            self.parcel_id,
            "incident_ref":         self.incident_ref,
            "is_read":              self.is_read,
            "read_at":              self.read_at.isoformat() if self.read_at else None,
            "created_at":           self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Notification {self.id} → user={self.user_id} type={self.notification_type}>"

