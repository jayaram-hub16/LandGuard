"""
LandGuard OOP Data Models — SQLAlchemy ORM
All models use clear OOP design with encapsulated behavior.
"""
import uuid
import json
from datetime import datetime, timezone
from enum import Enum as PyEnum

from app import db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def generate_uuid():
    return str(uuid.uuid4())


# ─────────────────────────────────────────────
# Enumerations
# ─────────────────────────────────────────────

class UserRole(PyEnum):
    USER      = "USER"
    ADMIN     = "ADMIN"
    SURVEYOR  = "SURVEYOR"
    REVIEWER  = "REVIEWER"
    CITIZEN   = "CITIZEN"


class UserStatus(PyEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class LandUseCategory(PyEnum):
    RESIDENTIAL = "Residential"
    COMMERCIAL = "Commercial"
    AGRICULTURE = "Agriculture"
    ROAD = "Road"
    WATER_BODY = "Water Body"
    FOREST = "Forest"
    INDUSTRIAL = "Industrial"
    OTHER = "Other"
    UNKNOWN = "Unknown"


class ReviewStatus(PyEnum):
    PENDING = "Pending Review"
    UNDER_INVESTIGATION = "Under Investigation"
    VERIFIED = "Verified by Authorized Surveyor"
    FALSE_POSITIVE = "False Positive"
    RESOLVED = "Resolved"


class DatasetStatus(PyEnum):
    UPLOADING = "Uploading"
    VALIDATING = "Validating"
    VALID = "Valid"
    INVALID = "Invalid"
    PROCESSING = "Processing"
    PROCESSED = "Processed"
    FAILED = "Failed"


# ─────────────────────────────────────────────
# User Model
# ─────────────────────────────────────────────

class User(db.Model):
    """Represents a LandGuard system user with role-based access."""
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(512), nullable=False)
    full_name = db.Column(db.String(255), nullable=False)
    organization = db.Column(db.String(255))
    role = db.Column(db.Enum(UserRole), nullable=False, default=UserRole.USER)
    status = db.Column(db.Enum(UserStatus), nullable=False, default=UserStatus.ACTIVE)
    last_login = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    audit_logs = db.relationship("AuditLog", backref="actor", lazy="dynamic",
                                  foreign_keys="AuditLog.actor_id")
    reports = db.relationship("Report", backref="creator", lazy="dynamic")

    def is_admin(self):
        return self.role == UserRole.ADMIN

    def is_active(self):
        return self.status == UserStatus.ACTIVE

    def to_dict(self, include_sensitive=False):
        d = {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "organization": self.organization,
            "role": self.role.value,
            "status": self.status.value,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        return d

    def __repr__(self):
        return f"<User {self.email} [{self.role.value}]>"


# ─────────────────────────────────────────────
# Ownership Record Model
# ─────────────────────────────────────────────

class OwnershipRecord(db.Model):
    """Represents ownership metadata for a land parcel. Simulated data only."""
    __tablename__ = "ownership_records"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    owner_name = db.Column(db.String(255), nullable=False)
    owner_reference = db.Column(db.String(100), unique=True, nullable=False, index=True)
    contact_email = db.Column(db.String(255))
    contact_phone = db.Column(db.String(50))
    registration_reference = db.Column(db.String(100))
    registered_date = db.Column(db.Date)
    notes = db.Column(db.Text)
    is_simulated = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    parcels = db.relationship("LandParcel", backref="owner", lazy="dynamic")

    def to_dict(self, admin_view=False):
        d = {
            "id": self.id,
            "owner_name": self.owner_name,
            "owner_reference": self.owner_reference,
            "registration_reference": self.registration_reference,
            "registered_date": self.registered_date.isoformat() if self.registered_date else None,
            "is_simulated": self.is_simulated,
            "notes": self.notes,
            "parcel_count": self.parcels.count(),
        }
        if admin_view:
            d["contact_email"] = self.contact_email
            d["contact_phone"] = self.contact_phone
        return d


# ─────────────────────────────────────────────
# Land Parcel Model
# ─────────────────────────────────────────────

class LandParcel(db.Model):
    """
    Core domain object. Represents a registered land parcel with boundary geometry.
    OOP: Encapsulates spatial and ownership logic.
    """
    __tablename__ = "land_parcels"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    parcel_id = db.Column(db.String(100), unique=True, nullable=False, index=True)
    ownership_id = db.Column(db.String(36), db.ForeignKey("ownership_records.id"), nullable=True)
    dataset_id = db.Column(db.String(36), db.ForeignKey("datasets.id"), nullable=True)

    # Spatial attributes
    registered_area_sqm = db.Column(db.Float)
    boundary_geojson = db.Column(db.Text)        # GeoJSON string of registered boundary
    centroid_lat = db.Column(db.Float)
    centroid_lng = db.Column(db.Float)

    # Administrative
    administrative_area = db.Column(db.String(255))
    district = db.Column(db.String(255))
    state = db.Column(db.String(255))
    address = db.Column(db.Text)

    # Classification
    registered_land_use = db.Column(db.Enum(LandUseCategory), default=LandUseCategory.UNKNOWN)
    observed_land_use = db.Column(db.Enum(LandUseCategory), default=LandUseCategory.UNKNOWN)

    # Status
    review_status = db.Column(db.String(50), default="Active")
    is_flagged = db.Column(db.Boolean, default=False)
    is_simulated = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    detections = db.relationship("EncroachmentDetection", backref="parcel", lazy="dynamic",
                                  cascade="all, delete-orphan")

    def get_boundary(self):
        """Return parsed GeoJSON boundary or None."""
        if self.boundary_geojson:
            try:
                return json.loads(self.boundary_geojson)
            except (json.JSONDecodeError, TypeError):
                return None
        return None

    def has_encroachment(self):
        """Check if any active encroachment is flagged."""
        return self.detections.filter(
            EncroachmentDetection.review_status != ReviewStatus.FALSE_POSITIVE,
            EncroachmentDetection.review_status != ReviewStatus.RESOLVED
        ).count() > 0

    def to_dict(self, include_geometry=True):
        d = {
            "id": self.id,
            "parcel_id": self.parcel_id,
            "ownership_id": self.ownership_id,
            "owner": self.owner.to_dict() if self.owner else None,
            "registered_area_sqm": self.registered_area_sqm,
            "centroid_lat": self.centroid_lat,
            "centroid_lng": self.centroid_lng,
            "administrative_area": self.administrative_area,
            "district": self.district,
            "state": self.state,
            "address": self.address,
            "registered_land_use": self.registered_land_use.value if self.registered_land_use else None,
            "observed_land_use": self.observed_land_use.value if self.observed_land_use else None,
            "review_status": self.review_status,
            "is_flagged": self.is_flagged,
            "is_simulated": self.is_simulated,
            "detection_count": self.detections.count(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_geometry:
            d["boundary_geojson"] = self.get_boundary()
        return d

    def __repr__(self):
        return f"<LandParcel {self.parcel_id}>"


# ─────────────────────────────────────────────
# Dataset Model
# ─────────────────────────────────────────────

class Dataset(db.Model):
    """Represents an uploaded GIS dataset for processing."""
    __tablename__ = "datasets"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    file_path = db.Column(db.String(512))
    file_type = db.Column(db.String(50))
    file_size_bytes = db.Column(db.Integer)
    feature_count = db.Column(db.Integer, default=0)
    status = db.Column(db.Enum(DatasetStatus), default=DatasetStatus.UPLOADING)
    validation_errors = db.Column(db.Text)
    crs = db.Column(db.String(100))
    uploaded_by = db.Column(db.String(36), db.ForeignKey("users.id"))
    processed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow)

    # Relationships
    parcels = db.relationship("LandParcel", backref="dataset", lazy="dynamic")
    detections = db.relationship("EncroachmentDetection", backref="dataset", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "file_type": self.file_type,
            "file_size_bytes": self.file_size_bytes,
            "feature_count": self.feature_count,
            "status": self.status.value if self.status else None,
            "validation_errors": self.validation_errors,
            "crs": self.crs,
            "uploaded_by": self.uploaded_by,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ─────────────────────────────────────────────
# Encroachment Detection Model
# ─────────────────────────────────────────────

class EncroachmentDetection(db.Model):
    """
    Preliminary encroachment finding. NOT proof of illegal activity.
    Requires verification by an authorized surveyor.
    """
    __tablename__ = "encroachment_detections"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    parcel_id = db.Column(db.String(36), db.ForeignKey("land_parcels.id"), nullable=False)
    dataset_id = db.Column(db.String(36), db.ForeignKey("datasets.id"), nullable=True)

    # Spatial analysis results
    registered_area_sqm = db.Column(db.Float)
    observed_area_sqm = db.Column(db.Float)
    overlap_area_sqm = db.Column(db.Float)
    area_difference_sqm = db.Column(db.Float)
    area_difference_pct = db.Column(db.Float)

    # Classification
    detected_land_use = db.Column(db.Enum(LandUseCategory), default=LandUseCategory.UNKNOWN)
    registered_land_use = db.Column(db.Enum(LandUseCategory), default=LandUseCategory.UNKNOWN)

    # Detection metadata
    detection_reason = db.Column(db.Text, nullable=False)
    model_confidence = db.Column(db.Float)
    encroachment_boundary_geojson = db.Column(db.Text)

    # Review workflow
    review_status = db.Column(db.Enum(ReviewStatus), default=ReviewStatus.PENDING)
    reviewer_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    reviewer_notes = db.Column(db.Text)
    reviewed_at = db.Column(db.DateTime)

    # Flag severity
    severity = db.Column(db.String(20), default="Medium")  # Low/Medium/High/Critical

    detected_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    # Reviewer relationship
    reviewer = db.relationship("User", foreign_keys=[reviewer_id])

    DISCLAIMER = (
        "PRELIMINARY FINDING — This is an automated geometric analysis result. "
        "It does NOT constitute proof of illegal encroachment or establish legal ownership. "
        "All findings require verification by an authorized surveyor."
    )

    def to_dict(self):
        return {
            "id": self.id,
            "parcel_id": self.parcel_id,
            "dataset_id": self.dataset_id,
            "registered_area_sqm": self.registered_area_sqm,
            "observed_area_sqm": self.observed_area_sqm,
            "overlap_area_sqm": self.overlap_area_sqm,
            "area_difference_sqm": self.area_difference_sqm,
            "area_difference_pct": self.area_difference_pct,
            "detected_land_use": self.detected_land_use.value if self.detected_land_use else None,
            "registered_land_use": self.registered_land_use.value if self.registered_land_use else None,
            "detection_reason": self.detection_reason,
            "model_confidence": self.model_confidence,
            "review_status": self.review_status.value if self.review_status else None,
            "reviewer_id": self.reviewer_id,
            "reviewer_notes": self.reviewer_notes,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "severity": self.severity,
            "detected_at": self.detected_at.isoformat() if self.detected_at else None,
            "encroachment_boundary_geojson": (
                json.loads(self.encroachment_boundary_geojson)
                if self.encroachment_boundary_geojson else None
            ),
            "disclaimer": self.DISCLAIMER,
            "parcel": self.parcel.to_dict(include_geometry=False) if self.parcel else None,
        }


# ─────────────────────────────────────────────
# Audit Log Model
# ─────────────────────────────────────────────

class AuditLog(db.Model):
    """Immutable audit record for security-sensitive actions."""
    __tablename__ = "audit_logs"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    actor_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    action = db.Column(db.String(100), nullable=False, index=True)
    entity_type = db.Column(db.String(100))
    entity_id = db.Column(db.String(100))
    details = db.Column(db.Text)  # JSON string, never includes secrets
    ip_address = db.Column(db.String(45))
    timestamp = db.Column(db.DateTime, default=utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "actor_id": self.actor_id,
            "actor_email": self.actor.email if self.actor else "system",
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "details": self.details,
            "ip_address": self.ip_address,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }


# ─────────────────────────────────────────────
# Report Model
# ─────────────────────────────────────────────

class Report(db.Model):
    """Generated report record with access control."""
    __tablename__ = "reports"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    title = db.Column(db.String(255), nullable=False)
    report_type = db.Column(db.String(50))  # parcel_summary, detection_summary, etc.
    format = db.Column(db.String(10))       # pdf, csv
    file_path = db.Column(db.String(512))
    filters_applied = db.Column(db.Text)   # JSON
    created_by = db.Column(db.String(36), db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "report_type": self.report_type,
            "format": self.format,
            "filters_applied": self.filters_applied,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ─────────────────────────────────────────────
# Case Status Enum
# ─────────────────────────────────────────────

class CaseStatus(PyEnum):
    REPORTED           = "Reported"
    UNDER_REVIEW       = "Under Review"
    SURVEY_ASSIGNED    = "Field Survey Assigned"
    SURVEY_SUBMITTED   = "Survey Submitted"
    DECISION_PENDING   = "Decision Pending"
    RESOLVED           = "Resolved"
    DISPUTED           = "Disputed"
    REFERRED_APPEAL    = "Referred for Appeal"


# ─────────────────────────────────────────────
# Case Model
# ─────────────────────────────────────────────

class Case(db.Model):
    """
    Encroachment case with full status-history workflow.
    A public complaint, detected anomaly, or surveyor finding can open a case.
    OOP: encapsulates case lifecycle and assignment logic.
    """
    __tablename__ = "cases"

    id          = db.Column(db.String(36),  primary_key=True, default=generate_uuid)
    case_number = db.Column(db.String(30),  unique=True, nullable=False, index=True)
    title       = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)

    # Links
    parcel_id         = db.Column(db.String(36),  db.ForeignKey("land_parcels.id"), nullable=True)
    detection_id      = db.Column(db.String(36),  db.ForeignKey("encroachment_detections.id"), nullable=True)
    complaint_id      = db.Column(db.String(36),  nullable=True)   # FK to complaints.id (soft)
    opened_by         = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=True)
    assigned_surveyor = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=True)
    assigned_reviewer = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=True)

    # Status & Workflow
    status          = db.Column(db.String(50),  default=CaseStatus.REPORTED.value)
    priority        = db.Column(db.String(20),  default="Medium")  # Low/Medium/High/Critical
    decision_reason = db.Column(db.Text)
    deadline        = db.Column(db.DateTime)
    resolved_at     = db.Column(db.DateTime)

    created_at  = db.Column(db.DateTime, default=utcnow)
    updated_at  = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    parcel       = db.relationship("LandParcel",           foreign_keys=[parcel_id])
    opener       = db.relationship("User",                 foreign_keys=[opened_by])
    surveyor     = db.relationship("User",                 foreign_keys=[assigned_surveyor])
    reviewer_obj = db.relationship("User",                 foreign_keys=[assigned_reviewer])
    history      = db.relationship("CaseHistory",          back_populates="case", order_by="CaseHistory.changed_at",
                                   cascade="all, delete-orphan")
    evidence     = db.relationship("CaseEvidence",         back_populates="case",
                                   cascade="all, delete-orphan")
    surveys      = db.relationship("FieldSurvey",          back_populates="case",
                                   cascade="all, delete-orphan")

    @classmethod
    def generate_case_number(cls):
        import random, string
        suffix = ''.join(random.choices(string.digits, k=6))
        return f"LG-{utcnow().year}-{suffix}"

    def is_overdue(self):
        return self.deadline and utcnow() > self.deadline and self.status not in (
            CaseStatus.RESOLVED.value, CaseStatus.REFERRED_APPEAL.value
        )

    def to_dict(self):
        return {
            "id":               self.id,
            "case_number":      self.case_number,
            "title":            self.title,
            "description":      self.description,
            "parcel_id":        self.parcel_id,
            "parcel":           self.parcel.to_dict(include_geometry=False) if self.parcel else None,
            "detection_id":     self.detection_id,
            "complaint_id":     self.complaint_id,
            "opened_by":        self.opened_by,
            "opener_name":      self.opener.full_name if self.opener else None,
            "assigned_surveyor":self.assigned_surveyor,
            "surveyor_name":    self.surveyor.full_name if self.surveyor else None,
            "assigned_reviewer":self.assigned_reviewer,
            "reviewer_name":    self.reviewer_obj.full_name if self.reviewer_obj else None,
            "status":           self.status,
            "priority":         self.priority,
            "decision_reason":  self.decision_reason,
            "deadline":         self.deadline.isoformat() if self.deadline else None,
            "resolved_at":      self.resolved_at.isoformat() if self.resolved_at else None,
            "is_overdue":       self.is_overdue(),
            "evidence_count":   len(getattr(self, "evidence", [])),
            "created_at":       self.created_at.isoformat() if self.created_at else None,
            "updated_at":       self.updated_at.isoformat() if self.updated_at else None,
        }


