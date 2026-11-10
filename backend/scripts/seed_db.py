"""
Seed script — generates simulated GIS land parcel data.
All data is synthetic and clearly marked as SIMULATED.
"""
import json
import math
import random
from datetime import date, datetime, timezone, timedelta
from app import db
from app.models import (
    User, UserRole, UserStatus, OwnershipRecord,
    LandParcel, LandUseCategory, EncroachmentDetection,
    ReviewStatus, Dataset, DatasetStatus, AuditLog
)
from app.utils.auth import hash_password


def make_polygon(center_lat, center_lng, width_m=200, height_m=150, rotation_deg=0):
    """Generate a rectangular GeoJSON polygon around a center point."""
    lat_per_m = 1 / 111_139.0
    lng_per_m = 1 / (111_139.0 * math.cos(math.radians(center_lat)))

    half_w = width_m / 2 * lng_per_m
    half_h = height_m / 2 * lat_per_m

    coords = [
        [center_lng - half_w, center_lat - half_h],
        [center_lng + half_w, center_lat - half_h],
        [center_lng + half_w, center_lat + half_h],
        [center_lng - half_w, center_lat + half_h],
        [center_lng - half_w, center_lat - half_h],  # close
    ]
    return {"type": "Polygon", "coordinates": [coords]}


