"""
Auth API Blueprint — POST /api/auth/*
"""
import os
import re
import time
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app import db
from app.models import User, UserRole, UserStatus
from app.utils.auth import hash_password, verify_password, generate_token, login_required, get_current_user
from app.utils.audit import log_action

auth_bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_login_attempts: dict = {}  # {ip: [timestamp, ...]}


def _check_rate_limit(ip: str, max_attempts: int = 30, window_secs: int = 60) -> bool:
    """Returns True if rate limit exceeded."""
    now = time.time()
    attempts = _login_attempts.get(ip, [])
    # Remove old attempts outside window
    attempts = [t for t in attempts if now - t < window_secs]
    if len(attempts) >= max_attempts:
        return True
    attempts.append(now)
    _login_attempts[ip] = attempts
    return False


def _validate_password(pwd: str):
    if len(pwd) < 8:
        return "Password must be at least 8 characters."
    return None


@auth_bp.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")
    full_name = (data.get("full_name") or "").strip()
    organization = (data.get("organization") or "").strip()

    # Validation
    errors = {}
    if not email or not EMAIL_RE.match(email):
        errors["email"] = "Valid email required."
    if not full_name:
        errors["full_name"] = "Full name required."
    pwd_err = _validate_password(password)
    if pwd_err:
        errors["password"] = pwd_err
    if errors:
        return jsonify({"errors": errors}), 422

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered."}), 409

    # Always assign USER role — never accept ADMIN from signup
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        organization=organization,
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.session.add(user)
    db.session.flush()
    log_action(user.id, "USER_SIGNUP", "User", user.id, {"email": email})
    db.session.commit()

    token = generate_token(user.id, user.role.value)
    return jsonify({"token": token, "user": user.to_dict()}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    client_ip = request.environ.get("HTTP_X_FORWARDED_FOR", request.remote_addr or "")
    if _check_rate_limit(client_ip):
        return jsonify({"error": "Too many login attempts. Please try again in a minute."}), 429
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")

    user = User.query.filter_by(email=email).first()

    # Resilient password verification: handles exact, stripped, or optional leading '@'
    valid_password = False
    if user and user.password_hash and password:
        candidates = [password]
        stripped = password.strip()
        if stripped and stripped not in candidates:
            candidates.append(stripped)
        if not stripped.startswith("@"):
            candidates.append("@" + stripped)
        else:
            candidates.append(stripped[1:])

        for cand in candidates:
            if verify_password(cand, user.password_hash):
                valid_password = True
                break

    if not user or not valid_password:
        if user:
            try:
                log_action(user.id, "LOGIN_FAILED", "User", user.id, {"email": email, "ip": client_ip})
                db.session.commit()
            except Exception:
                db.session.rollback()
        return jsonify({"error": "Invalid credentials."}), 401

    if not user.is_active():
        return jsonify({"error": "Account has been deactivated. Please contact your system administrator."}), 403

    # Backend-enforced role verification for role-specific portals
    requested_role = (data.get("requested_role") or "").strip().upper()
    if requested_role:
        user_role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
        if requested_role in ("ADMIN", "SUPER_ADMIN", "SUPER ADMIN"):
            if user_role_val != "ADMIN":
                try:
                    log_action(user.id, "LOGIN_ROLE_MISMATCH", "User", user.id, {
                        "requested": requested_role,
                        "actual": user_role_val,
                        "ip": client_ip
                    })
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                return jsonify({
                    "error": f"Access denied. Account '{email}' has '{user_role_val}' clearance, not Administrator privileges. Please select the {user_role_val} portal.",
                    "actual_role": user_role_val,
                    "code": "ROLE_MISMATCH"
                }), 403

        elif requested_role in ("SURVEYOR", "FIELD_OFFICER"):
            if user_role_val not in ("SURVEYOR", "ADMIN"):
                try:
                    log_action(user.id, "LOGIN_ROLE_MISMATCH", "User", user.id, {
                        "requested": requested_role,
                        "actual": user_role_val,
                        "ip": client_ip
                    })
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                return jsonify({
                    "error": f"Access denied. Account '{email}' is registered as '{user_role_val}', not an authorized Surveyor / Field Officer.",
                    "actual_role": user_role_val,
                    "code": "ROLE_MISMATCH"
                }), 403

    user.last_login = datetime.now(timezone.utc).replace(tzinfo=None)
    log_action(user.id, "USER_LOGIN", "User", user.id, {"requested_role": requested_role or None})
    db.session.commit()

    token = generate_token(user.id, user.role.value)
    return jsonify({"token": token, "user": user.to_dict()})


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    user = request.current_user
    log_action(user.id, "USER_LOGOUT", "User", user.id)
    db.session.commit()
    return jsonify({"message": "Logged out successfully."})


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    return jsonify({"user": request.current_user.to_dict()})


@auth_bp.route("/change-password", methods=["POST"])
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    user = request.current_user
    current = data.get("current_password", "")
    new_pwd = data.get("new_password", "")

    if not verify_password(current, user.password_hash):
        return jsonify({"error": "Current password is incorrect."}), 400

    err = _validate_password(new_pwd)
    if err:
        return jsonify({"error": err}), 422

    user.password_hash = hash_password(new_pwd)
    log_action(user.id, "PASSWORD_CHANGED", "User", user.id)
    db.session.commit()
    return jsonify({"message": "Password changed successfully."})


@auth_bp.route("/setup-admin", methods=["POST"])
def setup_admin():
    """
    Direct admin bootstrap/update endpoint for environments without interactive shell (e.g. Render free tier).
    Requires matching ADMIN_SETUP_KEY (defaults to 'landguard-setup-2026' or configured env var).
    """
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "Jayaram").strip()
    key = (data.get("setup_key") or "").strip()

    expected_key = os.environ.get("ADMIN_SETUP_KEY", "landguard-setup-2026")
    if not key or key != expected_key:
        return jsonify({"error": "Unauthorized: invalid or missing setup_key."}), 403

    if not email or "@" not in email:
        return jsonify({"error": "Valid email address required."}), 422
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 422

    try:
        existing = User.query.filter_by(email=email).first()
        if existing:
            existing.password_hash = hash_password(password)
            existing.full_name = name
            existing.role = UserRole.ADMIN
            existing.status = UserStatus.ACTIVE
            db.session.commit()
            log_action(existing.id, "ADMIN_ACCOUNT_SETUP_UPDATE", "User", existing.id, {"email": email})
            return jsonify({
                "status": "success",
                "message": f"Admin account updated successfully for {email}",
                "email": email,
                "role": "ADMIN"
            }), 200
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
            log_action(admin.id, "ADMIN_ACCOUNT_SETUP_CREATE", "User", admin.id, {"email": email})
            return jsonify({
                "status": "success",
                "message": f"Admin account created successfully for {email}",
                "email": email,
                "role": "ADMIN"
            }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to setup admin account: {str(e)}"}), 500

