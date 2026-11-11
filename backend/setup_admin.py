"""
LandGuard — Secure database initialiser and admin account setup.

USAGE
-----
1. Create a file called  backend/.env.setup  with these lines:

       SETUP_ADMIN_EMAIL=jayaramrangam162007@gmail.com
       SETUP_ADMIN_NAME=Jayaram
       SETUP_ADMIN_PASSWORD=<your password here>

   This file is in .gitignore — it will NOT be committed.

2. From the backend/ directory, run:

       venv313\\Scripts\\python.exe setup_admin.py

3. Delete  .env.setup  when done.

SAFETY
------
- db.create_all() is IDEMPOTENT: it creates missing tables but never drops
  or modifies existing tables or rows.
- Passwords are stored exclusively as Argon2id hashes (or PBKDF2-SHA256
  as fallback). The plaintext password is never written to disk or logged.
- This script will NOT run if SETUP_ADMIN_PASSWORD is missing or shorter
  than 8 characters.
"""
import sys
import os

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(__file__))

# Load credentials from .env.setup (local file, never committed)
from dotenv import dotenv_values

_setup_path = os.path.join(os.path.dirname(__file__), ".env.setup")
cfg = dotenv_values(_setup_path if os.path.exists(_setup_path) else ".env.setup")

admin_email    = (cfg.get("SETUP_ADMIN_EMAIL") or "").strip()
admin_name     = (cfg.get("SETUP_ADMIN_NAME") or "Jayaram").strip()
admin_password = (cfg.get("SETUP_ADMIN_PASSWORD") or "").strip()

# ── Validate inputs ──────────────────────────────────────────────
errors = []
if not admin_email:
    errors.append("SETUP_ADMIN_EMAIL is required in .env.setup")
if not admin_password:
    errors.append("SETUP_ADMIN_PASSWORD is required in .env.setup")
elif len(admin_password) < 8:
    errors.append("SETUP_ADMIN_PASSWORD must be at least 8 characters")
if errors:
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)
    print("\nCreate backend/.env.setup with the required variables, then retry.", file=sys.stderr)
    sys.exit(1)

# ── Import app after validation ───────────────────────────────────
from app import create_app, db
from app.models import User, UserRole, UserStatus
from app.utils.auth import hash_password
from sqlalchemy import inspect as sa_inspect

app = create_app("development")

with app.app_context():
    # Step 1 — Show which DB file will be used
    db_url = str(db.engine.url)
    print(f"Database : {db_url}")

    # Step 2 — Create all tables (safe / idempotent)
    db.create_all()
    tables = sa_inspect(db.engine).get_table_names()
    print(f"Tables   : {sorted(tables)}")

    required = {"users", "land_parcels", "ownership_records", "datasets",
                "encroachment_detections", "audit_logs", "reports"}
    missing = required - set(tables)
    if missing:
        print(f"FAIL — missing tables after create_all(): {missing}", file=sys.stderr)
        sys.exit(1)
    print("✅ All required tables verified.\n")

    # Step 3 — Count existing rows so we can confirm nothing was deleted
    user_count   = User.query.count()
    print(f"Existing user rows before upsert: {user_count}")

    # Step 4 — Upsert admin account (never deletes other users or data)
    existing = User.query.filter_by(email=admin_email).first()
    if existing:
        existing.password_hash = hash_password(admin_password)
        existing.full_name     = admin_name
        existing.role          = UserRole.ADMIN
        existing.status        = UserStatus.ACTIVE
        db.session.commit()
        print(f"✅ Admin account UPDATED  : {admin_email}")
        print(f"   Full name              : {admin_name}")
        print(f"   Role                   : ADMIN")
        print(f"   Status                 : ACTIVE")
        print(f"   Password               : stored as secure hash (Argon2id / PBKDF2)")
    else:
        admin = User(
            email         = admin_email,
            password_hash = hash_password(admin_password),
            full_name     = admin_name,
            role          = UserRole.ADMIN,
            status        = UserStatus.ACTIVE,
        )
        db.session.add(admin)
        db.session.commit()
        print(f"✅ Admin account CREATED  : {admin_email}")
        print(f"   Full name              : {admin_name}")
        print(f"   Role                   : ADMIN")
        print(f"   Status                 : ACTIVE")
        print(f"   Password               : stored as secure hash (Argon2id / PBKDF2)")

    # Step 5 — Final verification
    user_count_after = User.query.count()
    admin = User.query.filter_by(email=admin_email).first()
    print(f"\nTotal user rows after upsert : {user_count_after}")
    print(f"Admin account role           : {admin.role.value if admin else 'N/A'}")
    print(f"Admin account status         : {admin.status.value if admin else 'N/A'}")
    print(f"\n✅ Setup complete.")
    print(f"\nTo start the backend:")
    print(f"   venv313\\Scripts\\python.exe run.py")
    print(f"\nTo start the frontend (separate terminal):")
    print(f"   cd frontend && npm run dev")
    print(f"\nLogin at http://localhost:5173  with  {admin_email}")
    print(f"\n⚠  Delete  backend\\.env.setup  now that setup is complete.")