# ─────────────────────────────────────────────
# Case History (status changelog)
# ─────────────────────────────────────────────

class CaseHistory(db.Model):
    """Immutable record of each case status transition."""
    __tablename__ = "case_history"

    id          = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    case_id     = db.Column(db.String(36), db.ForeignKey("cases.id"), nullable=False)
    changed_by  = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    old_status  = db.Column(db.String(50))
    new_status  = db.Column(db.String(50), nullable=False)
    notes       = db.Column(db.Text)
    changed_at  = db.Column(db.DateTime, default=utcnow)

    case    = db.relationship("Case",  back_populates="history")
    actor   = db.relationship("User",  foreign_keys=[changed_by])

    def to_dict(self):
        return {
            "id":           self.id,
            "case_id":      self.case_id,
            "changed_by":   self.changed_by,
            "actor_name":   self.actor.full_name if self.actor else "system",
            "old_status":   self.old_status,
            "new_status":   self.new_status,
            "notes":        self.notes,
            "changed_at":   self.changed_at.isoformat() if self.changed_at else None,
        }


# ─────────────────────────────────────────────
# Case Evidence
# ─────────────────────────────────────────────

class CaseEvidence(db.Model):
    """Evidence item attached to a case (photo, doc, coordinates, note)."""
    __tablename__ = "case_evidence"

    id              = db.Column(db.String(36),  primary_key=True, default=generate_uuid)
    case_id         = db.Column(db.String(36),  db.ForeignKey("cases.id"), nullable=False)
    submitted_by    = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=True)
    evidence_type   = db.Column(db.String(50))   # photo, document, coordinates, note, measurement
    file_path       = db.Column(db.String(512))
    file_name       = db.Column(db.String(255))
    file_mime       = db.Column(db.String(100))
    description     = db.Column(db.Text)
    coordinates_lat = db.Column(db.Float)
    coordinates_lng = db.Column(db.Float)
    capture_date    = db.Column(db.Date)
    is_verified     = db.Column(db.Boolean, default=False)
    created_at      = db.Column(db.DateTime, default=utcnow)

    case        = db.relationship("Case", back_populates="evidence")
    submitter   = db.relationship("User", foreign_keys=[submitted_by])

    def to_dict(self):
        return {
            "id":               self.id,
            "case_id":          self.case_id,
            "submitted_by":     self.submitted_by,
            "submitter_name":   self.submitter.full_name if self.submitter else None,
            "evidence_type":    self.evidence_type,
            "file_name":        self.file_name,
            "file_mime":        self.file_mime,
            "description":      self.description,
            "coordinates_lat":  self.coordinates_lat,
            "coordinates_lng":  self.coordinates_lng,
            "capture_date":     self.capture_date.isoformat() if self.capture_date else None,
            "is_verified":      self.is_verified,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
        }


