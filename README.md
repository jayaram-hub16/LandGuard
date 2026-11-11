# 🛡 LandGuard — GIS-Based Land Encroachment Detection Platform

> **⚠ IMPORTANT DISCLAIMER**: LandGuard uses **SIMULATED/SYNTHETIC DATASETS** for demonstration purposes only. All detection results are **preliminary geometric findings** and do NOT constitute proof of illegal encroachment, establish legal ownership, or substitute for official land survey verification. Every finding requires independent verification by a qualified, authorized land surveyor.

---

## Overview

LandGuard is a full-stack production-oriented web application designed to help **municipal survey departments and authorized land survey officers** identify possible land encroachment by comparing registered land boundaries with observed land use and GIS datasets.

**Technology Stack:**
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Leaflet + Recharts
- **Backend**: Python Flask + SQLAlchemy ORM + Flask-Migrate
- **Database**: SQLite (development) / PostgreSQL + PostGIS (production)
- **ML/GIS**: scikit-learn Random Forest + Shapely + GeoPandas
- **Auth**: JWT (PyJWT) + Argon2id password hashing
- **Reports**: ReportLab (PDF) + CSV

---

## Project Structure

```
LandGuard/
├── frontend/                     # React/Vite TypeScript app
│   ├── src/
│   │   ├── pages/               # All page components
│   │   │   ├── auth/            # Login, Signup
│   │   │   ├── dashboard/       # User dashboard
│   │   │   ├── admin/           # Admin dashboard, users, audit
│   │   │   ├── parcels/         # Parcel list, detail
│   │   │   ├── detections/      # Detection list + review
│   │   │   └── reports/         # Reports generation
│   │   ├── components/          # Layout, Map, UI components
│   │   ├── context/             # React Auth context
│   │   ├── services/            # Axios API service layer
│   │   └── types/               # TypeScript type definitions
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                      # Flask Python API
│   ├── app/
│   │   ├── __init__.py          # Application factory
│   │   ├── config.py            # Configuration classes
│   │   ├── models/              # SQLAlchemy ORM models (OOP)
│   │   │   └── __init__.py      # User, LandParcel, OwnershipRecord,
│   │   │                        # EncroachmentDetection, Dataset,
│   │   │                        # AuditLog, Report
│   │   ├── api/                 # Flask Blueprint REST endpoints
│   │   │   ├── auth.py          # POST /api/auth/*
│   │   │   ├── parcels.py       # GET/POST/PUT/DELETE /api/parcels
│   │   │   ├── detections.py    # GET /api/detections, PATCH review
│   │   │   ├── datasets.py      # POST /api/datasets (upload)
│   │   │   ├── classification.py# POST /api/classification/predict
│   │   │   ├── admin.py         # /api/admin/* (admin only)
│   │   │   └── reports.py       # POST /api/reports, GET download
│   │   ├── services/
│   │   │   ├── gis_service.py   # GeoJSON validation, geometry ops
│   │   │   ├── detection_service.py  # DetectionEngine + EncroachmentFlag OOP
│   │   │   ├── classification_service.py # Random Forest land-use classifier
│   │   │   └── report_service.py # PDF/CSV report generation
│   │   └── utils/
│   │       ├── auth.py          # JWT + Argon2id + decorators
│   │       └── audit.py         # Audit log helper
│   ├── scripts/
│   │   └── seed_db.py           # Simulated data seeder
│   ├── tests/
│   │   └── test_api.py          # pytest test suite (12 tests)
│   ├── requirements.txt
│   └── run.py                   # Flask entry point + CLI
│
├── .env.example                  # Environment variables template
├── .gitignore
└── README.md
```

---

## Quick Start — Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+ / npm 10+
- Git

### 1. Clone and setup

```bash
git clone <your-repo-url>
cd LandGuard
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Copy environment file
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux

# Edit .env — set SECRET_KEY to a random string
```

### 3. Initialize Database

```bash
# From backend/
set FLASK_APP=run.py         # Windows
# export FLASK_APP=run.py   # macOS/Linux

flask db init
flask db migrate -m "Initial schema"
flask db upgrade
```

### 4. Create Admin Account

```bash
flask create-admin --email admin@demo.com --password "Admin1234!" --name "Admin User"
```

> ⚠ **Security**: Use a strong password in production. Never hardcode credentials.

### 5. Seed Simulated Data

```bash
flask seed-data
```

This creates:
- 48 simulated land parcels across 8 Indian cities
- 16 simulated ownership records (clearly marked as SIMULATED)
- ~20 sample encroachment detection records

### 6. Start Backend

```bash
python run.py
# API available at: http://localhost:5000
# Health check: http://localhost:5000/api/health
```

### 7. Frontend Setup

```bash
cd ../frontend
npm install
npm run dev
# App available at: http://localhost:5173
```

---

## Authentication & Roles

| Action | USER | ADMIN |
|--------|------|-------|
| View parcels/detections | ✅ | ✅ |
| Search and filter | ✅ | ✅ |
| View dashboard | ✅ | ✅ |
| Create/Edit/Delete parcels | ❌ | ✅ |
| Run detection engine | ❌ | ✅ |
| Review detections | ❌ | ✅ |
| Upload datasets | ❌ | ✅ |
| Manage users | ❌ | ✅ |
| View audit logs | ❌ | ✅ |
| Generate reports | ✅ (own) | ✅ (all) |

