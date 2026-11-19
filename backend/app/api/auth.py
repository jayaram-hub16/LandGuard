"""
Auth API Blueprint — POST /api/auth/*
"""
import os
import re
import time
import secrets
import hashlib
import logging
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app import db
from app.models import User, UserRole, UserStatus
from app.utils.auth import hash_password, verify_password, generate_token, login_required, get_current_user
from app.utils.audit import log_action

auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger(__name__)

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


# ── Password Reset OTP flow ───────────────────────────────────────────────────

_forgot_pw_attempts: dict = {}   # {ip: [timestamp, ...]}


def _check_forgot_pw_rate(ip: str, max_attempts: int = 5, window_secs: int = 300) -> bool:
    """Returns True if rate limit exceeded (max 5 requests per 5 min per IP)."""
    now = time.time()
    attempts = _forgot_pw_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < window_secs]
    if len(attempts) >= max_attempts:
        return True
    attempts.append(now)
    _forgot_pw_attempts[ip] = attempts
    return False


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """
    POST /api/auth/forgot-password
    Accepts { email }. Generates a 6-digit OTP, hashes it with SHA-256, stores
    in DB, and sends via email. Returns a generic message regardless of whether
    the email exists (prevents email enumeration).
    """
    from app.models import PasswordResetOTP
    from app.utils.email_service import send_otp_email
    from datetime import timedelta

    client_ip = request.environ.get("HTTP_X_FORWARDED_FOR", request.remote_addr or "unknown")
    client_ip = client_ip.split(",")[0].strip()

    if _check_forgot_pw_rate(client_ip):
        return jsonify({"message": "If that email is registered, an OTP has been sent."}), 200

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    # Always return the same message — do NOT reveal whether email exists
    generic_msg = {"message": "If that email is registered, an OTP has been sent."}

    if not email or not EMAIL_RE.match(email):
        return jsonify(generic_msg), 200

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify(generic_msg), 200

    # Invalidate any previous unused OTPs for this user
    try:
        PasswordResetOTP.query.filter_by(user_id=user.id, used=False).update({"used": True})
        db.session.flush()
    except Exception:
        db.session.rollback()

    # Generate 6-digit OTP
    otp_int = secrets.randbelow(1000000)
    otp_str = f"{otp_int:06d}"
    otp_hash = hashlib.sha256(otp_str.encode()).hexdigest()

    expires_minutes = 5
    otp_record = PasswordResetOTP(
        user_id=user.id,
        otp_hash=otp_hash,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=expires_minutes),
        ip_address=client_ip,
    )
    db.session.add(otp_record)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify(generic_msg), 200

    # Send OTP email — check the return value; do NOT silently swallow failure
    email_sent, email_error = (False, "Unknown error")
    try:
        email_sent, email_error = send_otp_email(email, otp_str, expires_minutes)
    except Exception as exc:
        logger.error("OTP email dispatch exception for %s: %s", email, type(exc).__name__)
        email_sent, email_error = False, "Email service raised an unexpected error."

    if not email_sent:
        # Mark the OTP as used so it cannot be replayed if email never arrived
        try:
            otp_record.used = True
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Distinguish between mis-configured SMTP and a transient send failure
        if "not configured" in email_error.lower() or "authentication" in email_error.lower():
            return jsonify({
                "error": "Email delivery is not configured on this server. "
                         "Please contact the system administrator to enable password recovery."
            }), 503
        return jsonify({
            "error": "Failed to send the recovery email. Please try again in a moment."
        }), 503

    return jsonify({"message": "Recovery code sent. Please check your inbox."}), 200