# ─────────────────────────────────────────────
# Field Survey Model
# ─────────────────────────────────────────────

class FieldSurvey(db.Model):
    """
    Surveyor field submission for a case or parcel.
    Supports draft → submitted workflow with offline-safe design.
    """
    __tablename__ = "field_surveys"

    id              = db.Column(db.String(36),  primary_key=True, default=generate_uuid)
    case_id         = db.Column(db.String(36),  db.ForeignKey("cases.id"), nullable=True)
    parcel_id       = db.Column(db.String(36),  db.ForeignKey("land_parcels.id"), nullable=True)
    surveyor_id     = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=False)

    # Survey details
    survey_number       = db.Column(db.String(100))
    survey_date         = db.Column(db.Date)
    status              = db.Column(db.String(20), default="draft")   # draft | submitted | accepted | rejected
    boundary_geojson    = db.Column(db.Text)   # Surveyor-observed boundary
    observed_area_sqm   = db.Column(db.Float)
    measurement_unit    = db.Column(db.String(20), default="sqm")
    accuracy_meters     = db.Column(db.Float)  # GPS accuracy in metres
    centroid_lat        = db.Column(db.Float)
    centroid_lng        = db.Column(db.Float)
    land_use_observed   = db.Column(db.String(100))
    encroachment_found  = db.Column(db.Boolean, default=False)
    notes               = db.Column(db.Text)
    recommendations     = db.Column(db.Text)
    submitted_at        = db.Column(db.DateTime)
    created_at          = db.Column(db.DateTime, default=utcnow)
    updated_at          = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    surveyor    = db.relationship("User",           foreign_keys=[surveyor_id])
    case        = db.relationship("Case",           back_populates="surveys")
    parcel      = db.relationship("LandParcel",     foreign_keys=[parcel_id])

    DISCLAIMER = (
        "FIELD SURVEY REPORT — This is a surveyor's field observation record. "
        "It does NOT constitute a final legal determination of encroachment or ownership."
    )

    def to_dict(self):
        return {
            "id":                   self.id,
            "case_id":              self.case_id,
            "parcel_id":            self.parcel_id,
            "parcel_parcel_id":     self.parcel.parcel_id if self.parcel else None,
            "surveyor_id":          self.surveyor_id,
            "surveyor_name":        self.surveyor.full_name if self.surveyor else None,
            "survey_number":        self.survey_number,
            "survey_date":          self.survey_date.isoformat() if self.survey_date else None,
            "status":               self.status,
            "observed_area_sqm":    self.observed_area_sqm,
            "measurement_unit":     self.measurement_unit,
            "accuracy_meters":      self.accuracy_meters,
            "centroid_lat":         self.centroid_lat,
            "centroid_lng":         self.centroid_lng,
            "land_use_observed":    self.land_use_observed,
            "encroachment_found":   self.encroachment_found,
            "notes":                self.notes,
            "recommendations":      self.recommendations,
            "submitted_at":         self.submitted_at.isoformat() if self.submitted_at else None,
            "created_at":           self.created_at.isoformat() if self.created_at else None,
            "disclaimer":           self.DISCLAIMER,
        }


