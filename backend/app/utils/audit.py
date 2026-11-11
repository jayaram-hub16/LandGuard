"""Audit logging utility."""
import json
from flask import request
from app import db
from app.models import AuditLog


def log_action(actor_id, action, entity_type=None, entity_id=None, details=None):
    """Create an immutable audit log record. Never include secrets in details."""
    try:
        ip = request.remote_addr if request else None
    except RuntimeError:
        ip = None

    record = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        details=json.dumps(details) if details else None,
        ip_address=ip,
    )
    db.session.add(record)
    # Flush but don't commit – caller handles transaction
    db.session.flush()
    return record
