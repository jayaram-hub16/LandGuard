"""
Parcels API Blueprint — /api/parcels
"""
import json
import os
from flask import Blueprint, request, jsonify, send_file, current_app
from app import db
from app.models import LandParcel, OwnershipRecord, LandUseCategory
from app.utils.auth import login_required, admin_required
from app.utils.audit import log_action

parcels_bp = Blueprint("parcels", __name__)



@parcels_bp.route("", methods=["GET"])
@login_required
def list_parcels():
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    search = request.args.get("search", "").strip()
    flagged = request.args.get("flagged", "").lower()
    land_use = request.args.get("land_use", "").strip()

    q = LandParcel.query

    if search:
        q = q.filter(
            db.or_(
                LandParcel.parcel_id.ilike(f"%{search}%"),
                LandParcel.administrative_area.ilike(f"%{search}%"),
                LandParcel.district.ilike(f"%{search}%"),
                LandParcel.address.ilike(f"%{search}%"),
            )
        )
    if flagged == "true":
        q = q.filter(LandParcel.is_flagged == True)
    if land_use:
        try:
            cat = LandUseCategory(land_use)
            q = q.filter(LandParcel.registered_land_use == cat)
        except ValueError:
            pass

    pagination = q.order_by(LandParcel.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        "parcels": [p.to_dict(include_geometry=True) for p in pagination.items],
        "total": pagination.total,
        "page": page,
        "per_page": per_page,
        "pages": pagination.pages,
    })


@parcels_bp.route("/my-parcels", methods=["GET"])
@login_required
def my_parcels():
    """
    Landowner Portal: return all parcels owned by the current logged-in user.
    Includes parcel geometry, detections, and linked cases.
    """
    user = request.current_user
    # Find matching ownership records
    owners = OwnershipRecord.query.filter(OwnershipRecord.contact_email.ilike(user.email)).all()
    owner_ids = [o.id for o in owners]

    # If no owners found by email, also check if owner_name matches user.full_name
    if not owner_ids and user.full_name:
        name_owners = OwnershipRecord.query.filter(OwnershipRecord.owner_name.ilike(f"%{user.full_name}%")).all()
        owner_ids = [o.id for o in name_owners]

    parcels = LandParcel.query.filter(LandParcel.ownership_id.in_(owner_ids)).all() if owner_ids else []

    from app.models import Case
    results = []
    for p in parcels:
        p_dict = p.to_dict(include_geometry=True)
        p_dict["detections"] = [d.to_dict() for d in p.detections]
        cases = Case.query.filter_by(parcel_id=p.id).all()
        p_dict["cases"] = [c.to_dict() for c in cases]
        results.append(p_dict)

    return jsonify({
        "parcels": results,
        "total": len(results),
    })


@parcels_bp.route("/claim", methods=["POST"])
@login_required
def claim_parcel():
    """
    Allow a landowner to link/verify their registered email with a parcel they own.
    """
    user = request.current_user
    data = request.get_json(silent=True) or {}
    parcel_id_str = (data.get("parcel_id") or "").strip()
    owner_reference = (data.get("owner_reference") or "").strip()

    if not parcel_id_str:
        return jsonify({"error": "Parcel ID is required to link parcel."}), 422

    parcel = LandParcel.query.filter_by(parcel_id=parcel_id_str).first()
    if not parcel:
        return jsonify({"error": f"Parcel '{parcel_id_str}' not found in the land records database."}), 404

    if parcel.owner:
        if owner_reference and parcel.owner.owner_reference.lower() != owner_reference.lower():
            return jsonify({"error": "Owner reference does not match this parcel's registered record."}), 403
        parcel.owner.contact_email = user.email
    else:
        new_owner = OwnershipRecord(
            owner_name=user.full_name,
            owner_reference=owner_reference or f"OWN-{user.id[:8].upper()}",
            contact_email=user.email,
        )
        db.session.add(new_owner)
        db.session.flush()
        parcel.ownership_id = new_owner.id

    log_action(user.id, "PARCEL_CLAIMED", "LandParcel", parcel.id, {"parcel_id": parcel.parcel_id})
    db.session.commit()
    return jsonify({"message": f"Parcel '{parcel.parcel_id}' successfully linked to your account.", "parcel": parcel.to_dict()})