# ─────────────────────────────────────────────
# Public Complaint Model
# ─────────────────────────────────────────────

class Complaint(db.Model):
    """
    Citizen / landowner complaint about suspected encroachment.
    A complaint is NOT proof of encroachment. It triggers a case if valid.
    """
    __tablename__ = "complaints"

    id              = db.Column(db.String(36),  primary_key=True, default=generate_uuid)
    ack_number      = db.Column(db.String(20),  unique=True, nullable=False, index=True)
    complainant_name= db.Column(db.String(255), nullable=False)
    complainant_email= db.Column(db.String(255))
    complainant_phone= db.Column(db.String(50))
    description     = db.Column(db.Text, nullable=False)
    location_address= db.Column(db.Text)
    location_lat    = db.Column(db.Float)
    location_lng    = db.Column(db.Float)
    parcel_ref      = db.Column(db.String(100))  # optional parcel ID reference from citizen
    status          = db.Column(db.String(50),  default="Submitted")  # Submitted/Acknowledged/Under Review/Resolved
    admin_notes     = db.Column(db.Text)         # Internal notes — not visible to citizen
    case_id         = db.Column(db.String(36),  nullable=True)  # Linked case once opened
    submitted_by    = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=True)  # null = anonymous
    submitted_at    = db.Column(db.DateTime, default=utcnow)
    updated_at      = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    submitter = db.relationship("User", foreign_keys=[submitted_by])

    @classmethod
    def generate_ack_number(cls):
        import random, string
        suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        return f"COMP-{suffix}"

    def to_dict(self, admin_view=False):
        d = {
            "id":               self.id,
            "ack_number":       self.ack_number,
            "complainant_name": self.complainant_name,
            "description":      self.description,
            "location_address": self.location_address,
            "location_lat":     self.location_lat,
            "location_lng":     self.location_lng,
            "parcel_ref":       self.parcel_ref,
            "status":           self.status,
            "case_id":          self.case_id,
            "submitted_at":     self.submitted_at.isoformat() if self.submitted_at else None,
        }
        if admin_view:
            d["complainant_email"] = self.complainant_email
            d["complainant_phone"] = self.complainant_phone
            d["admin_notes"]       = self.admin_notes
            d["submitted_by"]      = self.submitted_by
        return d


