"""
AI & GIS Model Centre — Blueprint
Provides status checks and execution endpoints for 6 AI/GIS models.

Models 1, 2, 5 require external data and return "not_configured".
Model 3 (LULC) uses the existing scikit-learn classifier — simulated features only.
Model 4 (Boundary Overlap) uses existing Shapely GIS service — real geometry analysis.
Model 6 (Waterbody) fetches OpenStreetMap Overpass API — requires outbound network.
"""
import json
import logging
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app
from app.utils.auth import login_required, admin_required

from app import db
from app.models import LandParcel, LandUseCategory
from app.models.ai_model_run import AIModelRun

logger = logging.getLogger(__name__)

ai_models_bp = Blueprint("ai_models", __name__)

# ─────────────────────────────────────────────────────────
# Model catalogue — all 6 models
# ─────────────────────────────────────────────────────────

MODEL_CATALOGUE = {
    "change-detection": {
        "name": "AI Satellite Image Change Detection",
        "description": (
            "Compares historical and recent satellite images to detect new structures, "
            "land-use changes, and boundary shifts."
        ),
        "status": "not_configured",
        "reason": (
            "Requires two dated GeoTIFF satellite images (before and after) registered "
            "to the same coordinate reference system. Recommended sources: "
            "ISRO Bhuvan, Sentinel-2 (Copernicus Open Access), or Google Earth Engine."
        ),
        "requirements": [
            "Before-image GeoTIFF (dated)",
            "After-image GeoTIFF (dated)",
            "Change-detection model weights (optional — rule-based fallback available)",
        ],
    },
    "building-detection": {
        "name": "AI Building Footprint Detection",
        "description": (
            "Identifies buildings and structures from satellite imagery, generates "
            "footprint polygons, and compares them against registered parcel boundaries."
        ),
        "status": "not_configured",
        "reason": (
            "Requires high-resolution satellite imagery (≤1 m resolution) and a trained "
            "building segmentation model (e.g., DeepLabV3, U-Net). "
            "No model weights are included in this installation."
        ),
        "requirements": [
            "High-resolution satellite image GeoTIFF (≤1 m/px)",
            "Trained building segmentation model weights",
        ],
    },
    "lulc": {
        "name": "Land Use & Land Cover (LULC) Classification",
        "description": (
            "Classifies registered parcels into 8 land-use categories using geometric "
            "features. Displays results as a colour-coded map layer with legend."
        ),
        "status": "available",
        "reason": None,
        "requirements": [],
        "disclaimer": (
            "SIMULATED MODEL — The classifier is trained on synthetic geometric features "
            "only. It does NOT use real satellite imagery. Classifications are for "
            "demonstration purposes and do not reflect actual on-ground land use."
        ),
    },
    "boundary-overlap": {
        "name": "GIS Parcel Boundary Overlap Analysis",
        "description": (
            "Performs geometric intersection analysis on registered parcel boundaries to "
            "identify overlapping areas. Reports overlap in m² and ft² with severity."
        ),
        "status": "available",
        "reason": None,
        "requirements": [],
        "disclaimer": (
            "GEOMETRIC ANALYSIS ONLY — This is a spatial computation using registered "
            "boundary data. It does NOT constitute legal proof of encroachment or ownership."
        ),
    },
    "dem": {
        "name": "3D Digital Elevation Model (DEM) Terrain Visualisation",
        "description": (
            "Renders terrain elevation data as a colour-gradient or 3-D hillshade overlay, "
            "showing slopes and watercourse paths over parcel boundaries."
        ),
        "status": "not_configured",
        "reason": (
            "Requires a DEM raster in GeoTIFF format. Free sources: "
            "SRTM (30 m, NASA), ASTER GDEM (30 m), Copernicus DEM (30 m). "
            "Upload a GeoTIFF to enable this model."
        ),
        "requirements": [
            "DEM GeoTIFF (SRTM, ASTER GDEM, or Copernicus DEM — 30 m recommended)",
        ],
    },
    "waterbody": {
        "name": "River & Waterbody Monitoring",
        "description": (
            "Fetches waterbody polygons (rivers, lakes, ponds) from OpenStreetMap for "
            "the area covered by registered parcels and displays them on the GIS map."
        ),
        "status": "available",
        "reason": None,
        "requirements": [],
        "disclaimer": (
            "DATA SOURCE: OpenStreetMap (CC BY-SA). Waterbody data is community-maintained "
            "and may be incomplete or outdated. This is NOT authoritative hydrological data."
        ),
    },
}