@parcels_bp.route("/<parcel_id>", methods=["GET"])
@login_required
def get_parcel(parcel_id):
    parcel = LandParcel.query.filter(
        db.or_(LandParcel.id == parcel_id, LandParcel.parcel_id == parcel_id)
    ).first_or_404()
    return jsonify(parcel.to_dict(include_geometry=True))


@parcels_bp.route("", methods=["POST"])
@admin_required
def create_parcel():
    data = request.get_json(silent=True) or {}
    errors = {}

    parcel_id_str = (data.get("parcel_id") or "").strip()
    if not parcel_id_str:
        errors["parcel_id"] = "Parcel ID is required."
    elif LandParcel.query.filter_by(parcel_id=parcel_id_str).first():
        errors["parcel_id"] = "Parcel ID already exists. Use a unique registration ID."

    if errors:
        return jsonify({"errors": errors}), 422

    boundary = data.get("boundary_geojson")
    boundary_str = json.dumps(boundary) if isinstance(boundary, dict) else boundary

    def _lu(val, default=LandUseCategory.UNKNOWN):
        try:
            return LandUseCategory(val)
        except (ValueError, TypeError):
            return default

    # Build address incorporating survey/subdivision details
    address = data.get("address", "")
    survey_num = data.get("_survey_number", "")
    sub_num = data.get("_subdivision_number", "")
    notes = data.get("_notes", "")
    if survey_num or sub_num:
        survey_part = f"Survey No: {survey_num}" if survey_num else ""
        sub_part = f"Subdiv: {sub_num}" if sub_num else ""
        survey_str = ", ".join(filter(None, [survey_part, sub_part]))
        address = f"{survey_str}. {address}".strip(". ")

    # Create ownership record if owner info provided
    ownership_id = data.get("ownership_id")
    owner_name = (data.get("_owner_name") or "").strip()
    if owner_name and not ownership_id:
        from datetime import date as date_type
        owner_ref = (data.get("_owner_reference") or "").strip()
        if not owner_ref:
            import uuid as _uuid
            owner_ref = f"OWN-{parcel_id_str[:20].upper()}-{str(_uuid.uuid4())[:6].upper()}"

        # Ensure reference uniqueness
        existing_ref = OwnershipRecord.query.filter_by(owner_reference=owner_ref).first()
        if existing_ref:
            owner_ref = f"{owner_ref}-{str(parcel_id_str)[:6]}"

        reg_date_str = data.get("_registered_date", "")
        reg_date = None
        if reg_date_str:
            try:
                from datetime import datetime
                reg_date = datetime.strptime(reg_date_str, "%Y-%m-%d").date()
            except ValueError:
                pass

        owner = OwnershipRecord(
            owner_name=owner_name,
            owner_reference=owner_ref,
            contact_phone=data.get("_contact_phone") or None,
            contact_email=data.get("_contact_email") or None,
            registration_reference=data.get("_registration_reference") or None,
            registered_date=reg_date,
            notes=notes or None,
            is_simulated=False,
        )
        db.session.add(owner)
        db.session.flush()
        ownership_id = owner.id

    parcel = LandParcel(
        parcel_id=parcel_id_str,
        ownership_id=ownership_id,
        registered_area_sqm=data.get("registered_area_sqm"),
        boundary_geojson=boundary_str,
        centroid_lat=data.get("centroid_lat"),
        centroid_lng=data.get("centroid_lng"),
        administrative_area=data.get("administrative_area"),
        district=data.get("district"),
        state=data.get("state"),
        address=address or data.get("address"),
        registered_land_use=_lu(data.get("registered_land_use")),
        observed_land_use=_lu(data.get("observed_land_use")),
        is_simulated=data.get("is_simulated", False),
    )
    db.session.add(parcel)
    db.session.flush()
    log_action(request.current_user.id, "PARCEL_CREATED", "LandParcel", parcel.id,
               {"parcel_id": parcel_id_str, "owner": owner_name or None})
    db.session.commit()
    return jsonify(parcel.to_dict()), 201