@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    """
    POST /api/auth/verify-otp
    Accepts { email, otp }. Verifies the OTP hash. On success, marks OTP as used,
    generates a reset_token (secrets.token_urlsafe(32)), stores its SHA-256 hash
    in a new OTP record (re-using the table with a special marker), and returns
    the reset_token.
    """
    from app.models import PasswordResetOTP
    from datetime import timedelta

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp_str = (data.get("otp") or "").strip()

    err_resp = {"error": "Invalid or expired OTP."}, 400

    if not email or not otp_str:
        return jsonify({"error": "email and otp are required."}), 422

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify(*err_resp)

    otp_hash = hashlib.sha256(otp_str.encode()).hexdigest()

    # Find the most recent valid OTP record for this user matching the hash
    record = (
        PasswordResetOTP.query
        .filter_by(user_id=user.id, otp_hash=otp_hash, used=False)
        .order_by(PasswordResetOTP.created_at.desc())
        .first()
    )

    if not record:
        # Increment attempts on the most recent unused record (brute-force mitigation)
        latest = (
            PasswordResetOTP.query
            .filter_by(user_id=user.id, used=False)
            .order_by(PasswordResetOTP.created_at.desc())
            .first()
        )
        if latest:
            latest.attempts = (latest.attempts or 0) + 1
            if latest.attempts >= 5:
                latest.used = True
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()
        return jsonify(*err_resp)

    record.attempts = (record.attempts or 0) + 1
    if not record.is_valid():
        record.used = True
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
        return jsonify(*err_resp)

    # Mark OTP as used
    record.used = True

    # Generate a reset_token; store its hash as a new short-lived "token" record
    reset_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(reset_token.encode()).hexdigest()
    token_record = PasswordResetOTP(
        user_id=user.id,
        otp_hash=token_hash,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=15),
        ip_address=request.environ.get("HTTP_X_FORWARDED_FOR", request.remote_addr or ""),
    )
    db.session.add(token_record)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Internal error. Please try again."}), 500

    return jsonify({"reset_token": reset_token, "message": "OTP verified. Use reset_token to set a new password."})


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """
    POST /api/auth/reset-password
    Accepts { email, reset_token, new_password, confirm_password }.
    Verifies the reset_token hash, validates password, updates the hash.
    """
    from app.models import PasswordResetOTP

    data = request.get_json(silent=True) or {}
    email         = (data.get("email") or "").strip().lower()
    reset_token   = (data.get("reset_token") or "").strip()
    new_password  = data.get("new_password", "")
    confirm_pwd   = data.get("confirm_password", "")

    if not email or not reset_token or not new_password:
        return jsonify({"error": "email, reset_token, and new_password are required."}), 422

    err_token = {"error": "Invalid or expired reset token."}, 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify(*err_token)

    token_hash = hashlib.sha256(reset_token.encode()).hexdigest()
    token_record = (
        PasswordResetOTP.query
        .filter_by(user_id=user.id, otp_hash=token_hash, used=False)
        .order_by(PasswordResetOTP.created_at.desc())
        .first()
    )

    if not token_record or not token_record.is_valid():
        if token_record:
            token_record.used = True
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()
        return jsonify(*err_token)

    if new_password != confirm_pwd:
        return jsonify({"error": "Passwords do not match."}), 422

    pwd_err = _validate_password(new_password)
    if pwd_err:
        return jsonify({"error": pwd_err}), 422

    # Update password
    user.password_hash = hash_password(new_password)
    token_record.used = True

    # Invalidate all remaining OTP/token records for this user
    PasswordResetOTP.query.filter_by(user_id=user.id, used=False).update({"used": True})

    log_action(user.id, "PASSWORD_RESET", "User", user.id, {"method": "otp"})

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to reset password. Please try again."}), 500

    return jsonify({"message": "Password reset successfully. Please log in with your new password."})


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



# ── Email Configuration Test (Admin only) ──────────────────────────────────