def _require_admin():
    """Return (user, error_response). error_response is None if check passes."""
    user = getattr(request, "current_user", None)
    if not user:
        return None, (jsonify({"error": "Authentication required"}), 401)
    if not user.is_admin():
        return None, (jsonify({"error": "Admin access required"}), 403)
    return user, None


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─────────────────────────────────────────────────────────
# GET /api/ai-models/status
# ─────────────────────────────────────────────────────────

@ai_models_bp.route("/status", methods=["GET"])
@login_required
def model_status():
    """Return catalogue status for all 6 models + last run info."""
    result = {}
    for key, info in MODEL_CATALOGUE.items():
        last_run = (
            AIModelRun.query
            .filter_by(model_name=key)
            .order_by(AIModelRun.started_at.desc())
            .first()
        )
        entry = {
            "name": info["name"],
            "description": info["description"],
            "status": info["status"],
            "requirements": info.get("requirements", []),
            "disclaimer": info.get("disclaimer"),
        }
        if info["status"] == "not_configured":
            entry["reason"] = info["reason"]
        if last_run:
            entry["last_run"] = {
                "id": last_run.id,
                "run_status": last_run.status,
                "started_at": last_run.started_at.isoformat() if last_run.started_at else None,
                "completed_at": last_run.completed_at.isoformat() if last_run.completed_at else None,
                "confidence": last_run.confidence,
                "summary": last_run.output_summary,
            }
        else:
            entry["last_run"] = None
        result[key] = entry
    return jsonify(result), 200


# ─────────────────────────────────────────────────────────
# GET /api/ai-models/<model>/runs
# ─────────────────────────────────────────────────────────