@parcels_bp.route("/<parcel_id>", methods=["PUT"])
@admin_required
def update_parcel(parcel_id):
    parcel = LandParcel.query.filter(
        db.or_(LandParcel.id == parcel_id, LandParcel.parcel_id == parcel_id)
    ).first_or_404()

    data = request.get_json(silent=True) or {}

    fields = ["registered_area_sqm", "centroid_lat", "centroid_lng",
              "administrative_area", "district", "state", "address", "review_status"]
    for f in fields:
        if f in data:
            setattr(parcel, f, data[f])

    if "boundary_geojson" in data:
        b = data["boundary_geojson"]
        _old_boundary = parcel.boundary_geojson
        _old_area = parcel.registered_area_sqm
        parcel.boundary_geojson = json.dumps(b) if isinstance(b, dict) else b
        _record_boundary_history = True
    else:
        _record_boundary_history = False
        _old_boundary = None
        _old_area = None

    def _lu(val, default):
        try:
            return LandUseCategory(val)
        except (ValueError, TypeError):
            return default

    if "registered_land_use" in data:
        parcel.registered_land_use = _lu(data["registered_land_use"], parcel.registered_land_use)
    if "observed_land_use" in data:
        parcel.observed_land_use = _lu(data["observed_land_use"], parcel.observed_land_use)

    if _record_boundary_history:
        from app.models import ParcelBoundaryHistory
        db.session.add(ParcelBoundaryHistory(
            parcel_id=parcel.id,
            changed_by=request.current_user.id,
            old_boundary=_old_boundary,
            new_boundary=parcel.boundary_geojson,
            old_area_sqm=_old_area,
            new_area_sqm=parcel.registered_area_sqm,
            change_reason=data.get("change_reason", "Boundary updated via API"),
        ))

    log_action(request.current_user.id, "PARCEL_UPDATED", "LandParcel", parcel.id,
               {"parcel_id": parcel.parcel_id})
    db.session.commit()
    return jsonify(parcel.to_dict())


@parcels_bp.route("/<parcel_id>", methods=["DELETE"])
@admin_required
def delete_parcel(parcel_id):
    parcel = LandParcel.query.filter(
        db.or_(LandParcel.id == parcel_id, LandParcel.parcel_id == parcel_id)
    ).first_or_404()

    pid = parcel.parcel_id
    log_action(request.current_user.id, "PARCEL_DELETED", "LandParcel", parcel.id,
               {"parcel_id": pid})
    db.session.delete(parcel)
    db.session.commit()
    return jsonify({"message": f"Parcel {pid} deleted."})


@parcels_bp.route("/export/csv", methods=["GET"])
@login_required
def export_parcels_csv():
    """Export all matching parcels as CSV. Query params same as list_parcels."""
    import csv
    import io
    from flask import Response

    search = request.args.get("search", "").strip()
    flagged = request.args.get("flagged", "").lower()
    land_use = request.args.get("land_use", "").strip()

    q = LandParcel.query
    if search:
        q = q.filter(
            db.or_(
                LandParcel.parcel_id.ilike(f"%{search}%"),
                LandParcel.administrative_area.ilike(f"%{search}%"),
                LandParcel.district.ilike(f"%{search}%"),
            )
        )
    if flagged == "true":
        q = q.filter(LandParcel.is_flagged == True)
    if land_use:
        try:
            q = q.filter(LandParcel.registered_land_use == LandUseCategory(land_use))
        except ValueError:
            pass

    parcels = q.order_by(LandParcel.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Parcel ID", "Owner Name", "Registered Area (sqm)", "State", "District",
        "Administrative Area", "Address", "Registered Land Use", "Observed Land Use",
        "Review Status", "Is Flagged", "Detection Count",
        "Centroid Lat", "Centroid Lng", "Created At"
    ])
    for p in parcels:
        writer.writerow([
            p.parcel_id,
            p.owner.owner_name if p.owner else "",
            p.registered_area_sqm or "",
            p.state or "", p.district or "",
            p.administrative_area or "", p.address or "",
            p.registered_land_use.value if p.registered_land_use else "",
            p.observed_land_use.value if p.observed_land_use else "",
            p.review_status or "", "Yes" if p.is_flagged else "No",
            p.detections.count(),
            p.centroid_lat or "", p.centroid_lng or "",
            p.created_at.isoformat() if p.created_at else "",
        ])

    log_action(request.current_user.id, "PARCELS_CSV_EXPORTED", "LandParcel", None,
               {"count": len(parcels)})

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=landguard_parcels.csv"}
    )


@parcels_bp.route("/<parcel_id>/boundary-history", methods=["GET"])
@login_required
def get_boundary_history(parcel_id):
    """Return boundary version history for a parcel."""
    parcel = LandParcel.query.filter(
        db.or_(LandParcel.id == parcel_id, LandParcel.parcel_id == parcel_id)
    ).first_or_404()

    from app.models import ParcelBoundaryHistory
    history = ParcelBoundaryHistory.query.filter_by(
        parcel_id=parcel.id
    ).order_by(ParcelBoundaryHistory.changed_at.desc()).all()

    return jsonify({"history": [h.to_dict() for h in history]})


