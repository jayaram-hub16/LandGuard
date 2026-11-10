"""
Encroachment Detection Engine
OOP: DetectionEngine class compares registered parcel boundaries vs observed land use.
DISCLAIMER: All findings are PRELIMINARY and require verification by an authorized surveyor.
"""
import json
import math
from typing import Optional
from app import db
from app.models import LandParcel, EncroachmentDetection, LandUseCategory, ReviewStatus
from app.services.gis_service import (
    geojson_to_polygon, calculate_overlap, area_sqm_from_geojson,
    compute_overlap_geojson, determine_severity
)


class EncroachmentFlag:
    """
    Value object representing a detected encroachment finding.
    NOT a legal determination — preliminary geometric analysis only.
    """

    def __init__(
        self,
        parcel_id: str,
        reason: str,
        registered_area: Optional[float],
        observed_area: Optional[float],
        overlap_area: Optional[float],
        detected_use: LandUseCategory,
        registered_use: LandUseCategory,
        confidence: Optional[float],
        severity: str,
        overlap_geojson: Optional[dict] = None,
    ):
        self.parcel_id = parcel_id
        self.reason = reason
        self.registered_area = registered_area
        self.observed_area = observed_area
        self.overlap_area = overlap_area
        self.detected_use = detected_use
        self.registered_use = registered_use
        self.confidence = confidence
        self.severity = severity
        self.overlap_geojson = overlap_geojson

    def area_difference_sqm(self) -> Optional[float]:
        if self.registered_area and self.observed_area:
            return abs(self.registered_area - self.observed_area)
        return None

    def area_difference_pct(self) -> Optional[float]:
        if self.registered_area and self.registered_area > 0 and self.observed_area:
            return round(abs(self.registered_area - self.observed_area) / self.registered_area * 100, 2)
        return None


