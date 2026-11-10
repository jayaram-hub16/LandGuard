"""Verify new tables and schema after Phase 1-2 additions."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db

app = create_app("development")
with app.app_context():
    from sqlalchemy import inspect
    inspector = inspect(db.engine)
    tables = sorted(inspector.get_table_names())
    print("Tables:", tables)

    REQUIRED = {
        "users", "land_parcels", "ownership_records", "datasets",
        "encroachment_detections", "audit_logs", "reports",
        "cases", "case_history", "case_evidence",
        "field_surveys", "complaints", "parcel_boundary_history"
    }
    missing = REQUIRED - set(tables)
    if missing:
        print(f"MISSING: {missing}", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"OK — all {len(REQUIRED)} required tables present")

    # Verify admin still exists
    from app.models import User, UserRole
    admins = User.query.filter_by(role=UserRole.ADMIN).count()
    print(f"Admin count: {admins}")

    # Verify new roles work
    roles = [r.value for r in UserRole]
    print(f"Roles available: {roles}")
    assert "SURVEYOR" in roles and "CITIZEN" in roles, "New roles missing!"
    print("All checks passed.")