# ─────────────────────────────────────────────
# Parcel Boundary History
# ─────────────────────────────────────────────

class ParcelBoundaryHistory(db.Model):
    """
    Immutable record of each boundary update for a land parcel.
    Preserves version history for audit and dispute resolution.
    """
    __tablename__ = "parcel_boundary_history"

    id              = db.Column(db.String(36),  primary_key=True, default=generate_uuid)
    parcel_id       = db.Column(db.String(36),  db.ForeignKey("land_parcels.id"), nullable=False)
    changed_by      = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=True)
    old_boundary    = db.Column(db.Text)        # Previous GeoJSON string
    new_boundary    = db.Column(db.Text)        # New GeoJSON string
    old_area_sqm    = db.Column(db.Float)
    new_area_sqm    = db.Column(db.Float)
    change_reason   = db.Column(db.Text)
    changed_at      = db.Column(db.DateTime, default=utcnow)

    parcel  = db.relationship("LandParcel", foreign_keys=[parcel_id])
    actor   = db.relationship("User", foreign_keys=[changed_by])

    def to_dict(self):
        return {
            "id":           self.id,
            "parcel_id":    self.parcel_id,
            "changed_by":   self.changed_by,
            "actor_name":   self.actor.full_name if self.actor else "system",
            "old_area_sqm": self.old_area_sqm,
            "new_area_sqm": self.new_area_sqm,
            "change_reason":self.change_reason,
            "changed_at":   self.changed_at.isoformat() if self.changed_at else None,
        }
