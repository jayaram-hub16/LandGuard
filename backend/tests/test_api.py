"""Backend test suite."""
import pytest
import json
from app import create_app, db
from app.models import User, UserRole, UserStatus, LandParcel, LandUseCategory
from app.utils.auth import hash_password, generate_token


@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def admin_user(app):
    with app.app_context():
        u = User(
            email="admin@test.com",
            password_hash=hash_password("Admin1234!"),
            full_name="Test Admin",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
        )
        db.session.add(u)
        db.session.commit()
        db.session.refresh(u)
        db.session.expunge(u)
        return u


@pytest.fixture
def normal_user(app):
    with app.app_context():
        u = User(
            email="user@test.com",
            password_hash=hash_password("User1234!"),
            full_name="Test User",
            role=UserRole.USER,
            status=UserStatus.ACTIVE,
        )
        db.session.add(u)
        db.session.commit()
        db.session.refresh(u)
        db.session.expunge(u)
        return u


def _token(app, user):
    with app.app_context():
        return generate_token(user.id, user.role.value)


# ── Test 1: Signup creates USER account ───────────────────────
def test_signup_creates_user_role(client):
    r = client.post("/api/auth/signup", json={
        "email": "new@test.com", "password": "Password1!", "full_name": "New User"
    })
    assert r.status_code == 201
    data = r.get_json()
    assert data["user"]["role"] == "USER"


# ── Test 2: Login succeeds with valid credentials ──────────────
def test_login_valid(client, normal_user, app):
    with app.app_context():
        r = client.post("/api/auth/login", json={
            "email": "user@test.com", "password": "User1234!"
        })
        assert r.status_code == 200
        assert "token" in r.get_json()


# ── Test 3: Invalid credentials rejected ──────────────────────
def test_login_invalid(client):
    r = client.post("/api/auth/login", json={
        "email": "nobody@test.com", "password": "wrong"
    })
    assert r.status_code == 401


# ── Test 4: Authenticated user can view parcels ───────────────
def test_user_can_view_parcels(client, normal_user, app):
    with app.app_context():
        token = generate_token(normal_user.id, normal_user.role.value)
        r = client.get("/api/parcels", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200


# ── Test 5: User cannot create parcels ────────────────────────
def test_user_cannot_create_parcel(client, normal_user, app):
    with app.app_context():
        token = generate_token(normal_user.id, normal_user.role.value)
        r = client.post("/api/parcels",
                        json={"parcel_id": "TEST-001"},
                        headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403


# ── Test 6: User cannot access admin dashboard ────────────────
def test_user_cannot_access_admin(client, normal_user, app):
    with app.app_context():
        token = generate_token(normal_user.id, normal_user.role.value)
        r = client.get("/api/admin/dashboard",
                       headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403


# ── Test 7: Admin can create parcel ───────────────────────────
def test_admin_can_create_parcel(client, admin_user, app):
    with app.app_context():
        token = generate_token(admin_user.id, admin_user.role.value)
        r = client.post("/api/parcels", json={
            "parcel_id": "ADMIN-TEST-001",
            "registered_area_sqm": 500.0,
            "district": "Test District",
            "state": "Test State",
        }, headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 201


# ── Test 8: Admin can access dashboard ────────────────────────
def test_admin_can_access_dashboard(client, admin_user, app):
    with app.app_context():
        token = generate_token(admin_user.id, admin_user.role.value)
        r = client.get("/api/admin/dashboard",
                       headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200


# ── Test 9: Unauthenticated access returns 401 ────────────────
def test_unauthenticated_returns_401(client):
    r = client.get("/api/parcels")
    assert r.status_code == 401


# ── Test 10: Signup never assigns ADMIN role ──────────────────
def test_signup_never_assigns_admin(client):
    r = client.post("/api/auth/signup", json={
        "email": "hacker@test.com", "password": "Hack1234!",
        "full_name": "Hacker", "role": "ADMIN"
    })
    assert r.status_code == 201
    assert r.get_json()["user"]["role"] == "USER"


# ── Test 11: Health endpoint ──────────────────────────────────
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.get_json()["status"] == "ok"


# ── Test 12: Admin delete parcel ─────────────────────────────
def test_admin_can_delete_parcel(client, admin_user, app):
    with app.app_context():
        token = generate_token(admin_user.id, admin_user.role.value)
        # Create first
        r = client.post("/api/parcels", json={
            "parcel_id": "DEL-TEST-001",
        }, headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 201
        parcel_id = r.get_json()["parcel_id"]

        # Delete
        r = client.delete(f"/api/parcels/{parcel_id}",
                          headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200


# ── Test 13: /api/admin/stats & /api/admin/dashboard with pending detections ──
def test_admin_stats_and_dashboard_with_enum_detections(client, admin_user, normal_user, app):
    from app.models import EncroachmentDetection, ReviewStatus, Case, Complaint

    with app.app_context():
        p = LandParcel(parcel_id="STAT-TEST-001", registered_area_sqm=250.0, is_flagged=True)
        db.session.add(p)
        db.session.flush()

        d_pending = EncroachmentDetection(
            parcel_id=p.id,
            detection_reason="Area mismatch detected",
            review_status=ReviewStatus.PENDING,
            severity="High",
        )
        d_resolved = EncroachmentDetection(
            parcel_id=p.id,
            detection_reason="Cleared check",
            review_status=ReviewStatus.RESOLVED,
            severity="Low",
        )
        c_open = Case(case_number="LG-2026-999001", title="Test Case", parcel_id=p.id, status="Reported")
        comp_open = Complaint(
            ack_number="COMP-TEST0001", complainant_name="Citizen", description="Check overlap", status="Submitted"
        )
        db.session.add_all([d_pending, d_resolved, c_open, comp_open])
        db.session.commit()

        admin_tok = generate_token(admin_user.id, admin_user.role.value)
        user_tok = generate_token(normal_user.id, normal_user.role.value)

        r_stats = client.get("/api/admin/stats", headers={"Authorization": f"Bearer {user_tok}"})
        assert r_stats.status_code == 200
        body = r_stats.get_json()
        assert body["parcels"] == {"total": 1, "flagged": 1}
        assert body["detections"] == {"total": 2, "pending": 1}
        assert body["cases"] == {"total": 1, "open": 1}
        assert body["complaints"] == {"total": 1, "open": 1}

        r_dash = client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {admin_tok}"})
        assert r_dash.status_code == 200
        dbody = r_dash.get_json()
        assert dbody["detections"]["pending"] == 1
