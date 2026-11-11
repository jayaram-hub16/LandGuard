"""
LandGuard Flask entry point.
Run: flask run  OR  python run.py
"""
import os
import sys
import click

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
from app import create_app, db

app = create_app(os.environ.get("FLASK_ENV", "development"))


@app.cli.command("seed-data")
def seed_data():
    """Seed the database with simulated land parcel data."""
    from scripts.seed_db import run_seed
    run_seed()
    click.echo("✅ Simulated data seeded successfully.")


@app.cli.command("create-admin")
@click.option("--email", required=True, help="Admin email address")
@click.option("--password", required=True, help="Admin password (min 8 chars)")
@click.option("--name", default="System Administrator", help="Full name")
def create_admin(email, password, name):
    """Bootstrap or update an administrator account."""
    from app.models import User, UserRole, UserStatus
    from app.utils.auth import hash_password

    with app.app_context():
        existing = User.query.filter_by(email=email).first()
        if existing:
            existing.password_hash = hash_password(password)
            existing.full_name = name
            existing.role = UserRole.ADMIN
            existing.status = UserStatus.ACTIVE
            db.session.commit()
            click.echo(f"✅ Admin account updated: {email}")
        else:
            admin = User(
                email=email,
                password_hash=hash_password(password),
                full_name=name,
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
            )
            db.session.add(admin)
            db.session.commit()
            click.echo(f"✅ Admin account created: {email}")


if __name__ == "__main__":
    host = os.environ.get("FLASK_RUN_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", os.environ.get("FLASK_RUN_PORT", "5000")))
    debug = os.environ.get("FLASK_DEBUG", "True").lower() in ("true", "1")
    app.run(host=host, port=port, debug=debug)
