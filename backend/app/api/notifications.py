"""
Notifications API Blueprint — /api/notifications
In-app notification management for all authenticated users.
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app import db
from app.models.notification import Notification
from app.utils.auth import login_required

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("", methods=["GET"])
@login_required
def list_notifications():
    """Return notifications for the current user, most recent first."""
    user = request.current_user
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    unread_only = request.args.get("unread_only", "false").lower() == "true"

    q = Notification.query.filter_by(user_id=user.id)
    if unread_only:
        q = q.filter_by(is_read=False)

    pagination = q.order_by(Notification.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "notifications": [n.to_dict() for n in pagination.items],
        "total": pagination.total,
        "unread_count": Notification.query.filter_by(user_id=user.id, is_read=False).count(),
        "page": page,
        "pages": pagination.pages,
    })


@notifications_bp.route("/unread-count", methods=["GET"])
@login_required
def unread_count():
    """Return just the unread notification count for the current user (lightweight)."""
    user = request.current_user
    count = Notification.query.filter_by(user_id=user.id, is_read=False).count()
    return jsonify({"unread_count": count})


@notifications_bp.route("/<notif_id>/read", methods=["PATCH"])
@login_required
def mark_read(notif_id):
    """Mark a single notification as read."""
    user = request.current_user
    notif = Notification.query.filter_by(id=notif_id, user_id=user.id).first_or_404()
    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()
    return jsonify(notif.to_dict())


@notifications_bp.route("/mark-all-read", methods=["PATCH"])
@login_required
def mark_all_read():
    """Mark all unread notifications as read for the current user."""
    user = request.current_user
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    updated = Notification.query.filter_by(user_id=user.id, is_read=False).all()
    for n in updated:
        n.is_read = True
        n.read_at = now
    db.session.commit()
    return jsonify({"marked_read": len(updated)})