@auth_bp.route("/test-email", methods=["POST"])
@login_required
def test_email_config(current_user):
    """
    POST /api/auth/test-email
    Admin-only: test SMTP configuration and optionally send a test email.
    Body: { "to_email": "optional@example.com" }
    Returns SMTP status, connection result, and send result.
    Never returns SMTP password or OTP values.
    """
    import os, smtplib
    from app.utils.email_service import _get_smtp_config

    # Only admins and super_admins may use this endpoint
    role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).lower()
    if role not in ("admin", "super_admin"):
        return jsonify({"error": "Admin access required."}), 403

    cfg = _get_smtp_config()
    data = request.get_json(silent=True) or {}
    to_email = (data.get("to_email") or "").strip() or current_user.email

    result = {
        "smtp_host":       cfg["host"] or "(not set)",
        "smtp_port":       cfg["port"],
        "smtp_username":   cfg["username"] or "(not set)",
        "smtp_from_email": cfg["from_email"] or "(not set)",
        "smtp_from_name":  cfg["from_name"],
        "use_tls":         cfg["use_tls"],
        "config_ok":       bool(cfg["host"] and cfg["username"] and cfg["password"]),
        "connection_ok":   False,
        "auth_ok":         False,
        "send_ok":         False,
        "error":           None,
        "to_email":        to_email,
    }

    if not result["config_ok"]:
        result["error"] = "SMTP configuration is incomplete. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD."
        return jsonify(result), 200

    # Test connection
    try:
        if cfg["use_tls"]:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=8) as server:
                server.ehlo()
                result["connection_ok"] = True
                server.starttls()
                server.ehlo()
                server.login(cfg["username"], cfg["password"])
                result["auth_ok"] = True
                # Send a real test email
                from email.mime.multipart import MIMEMultipart
                from email.mime.text import MIMEText
                msg = MIMEMultipart("alternative")
                msg["Subject"] = "LandGuard – SMTP Configuration Test"
                msg["From"]    = f"{cfg['from_name']} <{cfg['from_email'] or cfg['username']}>"
                msg["To"]      = to_email
                body = (
                    "<h2>✅ LandGuard SMTP Test Successful</h2>"
                    "<p>Your email configuration is working correctly. "
                    "OTP password-recovery emails will be delivered.</p>"
                    "<p><small>Sent by LandGuard Admin SMTP Test</small></p>"
                )
                msg.attach(MIMEText("LandGuard SMTP Test: configuration is working.", "plain", "utf-8"))
                msg.attach(MIMEText(body, "html", "utf-8"))
                server.sendmail(cfg["from_email"] or cfg["username"], [to_email], msg.as_string())
                result["send_ok"] = True
        else:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=8) as server:
                result["connection_ok"] = True
                server.login(cfg["username"], cfg["password"])
                result["auth_ok"] = True
                from email.mime.multipart import MIMEMultipart
                from email.mime.text import MIMEText
                msg = MIMEMultipart("alternative")
                msg["Subject"] = "LandGuard – SMTP Configuration Test"
                msg["From"]    = f"{cfg['from_name']} <{cfg['from_email'] or cfg['username']}>"
                msg["To"]      = to_email
                msg.attach(MIMEText("LandGuard SMTP Test: configuration is working.", "plain", "utf-8"))
                server.sendmail(cfg["from_email"] or cfg["username"], [to_email], msg.as_string())
                result["send_ok"] = True

    except smtplib.SMTPAuthenticationError:
        result["connection_ok"] = True
        result["error"] = (
            "SMTP Authentication failed. "
            "For Gmail: use an App Password (not your Gmail login password). "
            "Enable 2FA → Google Account → Security → App Passwords → generate one."
        )
    except smtplib.SMTPConnectError:
        result["error"] = f"Cannot connect to {cfg['host']}:{cfg['port']}. Check SMTP_HOST and SMTP_PORT."
    except smtplib.SMTPException as exc:
        result["error"] = f"SMTP error: {type(exc).__name__}"
    except Exception as exc:
        result["error"] = f"Unexpected error: {type(exc).__name__}"

    logger.info(
        "SMTP test by admin %s → host=%s user=%s conn=%s auth=%s send=%s",
        current_user.email,
        cfg["host"], cfg["username"],
        result["connection_ok"], result["auth_ok"], result["send_ok"]
    )
    return jsonify(result), 200
