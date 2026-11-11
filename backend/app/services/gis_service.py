"""
GIS Service — Geometry validation, spatial operations, coordinate handling.
Uses Shapely for geometry operations.
"""
import json
import math
from typing import Optional


def validate_geojson(data: dict) -> tuple[list, int]:
    """
    Validate a GeoJSON FeatureCollection.
    Returns (errors, feature_count).
    """
    errors = []
    feature_count = 0

    if not isinstance(data, dict):
        return ["Not a valid JSON object."], 0

    gtype = data.get("type")
    if gtype not in ("FeatureCollection", "Feature", "Polygon", "MultiPolygon"):
        errors.append(f"Unsupported GeoJSON type: {gtype}")
        return errors, 0

    if gtype == "FeatureCollection":
        features = data.get("features", [])
        if not isinstance(features, list):
            errors.append("'features' must be an array.")
            return errors, 0
        feature_count = len(features)
        for i, feat in enumerate(features[:50]):  # validate first 50
            ferrs = _validate_feature(feat, i)
            errors.extend(ferrs)
    elif gtype == "Feature":
        feature_count = 1
        errors.extend(_validate_feature(data, 0))

    return errors, feature_count


def _validate_feature(feat, idx):
    errors = []
    if feat.get("type") != "Feature":
        errors.append(f"Feature[{idx}]: type must be 'Feature'.")
    geom = feat.get("geometry")
    if not geom:
        errors.append(f"Feature[{idx}]: missing geometry.")
        return errors
    if geom.get("type") not in ("Polygon", "MultiPolygon", "Point", "LineString"):
        errors.append(f"Feature[{idx}]: unsupported geometry type '{geom.get('type')}'.")
    coords = geom.get("coordinates")
    if not coords:
        errors.append(f"Feature[{idx}]: missing coordinates.")
    return errors


def parse_geojson_features(data: dict) -> list[dict]:
    """Extract features list from GeoJSON."""
    if data.get("type") == "FeatureCollection":
        return data.get("features", [])
    elif data.get("type") == "Feature":
        return [data]
    return []


def geojson_to_polygon(geojson: dict):
    """Convert GeoJSON geometry dict to Shapely geometry or None."""
    try:
        from shapely.geometry import shape
        return shape(geojson)
    except Exception:
        return None


def calculate_overlap(geom_a, geom_b) -> Optional[float]:
    """Return overlap area in square degrees (for demo). Use projected CRS for real use."""
    try:
        if geom_a is None or geom_b is None:
            return None
        intersection = geom_a.intersection(geom_b)
        return intersection.area
    except Exception:
        return None


def area_sqm_from_geojson(geojson_dict: dict) -> Optional[float]:
    """
    Estimate area in square meters from GeoJSON polygon.
    Uses a simple spherical approximation. For production, reproject to UTM.
    """
    try:
        from shapely.geometry import shape
        geom = shape(geojson_dict)
        # Approximate: 1 degree lat ≈ 111,139 m, 1 degree lon ≈ 111,139 * cos(lat) m
        centroid = geom.centroid
        lat_rad = math.radians(centroid.y)
        lat_m = 111_139.0
        lon_m = 111_139.0 * math.cos(lat_rad)
        area_sq_deg = geom.area
        area_sqm = area_sq_deg * lat_m * lon_m
        return round(area_sqm, 2)
    except Exception:
        return None


def compute_centroid(geojson_dict: dict) -> tuple[Optional[float], Optional[float]]:
    """Return (lat, lng) centroid of a GeoJSON geometry."""
    try:
        from shapely.geometry import shape
        geom = shape(geojson_dict)
        c = geom.centroid
        return round(c.y, 6), round(c.x, 6)
    except Exception:
        return None, None


def compute_overlap_geojson(geom_a, geom_b) -> Optional[dict]:
    """Compute intersection as GeoJSON dict."""
    try:
        from shapely.geometry import mapping
        intersection = geom_a.intersection(geom_b)
        if intersection.is_empty:
            return None
        return json.loads(json.dumps(mapping(intersection)))
    except Exception:
        return None


def determine_severity(area_diff_pct: float, overlap_pct: float) -> str:
    """Classify encroachment severity based on area differences."""
    if area_diff_pct >= 30 or overlap_pct >= 25:
        return "Critical"
    elif area_diff_pct >= 15 or overlap_pct >= 10:
        return "High"
    elif area_diff_pct >= 5 or overlap_pct >= 5:
        return "Medium"
    return "Low"