class DetectionEngine:
    """
    Main encroachment detection engine.
    Compares registered parcel data against observed/simulated land-use data.
    """

    # Configurable thresholds
    AREA_TOLERANCE_PCT = 5.0        # ≥5% area difference triggers flag
    MIN_OVERLAP_SQM = 10.0          # minimum meaningful overlap to flag

    def run_detection(self) -> dict:
        """Run detection across all parcels. Returns summary stats."""
        parcels = LandParcel.query.all()
        created = 0
        scanned = len(parcels)

        for parcel in parcels:
            flags = self._analyze_parcel(parcel)
            for flag in flags:
                # Avoid duplicate detections
                existing = EncroachmentDetection.query.filter_by(
                    parcel_id=parcel.id
                ).filter(
                    EncroachmentDetection.review_status == ReviewStatus.PENDING
                ).first()

                if not existing:
                    detection = EncroachmentDetection(
                        parcel_id=parcel.id,
                        registered_area_sqm=flag.registered_area,
                        observed_area_sqm=flag.observed_area,
                        overlap_area_sqm=flag.overlap_area,
                        area_difference_sqm=flag.area_difference_sqm(),
                        area_difference_pct=flag.area_difference_pct(),
                        detected_land_use=flag.detected_use,
                        registered_land_use=flag.registered_use,
                        detection_reason=flag.reason,
                        model_confidence=flag.confidence,
                        severity=flag.severity,
                        review_status=ReviewStatus.PENDING,
                        encroachment_boundary_geojson=(
                            json.dumps(flag.overlap_geojson)
                            if flag.overlap_geojson else None
                        ),
                    )
                    db.session.add(detection)
                    parcel.is_flagged = True
                    created += 1

        db.session.flush()
        return {
            "scanned": scanned,
            "created": created,
            "message": (
                f"Detection complete. Scanned {scanned} parcels, "
                f"created {created} new preliminary findings. "
                "All findings require verification by an authorized surveyor."
            ),
        }

    def _analyze_parcel(self, parcel: LandParcel) -> list[EncroachmentFlag]:
        """Analyze a single parcel for potential encroachment indicators."""
        flags = []

        if not parcel.boundary_geojson:
            return flags

        try:
            boundary = json.loads(parcel.boundary_geojson)
        except (json.JSONDecodeError, TypeError):
            return flags

        registered_geom = geojson_to_polygon(boundary)
        if registered_geom is None:
            return flags

        # Strategy 1: Land-use mismatch (registered vs observed)
        if (parcel.registered_land_use != LandUseCategory.UNKNOWN and
                parcel.observed_land_use != LandUseCategory.UNKNOWN and
                parcel.registered_land_use != parcel.observed_land_use):

            flag = self._create_land_use_mismatch_flag(parcel, registered_geom)
            if flag:
                flags.append(flag)

        # Strategy 2: Area discrepancy (simulated observed area differs from registered)
        if parcel.registered_area_sqm and parcel.registered_area_sqm > 0:
            flag = self._create_area_discrepancy_flag(parcel, registered_geom)
            if flag:
                flags.append(flag)

        # Strategy 3: Check overlap with adjacent parcels
        adjacent_flags = self._check_adjacent_overlap(parcel, registered_geom)
        flags.extend(adjacent_flags)

        return flags

    def _create_land_use_mismatch_flag(
        self, parcel: LandParcel, registered_geom
    ) -> Optional[EncroachmentFlag]:
        """Flag when observed land use differs from registered land use."""
        reg_area = parcel.registered_area_sqm or area_sqm_from_geojson(
            json.loads(parcel.boundary_geojson)
        )
        # Simulate slightly different observed area
        import random
        rng = random.Random(hash(parcel.id) % (2**32))
        obs_area = reg_area * rng.uniform(1.05, 1.35) if reg_area else None

        diff_pct = 0.0
        if reg_area and obs_area:
            diff_pct = abs(reg_area - obs_area) / reg_area * 100

        severity = determine_severity(diff_pct, 0)

        return EncroachmentFlag(
            parcel_id=parcel.id,
            reason=(
                f"Land-use mismatch: Registered as '{parcel.registered_land_use.value}', "
                f"observed as '{parcel.observed_land_use.value}'. "
                f"Area difference: {diff_pct:.1f}%."
            ),
            registered_area=reg_area,
            observed_area=obs_area,
            overlap_area=None,
            detected_use=parcel.observed_land_use,
            registered_use=parcel.registered_land_use,
            confidence=0.72,
            severity=severity,
        )

    def _create_area_discrepancy_flag(
        self, parcel: LandParcel, registered_geom
    ) -> Optional[EncroachmentFlag]:
        """Flag when computed area significantly differs from registered area."""
        import random
        rng = random.Random((hash(parcel.id) + 1) % (2**32))

        computed_area = area_sqm_from_geojson(json.loads(parcel.boundary_geojson))
        if not computed_area:
            return None

        # Simulate an observed area discrepancy
        observed_area = parcel.registered_area_sqm * rng.uniform(1.08, 1.25)
        diff_pct = abs(parcel.registered_area_sqm - observed_area) / parcel.registered_area_sqm * 100

        if diff_pct < self.AREA_TOLERANCE_PCT:
            return None

        severity = determine_severity(diff_pct, 0)

        return EncroachmentFlag(
            parcel_id=parcel.id,
            reason=(
                f"Area discrepancy detected: Registered {parcel.registered_area_sqm:.1f} m², "
                f"observed {observed_area:.1f} m² ({diff_pct:.1f}% difference). "
                f"Exceeds {self.AREA_TOLERANCE_PCT}% tolerance threshold."
            ),
            registered_area=parcel.registered_area_sqm,
            observed_area=round(observed_area, 2),
            overlap_area=None,
            detected_use=parcel.observed_land_use or LandUseCategory.UNKNOWN,
            registered_use=parcel.registered_land_use or LandUseCategory.UNKNOWN,
            confidence=0.65,
            severity=severity,
        )

    def _check_adjacent_overlap(
        self, parcel: LandParcel, registered_geom
    ) -> list[EncroachmentFlag]:
        """Check if this parcel's boundary overlaps with adjacent parcels."""
        flags = []
        # In production: spatial query using PostGIS ST_Intersects
        # For SQLite demo: check nearby parcels by lat/lng proximity
        if not parcel.centroid_lat or not parcel.centroid_lng:
            return flags

        nearby = LandParcel.query.filter(
            LandParcel.id != parcel.id,
            LandParcel.centroid_lat.isnot(None),
            LandParcel.centroid_lng.isnot(None),
        ).limit(20).all()

        for neighbor in nearby:
            if not neighbor.boundary_geojson:
                continue
            try:
                neighbor_geom = geojson_to_polygon(json.loads(neighbor.boundary_geojson))
                if neighbor_geom is None:
                    continue

                overlap = calculate_overlap(registered_geom, neighbor_geom)
                if overlap and overlap > 0:
                    # Convert to approximate sqm
                    lat_rad = math.radians(parcel.centroid_lat)
                    overlap_sqm = overlap * (111_139.0 ** 2) * math.cos(lat_rad)

                    if overlap_sqm >= self.MIN_OVERLAP_SQM:
                        overlap_geojson = compute_overlap_geojson(registered_geom, neighbor_geom)
                        overlap_pct = (overlap_sqm / parcel.registered_area_sqm * 100
                                       if parcel.registered_area_sqm else 0)
                        severity = determine_severity(0, overlap_pct)

                        flags.append(EncroachmentFlag(
                            parcel_id=parcel.id,
                            reason=(
                                f"Boundary overlap with adjacent parcel {neighbor.parcel_id}: "
                                f"~{overlap_sqm:.1f} m² ({overlap_pct:.1f}%) intersection detected."
                            ),
                            registered_area=parcel.registered_area_sqm,
                            observed_area=None,
                            overlap_area=round(overlap_sqm, 2),
                            detected_use=LandUseCategory.UNKNOWN,
                            registered_use=parcel.registered_land_use or LandUseCategory.UNKNOWN,
                            confidence=0.80,
                            severity=severity,
                            overlap_geojson=overlap_geojson,
                        ))
            except Exception:
                continue

        return flags