**Security safeguards:**
- Signup always assigns `USER` role — ADMIN cannot be requested via API
- Last active admin cannot be deactivated or demoted
- Admins cannot modify their own role/status
- All permissions enforced server-side (HTTP 401/403)

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Create USER account |
| POST | /api/auth/login | Login, returns JWT |
| POST | /api/auth/logout | Logout (invalidate) |
| GET | /api/auth/me | Get current user |
| POST | /api/auth/change-password | Change password |

### Parcels
| Method | Endpoint | Auth |
|--------|----------|------|
| GET | /api/parcels | USER |
| GET | /api/parcels/:id | USER |
| POST | /api/parcels | ADMIN |
| PUT | /api/parcels/:id | ADMIN |
| DELETE | /api/parcels/:id | ADMIN |

### Detections
| Method | Endpoint | Auth |
|--------|----------|------|
| GET | /api/detections | USER |
| GET | /api/detections/:id | USER |
| PATCH | /api/detections/:id/review | ADMIN |
| POST | /api/detections/run | ADMIN |

### Admin
| Method | Endpoint | Auth |
|--------|----------|------|
| GET | /api/admin/dashboard | ADMIN |
| GET | /api/admin/users | ADMIN |
| PATCH | /api/admin/users/:id/status | ADMIN |
| PATCH | /api/admin/users/:id/role | ADMIN |
| GET | /api/admin/audit-logs | ADMIN |

---

## OOP Design

The core domain uses clear OOP separation:

- **`LandParcel`** — Encapsulates spatial boundary, ownership reference, area, land-use classification
- **`OwnershipRecord`** — Owner metadata with access controls for sensitive fields
- **`EncroachmentDetection`** — Preliminary finding with review workflow
- **`EncroachmentFlag`** — Value object produced by the detection engine
- **`DetectionEngine`** — Compares registered vs observed data using 3 strategies:
  1. Land-use mismatch detection
  2. Area discrepancy analysis (>5% threshold)
  3. Adjacent parcel boundary overlap
- **`LandUseClassifier`** — OOP wrapper for scikit-learn Random Forest

---

## GIS Classification

The Random Forest classifier supports:
- Residential, Commercial, Agriculture, Road, Water Body, Forest, Industrial, Other

Input features: `area_sqm`, `ndvi`, `building_density`, `impervious_surface`, `water_index`, `road_distance_m`

> **Note**: Model is trained on SYNTHETIC data. Accuracy figures are for demo purposes only.

---

## Running Tests

```bash
cd backend
pip install pytest pytest-flask
pytest tests/test_api.py -v
```

Tests cover:
1. Signup creates USER role (never ADMIN)
2. Login with valid credentials
3. Invalid credentials rejected
4. Users can view permitted records
5. Users cannot create parcels (403)
6. Users cannot access admin endpoints (403)
7. Admins can create parcels
8. Admins can access dashboard
9. Unauthenticated returns 401
10. Signup ignores ADMIN role injection
11. Health endpoint works
12. Admin delete parcel

---

## Production Deployment (Render — No AWS)

### Prerequisites
- Render account (https://render.com)
- Private GitHub repository

### Architecture
- **Frontend**: Render Static Site (or Netlify)
- **Backend**: Render Web Service (Python)
- **Database**: Render PostgreSQL with PostGIS

### Steps

1. **Push to GitHub** (private repo):
   ```bash
   git init
   git add .
   git status  # verify no .env or secrets staged
   git commit -m "feat: initial LandGuard platform"
   git remote add origin git@github.com:YOUR_USERNAME/landguard.git
   git push -u origin main
   ```

2. **Create Render PostgreSQL** (check PostGIS availability for your plan)

3. **Create Render Web Service** for Flask:
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn run:app`
   - Set environment variables from `.env.example`

4. **Create Render Static Site** for React:
   - Root directory: `frontend`
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
   - Set `VITE_API_URL` to backend URL

5. **Run migrations on Render**:
   ```bash
   flask db upgrade
   flask create-admin --email admin@yourdomain.com --password "StrongPass123!"
   flask seed-data
   ```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | ✅ | Flask/JWT signing key (min 32 chars, random) |
| `DATABASE_URL` | Production | PostgreSQL connection string |
| `FRONTEND_URL` | ✅ | CORS allowlist URL(s) |
| `FLASK_ENV` | ✅ | `development` or `production` |
| `ADMIN_BOOTSTRAP_EMAIL` | Optional | For scripted admin creation |
| `ADMIN_BOOTSTRAP_PASSWORD` | Optional | For scripted admin creation |
| `MAIL_SERVER` | Optional | Email server (for password reset) |
| `VITE_API_URL` | Production | Backend API base URL |

---

## Known Limitations

1. **Simulated data only** — All parcels, owners, and detections are synthetic
2. **No real satellite imagery** — Uses OpenStreetMap/CartoDB tiles (not actual satellite)
3. **ML model on synthetic data** — Confidence scores are for demonstration only
4. **SQLite for local dev** — PostGIS spatial indexing requires PostgreSQL in production
5. **No email-based password reset** — Email flow is scaffolded but requires SMTP configuration
6. **File uploads stored locally** — Production requires persistent object storage (not ephemeral filesystem)

---

## Security Notes

- Passwords hashed with Argon2id (falls back to PBKDF2-SHA256 if unavailable)
- JWT tokens expire after 8 hours
- All CRUD permissions enforced server-side
- File upload validation prevents path traversal and executable uploads
- Audit logs are immutable and never contain secrets
- Debug mode disabled in production
- CORS configured with explicit allowlist

---

*LandGuard v1.0.0 — Built for municipal survey intelligence. All datasets are simulated.*