def run_seed():
    """Main seed function."""
    rng = random.Random(42)

    # ── Sample locations (Indian cities for demo) ──────────────
    locations = [
        {"city": "Bengaluru", "district": "Bengaluru Urban", "state": "Karnataka",
         "lat": 12.9716, "lng": 77.5946},
        {"city": "Hyderabad", "district": "Hyderabad", "state": "Telangana",
         "lat": 17.3850, "lng": 78.4867},
        {"city": "Chennai", "district": "Chennai", "state": "Tamil Nadu",
         "lat": 13.0827, "lng": 80.2707},
        {"city": "Pune", "district": "Pune", "state": "Maharashtra",
         "lat": 18.5204, "lng": 73.8567},
        {"city": "Ahmedabad", "district": "Ahmedabad", "state": "Gujarat",
         "lat": 23.0225, "lng": 72.5714},
        {"city": "Kochi", "district": "Ernakulam", "state": "Kerala",
         "lat": 9.9312, "lng": 76.2673},
        {"city": "Jaipur", "district": "Jaipur", "state": "Rajasthan",
         "lat": 26.9124, "lng": 75.7873},
        {"city": "Bhopal", "district": "Bhopal", "state": "Madhya Pradesh",
         "lat": 23.2599, "lng": 77.4126},
    ]

    land_uses = [
        LandUseCategory.RESIDENTIAL, LandUseCategory.COMMERCIAL,
        LandUseCategory.AGRICULTURE, LandUseCategory.INDUSTRIAL,
        LandUseCategory.OTHER,
    ]

    # ── Ownership Records ──────────────────────────────────────
    owners = []
    owner_names = [
        "Suresh Kumar", "Priya Patel", "Ramesh Nair", "Anita Sharma",
        "Mohammed Hussain", "Lakshmi Devi", "Vikram Singh", "Deepa Menon",
        "Rajesh Gupta", "Sunita Joshi", "Arjun Reddy", "Kavitha Rao",
        "Santhosh Thomas", "Meena Krishnan", "Ganesh Iyer", "Pooja Mehta",
    ]
    for i, name in enumerate(owner_names):
        ref = f"OWN-{2024:04d}-{i+1:04d}"
        if not OwnershipRecord.query.filter_by(owner_reference=ref).first():
            owner = OwnershipRecord(
                owner_name=name,
                owner_reference=ref,
                registration_reference=f"REG-{rng.randint(10000, 99999)}",
                registered_date=date(rng.randint(2005, 2023), rng.randint(1, 12), rng.randint(1, 28)),
                is_simulated=True,
                notes="SIMULATED RECORD — for demonstration only",
            )
            db.session.add(owner)
            owners.append(owner)
    db.session.flush()

    # Re-fetch
    owners = OwnershipRecord.query.all()

    # ── Simulated Dataset ──────────────────────────────────────
    ds = Dataset.query.filter_by(name="Simulated Survey Dataset 2024").first()
    if not ds:
        ds = Dataset(
            name="Simulated Survey Dataset 2024",
            description="Synthetic GIS dataset for demonstration. NOT real survey data.",
            file_type="geojson",
            file_size_bytes=102400,
            feature_count=50,
            status=DatasetStatus.PROCESSED,
            crs="EPSG:4326",
        )
        db.session.add(ds)
        db.session.flush()

    # ── Land Parcels ───────────────────────────────────────────
    parcel_count = 0
    for loc_idx, loc in enumerate(locations):
        for j in range(6):
            state_code = str(loc["state"])[:3].upper()
            parcel_id = f"PL-{state_code}-{loc_idx+1:02d}{j+1:02d}"
            if LandParcel.query.filter_by(parcel_id=parcel_id).first():
                continue

            lat_offset = rng.uniform(-0.05, 0.05)
            lng_offset = rng.uniform(-0.05, 0.05)
            clat = float(loc["lat"]) + lat_offset
            clng = float(loc["lng"]) + lng_offset

            width_m = rng.uniform(100, 800)
            height_m = rng.uniform(80, 500)
            area_sqm = width_m * height_m

            reg_lu = rng.choice(land_uses)
            # 30% chance of land-use mismatch (potential encroachment indicator)
            if rng.random() < 0.30:
                obs_lu = rng.choice([lu for lu in land_uses if lu != reg_lu])
            else:
                obs_lu = reg_lu

            boundary = make_polygon(clat, clng, width_m, height_m)

            parcel = LandParcel(
                parcel_id=parcel_id,
                ownership_id=rng.choice(owners).id if owners else None,
                dataset_id=ds.id,
                registered_area_sqm=round(area_sqm, 2),
                boundary_geojson=json.dumps(boundary),
                centroid_lat=clat,
                centroid_lng=clng,
                administrative_area=loc["city"],
                district=loc["district"],
                state=loc["state"],
                address=f"Survey No. {rng.randint(100, 9999)}, {loc['city']}",
                registered_land_use=reg_lu,
                observed_land_use=obs_lu,
                is_flagged=False,
                is_simulated=True,
                review_status="Active",
            )
            db.session.add(parcel)
            parcel_count += 1

    db.session.flush()
    print(f"  → Created {parcel_count} land parcels")

    # ── Sample Detections ──────────────────────────────────────
    parcels = LandParcel.query.filter_by(is_simulated=True).all()
    flagged_parcels = [p for p in parcels if p.registered_land_use != p.observed_land_use]

    det_count = 0
    severities = ["Low", "Medium", "High", "Critical"]
    statuses = [ReviewStatus.PENDING, ReviewStatus.UNDER_INVESTIGATION,
                ReviewStatus.VERIFIED, ReviewStatus.FALSE_POSITIVE]

    for parcel in flagged_parcels[:20]:
        existing = EncroachmentDetection.query.filter_by(parcel_id=parcel.id).first()
        if existing:
            continue

        reg_area = parcel.registered_area_sqm or 1000
        obs_area = reg_area * rng.uniform(1.05, 1.40)
        diff_pct = abs(reg_area - obs_area) / reg_area * 100

        det = EncroachmentDetection(
            parcel_id=parcel.id,
            dataset_id=ds.id,
            registered_area_sqm=reg_area,
            observed_area_sqm=round(obs_area, 2),
            overlap_area_sqm=round(rng.uniform(50, 300), 2),
            area_difference_sqm=round(abs(reg_area - obs_area), 2),
            area_difference_pct=round(diff_pct, 2),
            detected_land_use=parcel.observed_land_use,
            registered_land_use=parcel.registered_land_use,
            detection_reason=(
                f"Land-use mismatch: registered as '{parcel.registered_land_use.value}', "
                f"observed as '{parcel.observed_land_use.value}'. "
                f"Area discrepancy: {diff_pct:.1f}%."
            ),
            model_confidence=round(rng.uniform(0.60, 0.92), 4),
            severity=rng.choice(severities),
            review_status=rng.choice(statuses),
        )
        db.session.add(det)
        parcel.is_flagged = True
        det_count += 1

    db.session.flush()
    print(f"  → Created {det_count} sample detection records")

    db.session.commit()
    print("✅ Seed complete.")
