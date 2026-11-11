"""
Report generation service — PDF (reportlab) and CSV exports.
"""
import os
import csv
import json
from datetime import datetime, timezone
from app.models import LandParcel, EncroachmentDetection


def generate_pdf_report(report_obj, output_dir: str, filters: dict) -> str:
    """Generate a professional PDF report using ReportLab."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT

        filename = f"report_{report_obj.id[:8]}_{report_obj.report_type}.pdf"
        filepath = os.path.join(output_dir, filename)

        doc = SimpleDocTemplate(filepath, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "Title", parent=styles["Title"],
            fontSize=22, spaceAfter=6, textColor=colors.HexColor("#1e3a5f")
        )
        subtitle_style = ParagraphStyle(
            "Subtitle", parent=styles["Normal"],
            fontSize=11, textColor=colors.HexColor("#4a6fa5"), spaceAfter=4
        )
        disclaimer_style = ParagraphStyle(
            "Disclaimer", parent=styles["Normal"],
            fontSize=8, textColor=colors.HexColor("#cc3300"),
            borderPad=4, backColor=colors.HexColor("#fff3f3"),
            borderColor=colors.HexColor("#cc3300"), borderWidth=1,
        )

        story: list = []

        # Header
        story.append(Paragraph("🛡 LandGuard", title_style))
        story.append(Paragraph("GIS-Based Land Encroachment Detection System", subtitle_style))
        story.append(Paragraph(f"Report: {report_obj.title}", styles["Heading2"]))
        story.append(Paragraph(
            f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            styles["Normal"]
        ))
        story.append(Spacer(1, 0.3*cm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1e3a5f")))
        story.append(Spacer(1, 0.3*cm))

        # Disclaimer
        story.append(Paragraph(
            "⚠ PRELIMINARY ANALYSIS DISCLAIMER: All findings in this report are based on automated "
            "geometric analysis and simulated datasets. These results DO NOT constitute proof of illegal "
            "encroachment or establish legal ownership. All findings require independent verification "
            "by a qualified, authorized land surveyor.",
            disclaimer_style
        ))
        story.append(Spacer(1, 0.5*cm))

        # Build content based on report type
        if report_obj.report_type == "detection_summary":
            story.extend(_detection_summary_content(styles, filters))
        elif report_obj.report_type == "parcel_summary":
            story.extend(_parcel_summary_content(styles, filters))

        story.append(Spacer(1, 1*cm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
        story.append(Paragraph(
            "LandGuard — Municipal Survey Intelligence Platform | Simulated Data",
            ParagraphStyle("footer", parent=styles["Normal"], fontSize=8,
                           textColor=colors.grey, alignment=TA_CENTER)
        ))

        doc.build(story)
        return filepath

    except ImportError:
        # Fallback: plain text
        return _generate_text_report(report_obj, output_dir, filters)


def _detection_summary_content(styles, filters):
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import cm

    story: list = []
    story.append(Paragraph("Encroachment Detection Summary", styles["Heading2"]))
    story.append(Spacer(1, 0.3*cm))

    detections = EncroachmentDetection.query.limit(100).all()

    if not detections:
        story.append(Paragraph("No detection records found.", styles["Normal"]))
        return story

    data = [["Detection ID", "Parcel ID", "Severity", "Status", "Area Diff %", "Detected At"]]
    for d in detections:
        data.append([
            d.id[:8],
            d.parcel.parcel_id if d.parcel else "-",
            d.severity or "-",
            d.review_status.value if d.review_status else "-",
            f"{d.area_difference_pct:.1f}%" if d.area_difference_pct else "-",
            d.detected_at.strftime("%Y-%m-%d") if d.detected_at else "-",
        ])

    table = Table(data, colWidths=[2.5*cm, 3*cm, 2*cm, 4*cm, 2.5*cm, 3*cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4ff")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(table)
    return story


def _parcel_summary_content(styles, filters):
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import cm

    story: list = []
    story.append(Paragraph("Land Parcel Summary", styles["Heading2"]))
    story.append(Spacer(1, 0.3*cm))

    parcels = LandParcel.query.limit(100).all()
    if not parcels:
        story.append(Paragraph("No parcel records found.", styles["Normal"]))
        return story

    data = [["Parcel ID", "District", "Reg. Area (m²)", "Land Use", "Flagged", "Status"]]
    for p in parcels:
        data.append([
            p.parcel_id,
            p.district or "-",
            f"{p.registered_area_sqm:.0f}" if p.registered_area_sqm else "-",
            p.registered_land_use.value if p.registered_land_use else "-",
            "YES" if p.is_flagged else "No",
            p.review_status or "-",
        ])

    table = Table(data, colWidths=[3*cm, 3*cm, 2.5*cm, 3*cm, 2*cm, 3*cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4ff")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
    ]))
    story.append(table)
    return story


def _generate_text_report(report_obj, output_dir, filters):
    """Fallback plain-text report when ReportLab is not installed."""
    filename = f"report_{report_obj.id[:8]}_{report_obj.report_type}.txt"
    filepath = os.path.join(output_dir, filename)
    with open(filepath, "w") as f:
        f.write(f"LandGuard Report: {report_obj.title}\n")
        f.write(f"Generated: {datetime.now(timezone.utc)}\n")
        f.write("-" * 60 + "\n")
        f.write("DISCLAIMER: Preliminary findings. Requires field verification.\n")
    return filepath


def generate_csv_report(report_obj, output_dir: str, filters: dict) -> str:
    """Generate a CSV report."""
    filename = f"report_{report_obj.id[:8]}_{report_obj.report_type}.csv"
    filepath = os.path.join(output_dir, filename)

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        if report_obj.report_type == "detection_summary":
            writer = csv.DictWriter(f, fieldnames=[
                "detection_id", "parcel_id", "severity", "review_status",
                "registered_area_sqm", "observed_area_sqm", "area_difference_pct",
                "detection_reason", "detected_at",
                "disclaimer"
            ])
            writer.writeheader()
            detections = EncroachmentDetection.query.limit(500).all()
            for d in detections:
                writer.writerow({
                    "detection_id": d.id,
                    "parcel_id": d.parcel.parcel_id if d.parcel else "-",
                    "severity": d.severity,
                    "review_status": d.review_status.value if d.review_status else "-",
                    "registered_area_sqm": d.registered_area_sqm,
                    "observed_area_sqm": d.observed_area_sqm,
                    "area_difference_pct": d.area_difference_pct,
                    "detection_reason": d.detection_reason,
                    "detected_at": d.detected_at.isoformat() if d.detected_at else "-",
                    "disclaimer": EncroachmentDetection.DISCLAIMER,
                })
        else:
            writer = csv.DictWriter(f, fieldnames=[
                "parcel_id", "district", "state", "registered_area_sqm",
                "registered_land_use", "observed_land_use",
                "is_flagged", "detection_count", "created_at"
            ])
            writer.writeheader()
            parcels = LandParcel.query.limit(500).all()
            for p in parcels:
                writer.writerow({
                    "parcel_id": p.parcel_id,
                    "district": p.district,
                    "state": p.state,
                    "registered_area_sqm": p.registered_area_sqm,
                    "registered_land_use": p.registered_land_use.value if p.registered_land_use else "-",
                    "observed_land_use": p.observed_land_use.value if p.observed_land_use else "-",
                    "is_flagged": p.is_flagged,
                    "detection_count": p.detections.count(),
                    "created_at": p.created_at.isoformat() if p.created_at else "-",
                })

    return filepath