@parcels_bp.route("/<parcel_id>/pdf", methods=["GET"])
@login_required
def download_parcel_pdf(parcel_id):
    """
    Generate and stream a PDF land-record document for one parcel.
    Secured: login required. Access-logged. Never contains government seals
    or certifications — clearly labelled as an application-generated copy.
    """
    parcel = LandParcel.query.filter(
        db.or_(LandParcel.id == parcel_id, LandParcel.parcel_id == parcel_id)
    ).first_or_404()

    output_dir = current_app.config.get("REPORTS_FOLDER", "reports_output")
    os.makedirs(output_dir, exist_ok=True)

    safe_id = parcel.parcel_id.replace("/", "-").replace("\\", "-")
    filename = f"parcel_{safe_id}.pdf"
    filepath = os.path.join(output_dir, filename)

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        )
        from reportlab.lib.enums import TA_CENTER

        doc = SimpleDocTemplate(
            filepath, pagesize=A4,
            rightMargin=2*cm, leftMargin=2*cm,
            topMargin=2*cm, bottomMargin=2*cm,
        )
        styles = getSampleStyleSheet()

        title_s = ParagraphStyle("T", parent=styles["Title"],
                                  fontSize=18, textColor=colors.HexColor("#1e3a5f"), spaceAfter=4)
        sub_s = ParagraphStyle("S", parent=styles["Normal"],
                                fontSize=10, textColor=colors.HexColor("#4a6fa5"), spaceAfter=2)
        label_s = ParagraphStyle("L", parent=styles["Normal"],
                                  fontSize=9, textColor=colors.HexColor("#64748b"))
        value_s = ParagraphStyle("V", parent=styles["Normal"],
                                  fontSize=10, textColor=colors.HexColor("#0f172a"))
        disc_s = ParagraphStyle("D", parent=styles["Normal"],
                                 fontSize=8, textColor=colors.HexColor("#b45309"),
                                 backColor=colors.HexColor("#fffbeb"),
                                 borderColor=colors.HexColor("#f59e0b"),
                                 borderWidth=1, borderPad=4)

        now = __import__("datetime").datetime.now().strftime("%d %b %Y %H:%M")
        story: list = [
            Paragraph("LandGuard — Land Record Copy", title_s),
            Paragraph("GIS-Based Land Encroachment Detection System", sub_s),
            Paragraph(f"Generated: {now}  |  Doc Ref: LG-{parcel.id[:8].upper()}  |  Page 1 of 1", label_s),
            HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cbd5e1"), spaceAfter=10),
            Paragraph(
                "⚠ IMPORTANT: This is an application-generated record copy for reference only. "
                "It does NOT constitute an official government land registration document, "
                "legal title deed, or certified survey record. All data reflects information "
                "entered into the LandGuard system and has not been independently verified.",
                disc_s,
            ),
            Spacer(1, 0.4*cm),
        ]

        def row(label, value):
            return [Paragraph(label, label_s), Paragraph(str(value or "—"), value_s)]

        area = parcel.registered_area_sqm
        area_str = f"{area:,.0f} m²" if area else "—"

        data = [
            [Paragraph("PARCEL IDENTIFICATION", ParagraphStyle(
                "H", parent=styles["Normal"], fontSize=9, fontName="Helvetica-Bold",
                textColor=colors.HexColor("#1e3a5f"))), ""],
            row("Parcel / Registration ID", parcel.parcel_id),
            row("Registered Area", area_str),
            row("Registered Land Use", parcel.registered_land_use.value if parcel.registered_land_use else "—"),
            row("Observed Land Use", parcel.observed_land_use.value if parcel.observed_land_use else "—"),
            row("Review Status", parcel.review_status or "—"),
            row("Encroachment Flagged", "YES — pending verification" if parcel.is_flagged else "No"),
            ["", ""],
            [Paragraph("LOCATION", ParagraphStyle(
                "H2", parent=styles["Normal"], fontSize=9, fontName="Helvetica-Bold",
                textColor=colors.HexColor("#1e3a5f"))), ""],
            row("State", parcel.state),
            row("District", parcel.district),
            row("Mandal / Taluk", parcel.administrative_area),
            row("Address / Village", parcel.address),
            row("Latitude", f"{parcel.centroid_lat:.7f}" if parcel.centroid_lat else "—"),
            row("Longitude", f"{parcel.centroid_lng:.7f}" if parcel.centroid_lng else "—"),
        ]

        if parcel.owner:
            data += [
                ["", ""],
                [Paragraph("OWNERSHIP RECORD", ParagraphStyle(
                    "H3", parent=styles["Normal"], fontSize=9, fontName="Helvetica-Bold",
                    textColor=colors.HexColor("#1e3a5f"))), ""],
                row("Owner Name", parcel.owner.owner_name),
                row("Owner Reference", parcel.owner.owner_reference),
                row("Registration Reference", parcel.owner.registration_reference),
                row("Registered Date", str(parcel.owner.registered_date) if parcel.owner.registered_date else "—"),
                row("Notes", parcel.owner.notes),
            ]

        table = Table(data, colWidths=[5.5*cm, 11*cm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8f0fe")),
            ("SPAN", (0, 0), (1, 0)),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(table)
        story.append(Spacer(1, 0.5*cm))
        story.append(Paragraph(
            "This document was automatically generated by LandGuard and does not carry any "
            "government authority. Do not use this copy as proof of ownership or for legal proceedings. "
            "Contact the relevant land registration authority for official records.",
            disc_s,
        ))
        doc.build(story)

    except ImportError:
        return jsonify({"error": "PDF generation requires reportlab. Run: pip install reportlab"}), 503
    except Exception as exc:
        current_app.logger.error(f"Parcel PDF error: {exc}")
        return jsonify({"error": "PDF generation failed."}), 500

    log_action(request.current_user.id, "PARCEL_PDF_DOWNLOADED", "LandParcel", parcel.id,
               {"parcel_id": parcel.parcel_id})

    return send_file(
        filepath,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"LandRecord_{safe_id}.pdf",
    )