@ai_models_bp.route("/<model>/runs", methods=["GET"])
@login_required
def list_runs(model):
    """List past runs for a given model (paginated, newest first)."""
    if model not in MODEL_CATALOGUE:
        return jsonify({"error": f"Unknown model '{model}'"}), 404
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    q = (
        AIModelRun.query
        .filter_by(model_name=model)
        .order_by(AIModelRun.started_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify({
        "runs": [r.to_dict() for r in q.items],
        "total": q.total,
        "page": q.page,
        "pages": q.pages,
    }), 200


# ─────────────────────────────────────────────────────────
# GET /api/ai-models/<model>/runs/<run_id>
# ─────────────────────────────────────────────────────────

@ai_models_bp.route("/<model>/runs/<run_id>", methods=["GET"])
@login_required
def get_run(model, run_id):
    """Get details of a specific run including result GeoJSON."""
    run = AIModelRun.query.filter_by(id=run_id, model_name=model).first_or_404()
    return jsonify(run.to_dict(include_geojson=True)), 200


# ─────────────────────────────────────────────────────────
# POST /api/ai-models/lulc/run  (Model 3)
# ─────────────────────────────────────────────────────────

@ai_models_bp.route("/lulc/run", methods=["POST"])
@login_required
def run_lulc():
    """
    Run Land Use & Land Cover classification on all parcels using the
    existing scikit-learn classifier (simulated geometric features only).
    """
    user, err = _require_admin()
    if err:
        return err

    run = AIModelRun(
        model_name="lulc",
        status="processing",
        started_at=_utcnow(),
        created_by=user.id,
        input_params=json.dumps({"source": "all_parcels"}),
    )
    db.session.add(run)
    db.session.commit()

    try:
        from app.services.classification_service import LandUseClassifier
        classifier = LandUseClassifier()

        parcels = LandParcel.query.all()
        features = []
        classified_count = 0
        confidence_sum = 0.0

        # Colour map matching the existing frontend LAND_USE_COLORS
        LULC_COLORS = {
            "Residential":  "#ef4444",
            "Commercial":   "#f97316",
            "Agriculture":  "#22c55e",
            "Road":         "#6b7280",
            "Water Body":   "#3b82f6",
            "Forest":       "#16a34a",
            "Industrial":   "#8b5cf6",
            "Other":        "#d97706",
            "Unknown":      "#9ca3af",
        }

        for parcel in parcels:
            boundary = parcel.get_boundary()
            if not boundary:
                continue
            try:
                # Build feature dict using parcel attributes for the classifier
                features_input = {
                    "area_sqm": parcel.registered_area_sqm or 500.0,
                    "ndvi": 0.3,              # default — no real imagery available
                    "building_density": 0.3,
                    "impervious_surface": 0.4,
                    "water_index": 0.1,
                    "road_distance_m": 100.0,
                }
                result = classifier.predict_single(features_input)
                land_use = result.get("label", "Unknown")
                confidence = float(result.get("confidence") or 0.5)
                confidence_sum += confidence
                classified_count += 1

                feature = {
                    "type": "Feature",
                    "geometry": boundary,
                    "properties": {
                        "parcel_id": parcel.parcel_id,
                        "id": parcel.id,
                        "land_use": land_use,
                        "confidence": round(confidence, 3),
                        "color": LULC_COLORS.get(land_use, "#9ca3af"),
                        "registered_land_use": (
                            parcel.registered_land_use.value
                            if parcel.registered_land_use else "Unknown"
                        ),
                        "area_sqm": parcel.registered_area_sqm,
                        "district": parcel.district,
                    },
                }
                features.append(feature)
            except Exception as exc:
                logger.warning("LULC classification failed for parcel %s: %s", parcel.parcel_id, exc)

        avg_confidence = round(confidence_sum / classified_count, 3) if classified_count else 0.0
        geojson = {"type": "FeatureCollection", "features": features}
        summary = {
            "parcels_classified": classified_count,
            "parcels_total": len(parcels),
            "average_confidence": avg_confidence,
            "disclaimer": MODEL_CATALOGUE["lulc"]["disclaimer"],
        }

        run.status = "completed"
        run.completed_at = _utcnow()
        run.confidence = avg_confidence
        run.output_summary = json.dumps(summary)
        run.result_geojson = json.dumps(geojson)
        db.session.commit()

        return jsonify({
            "run_id": run.id,
            "status": "completed",
            "summary": summary,
            "geojson": geojson,
        }), 200

    except Exception as exc:
        logger.error("LULC run failed: %s", exc)
        run.status = "failed"
        run.completed_at = _utcnow()
        run.error_message = str(exc)
        db.session.commit()
        return jsonify({"error": "LULC analysis failed", "detail": str(exc)}), 500


# ─────────────────────────────────────────────────────────
# POST /api/ai-models/boundary-overlap/run  (Model 4)
# ─────────────────────────────────────────────────────────

@ai_models_bp.route("/boundary-overlap/run", methods=["POST"])
@login_required
def run_boundary_overlap():
    """
    Run GIS boundary overlap analysis on all parcels using existing Shapely service.
    Returns a GeoJSON FeatureCollection of parcels annotated with overlap data.
    """
    user, err = _require_admin()
    if err:
        return err

    run = AIModelRun(
        model_name="boundary-overlap",
        status="processing",
        started_at=_utcnow(),
        created_by=user.id,
        input_params=json.dumps({"source": "all_parcels"}),
    )
    db.session.add(run)
    db.session.commit()

    try:
        from app.services.gis_service import geojson_to_polygon, determine_severity

        parcels = LandParcel.query.all()
        SQM_TO_SQFT = 10.7639

        # Build Shapely polygons for all parcels
        poly_map = {}   # parcel.id -> Shapely polygon
        for p in parcels:
            boundary = p.get_boundary()
            if not boundary:
                continue
            try:
                poly = geojson_to_polygon(boundary)
                if poly and not poly.is_empty:
                    poly_map[p.id] = (p, poly)
            except Exception:
                pass

        parcel_list = list(poly_map.values())
        overlap_results = []

        # O(n²) overlap detection — acceptable for ≤500 parcels
        for i, (p_a, poly_a) in enumerate(parcel_list):
            overlaps_found = []
            for j, (p_b, poly_b) in enumerate(parcel_list):
                if i >= j:
                    continue
                try:
                    if poly_a.intersects(poly_b):
                        inter = poly_a.intersection(poly_b)
                        area_sqm = inter.area
                        if area_sqm < 0.01:   # ignore sub-centimetre artefacts
                            continue
                        area_sqft = round(area_sqm * SQM_TO_SQFT, 2)
                        area_sqm_r = round(area_sqm, 2)
                        pct_a = round((area_sqm / poly_a.area) * 100, 2) if poly_a.area else 0
                        pct_b = round((area_sqm / poly_b.area) * 100, 2) if poly_b.area else 0
                        # determine_severity(area_diff_pct, overlap_pct) — use overlap pct as both args
                        severity = determine_severity(pct_a, pct_a)
                        overlaps_found.append({
                            "overlapping_parcel_id": p_b.parcel_id,
                            "overlap_area_sqm": area_sqm_r,
                            "overlap_area_sqft": area_sqft,
                            "overlap_pct_this": pct_a,
                            "overlap_pct_other": pct_b,
                            "severity": severity,
                        })
                except Exception as exc:
                    logger.debug("Overlap check %s/%s failed: %s", p_a.parcel_id, p_b.parcel_id, exc)

            overlap_results.append({
                "parcel": p_a,
                "poly": poly_a,
                "overlaps": overlaps_found,
            })

        features = []
        total_overlapping = 0
        for item in overlap_results:
            p = item["parcel"]
            boundary = p.get_boundary()
            has_overlap = len(item["overlaps"]) > 0
            if has_overlap:
                total_overlapping += 1
            max_overlap_area = max(
                (o["overlap_area_sqm"] for o in item["overlaps"]), default=0
            )
            top_severity = "None"
            if item["overlaps"]:
                severity_order = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1, "None": 0}
                top_severity = max(
                    item["overlaps"],
                    key=lambda x: severity_order.get(x["severity"], 0)
                )["severity"]

            SEVERITY_COLORS = {
                "Critical": "#dc2626",
                "High": "#ea580c",
                "Medium": "#d97706",
                "Low": "#65a30d",
                "None": "#22c55e",
            }
            features.append({
                "type": "Feature",
                "geometry": boundary,
                "properties": {
                    "parcel_id": p.parcel_id,
                    "id": p.id,
                    "has_overlap": has_overlap,
                    "overlap_count": len(item["overlaps"]),
                    "max_overlap_area_sqm": round(max_overlap_area, 2),
                    "max_overlap_area_sqft": round(max_overlap_area * SQM_TO_SQFT, 2),
                    "top_severity": top_severity,
                    "color": SEVERITY_COLORS.get(top_severity, "#22c55e"),
                    "overlaps": item["overlaps"],
                    "district": p.district,
                    "area_sqm": p.registered_area_sqm,
                },
            })

        geojson = {"type": "FeatureCollection", "features": features}
        summary = {
            "parcels_analysed": len(parcel_list),
            "parcels_with_overlap": total_overlapping,
            "disclaimer": MODEL_CATALOGUE["boundary-overlap"]["disclaimer"],
        }

        run.status = "completed"
        run.completed_at = _utcnow()
        run.confidence = round(1.0, 3)   # Geometric analysis — confidence is 1.0
        run.output_summary = json.dumps(summary)
        run.result_geojson = json.dumps(geojson)
        db.session.commit()

        return jsonify({
            "run_id": run.id,
            "status": "completed",
            "summary": summary,
            "geojson": geojson,
        }), 200

    except Exception as exc:
        logger.error("Boundary overlap run failed: %s", exc)
        run.status = "failed"
        run.completed_at = _utcnow()
        run.error_message = str(exc)
        db.session.commit()
        return jsonify({"error": "Boundary overlap analysis failed", "detail": str(exc)}), 500


# ─────────────────────────────────────────────────────────
# POST /api/ai-models/waterbody/fetch  (Model 6)
# ─────────────────────────────────────────────────────────

@ai_models_bp.route("/waterbody/fetch", methods=["POST"])
@login_required
def fetch_waterbodies():
    """
    Fetch waterbody polygons from OpenStreetMap Overpass API for the region
    covered by registered parcels.  Requires outbound internet access.
    """
    user, err = _require_admin()
    if err:
        return err

    run = AIModelRun(
        model_name="waterbody",
        status="processing",
        started_at=_utcnow(),
        created_by=user.id,
        input_params=json.dumps({"source": "openstreetmap_overpass"}),
    )
    db.session.add(run)
    db.session.commit()

    try:
        import urllib.request
        import urllib.parse

        # Compute bounding box from all parcel centroids
        parcels = LandParcel.query.filter(
            LandParcel.centroid_lat.isnot(None),
            LandParcel.centroid_lng.isnot(None)
        ).all()

        if not parcels:
            run.status = "failed"
            run.completed_at = _utcnow()
            run.error_message = "No parcels with centroid coordinates found."
            db.session.commit()
            return jsonify({"error": "No parcel coordinates available"}), 400

        lats = [p.centroid_lat for p in parcels]
        lngs = [p.centroid_lng for p in parcels]
        min_lat, max_lat = min(lats) - 0.05, max(lats) + 0.05
        min_lng, max_lng = min(lngs) - 0.05, max(lngs) + 0.05

        query = f"""
[out:json][timeout:25];
(
  way["natural"="water"]({min_lat},{min_lng},{max_lat},{max_lng});
  way["waterway"~"river|stream|canal"]({min_lat},{min_lng},{max_lat},{max_lng});
  relation["natural"="water"]({min_lat},{min_lng},{max_lat},{max_lng});
);
out geom;
"""
        overpass_url = "https://overpass-api.de/api/interpreter"
        encoded = urllib.parse.urlencode({"data": query}).encode("utf-8")
        req = urllib.request.Request(
            overpass_url,
            data=encoded,
            headers={"User-Agent": "LandGuard/1.0 (land-encroachment-detection-system)"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = json.loads(resp.read().decode("utf-8"))

        elements = raw.get("elements", [])
        features = []
        for el in elements:
            el_type = el.get("type")
            if el_type == "way" and "geometry" in el:
                coords = [[pt["lon"], pt["lat"]] for pt in el["geometry"]]
                # Close the ring if needed
                if coords and coords[0] != coords[-1]:
                    coords.append(coords[0])
                if len(coords) >= 4:
                    features.append({
                        "type": "Feature",
                        "geometry": {"type": "Polygon", "coordinates": [coords]},
                        "properties": {
                            "osm_id": el.get("id"),
                            "name": el.get("tags", {}).get("name", "Unnamed waterbody"),
                            "natural": el.get("tags", {}).get("natural"),
                            "waterway": el.get("tags", {}).get("waterway"),
                            "color": "#3b82f6",
                            "fill_opacity": 0.4,
                        },
                    })

        geojson = {"type": "FeatureCollection", "features": features}
        summary = {
            "waterbodies_found": len(features),
            "bbox": {
                "min_lat": min_lat, "max_lat": max_lat,
                "min_lng": min_lng, "max_lng": max_lng,
            },
            "source": "OpenStreetMap Overpass API",
            "disclaimer": MODEL_CATALOGUE["waterbody"]["disclaimer"],
        }

        run.status = "completed"
        run.completed_at = _utcnow()
        run.confidence = None
        run.output_summary = json.dumps(summary)
        run.result_geojson = json.dumps(geojson)
        db.session.commit()

        return jsonify({
            "run_id": run.id,
            "status": "completed",
            "summary": summary,
            "geojson": geojson,
        }), 200

    except Exception as exc:
        logger.error("Waterbody fetch failed: %s", exc)
        run.status = "failed"
        run.completed_at = _utcnow()
        run.error_message = str(exc)
        db.session.commit()
        return jsonify({
            "error": "Waterbody fetch failed",
            "detail": str(exc),
            "hint": (
                "This endpoint requires outbound internet access to reach "
                "overpass-api.de. Ensure the backend has network connectivity."
            ),
        }), 500


# ─────────────────────────────────────────────────────────
# GET /api/ai-models/<model>/not-configured  (Models 1, 2, 5)
# ─────────────────────────────────────────────────────────

@ai_models_bp.route("/<model>/info", methods=["GET"])
@login_required
def model_info(model):
    """Return catalogue info for a specific model."""
    info = MODEL_CATALOGUE.get(model)
    if not info:
        return jsonify({"error": f"Unknown model '{model}'"}), 404
    return jsonify({"model": model, **info}), 200

