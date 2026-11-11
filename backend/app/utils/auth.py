"""
Authentication utilities: password hashing (Argon2id), JWT token management.
"""
import jwt
import uuid
from datetime import datetime, timezone, timedelta
from functools import wraps
from flask import current_app, request, jsonify

try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
    _ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)

    def hash_password(password: str) -> str:
        return _ph.hash(password)

    def verify_password(password: str, hashed: str) -> bool:
        try:
            return _ph.verify(hashed, password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

except ImportError:
    # Fallback to werkzeug if argon2 not installed
    from werkzeug.security import generate_password_hash, check_password_hash

    def hash_password(password: str) -> str:
        return generate_password_hash(password, method="pbkdf2:sha256", salt_length=16)

    def verify_password(password: str, hashed: str) -> bool:
        return check_password_hash(hashed, password)


def generate_token(user_id: str, role: str, expiry_hours: int = 8) -> str:
    """Generate a signed JWT access token."""
    payload = {
        "sub": user_id,
        "role": role,
        "jti": str(uuid.uuid4()),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=expiry_hours),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises on failure."""
    return jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])


def get_token_from_request() -> str | None:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


def get_current_user():
    """Return current user from token or None."""
    from app.models import User
    token = get_token_from_request()
    if not token:
        return None
    try:
        data = decode_token(token)
        return User.query.get(data["sub"])
    except Exception:
        return None


def login_required(f):
    """Decorator: require authenticated user."""
    @wraps(f)
    def decorated(*args, **kwargs):
        from app.models import User
        token = get_token_from_request()
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        try:
            data = decode_token(token)
            user = User.query.get(data["sub"])
            if not user or not user.is_active():
                return jsonify({"error": "Account inactive or not found"}), 401
            request.current_user = user
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator: require ADMIN role."""
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        from app.models import UserRole
        if request.current_user.role != UserRole.ADMIN:
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated
