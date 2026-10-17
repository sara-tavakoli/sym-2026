"""One-page appointment brief PDF (reportlab)."""

from datetime import date
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from lib.demo_data import PREP_FIELD_LABELS
from models.visit import Visit

EUCALYPT = colors.HexColor("#0D5C4D")
TERRACOTTA = colors.HexColor("#C85A32")
INK = colors.HexColor("#1C2421")
MUTED = colors.HexColor("#52605B")
SAND = colors.HexColor("#F4EFE6")
LINE = colors.HexColor("#E3DED4")

S_EYEBROW = ParagraphStyle("eyebrow", fontName="Helvetica-Bold", fontSize=8, textColor=TERRACOTTA, leading=10)
S_TITLE = ParagraphStyle("title", fontName="Times-Bold", fontSize=22, textColor=INK, leading=26, spaceBefore=2)
S_META = ParagraphStyle("meta", fontName="Helvetica", fontSize=9, textColor=MUTED, leading=12)
S_SECTION = ParagraphStyle("section", fontName="Times-Bold", fontSize=12, textColor=EUCALYPT, leading=15, spaceBefore=8, spaceAfter=2)
S_POINT = ParagraphStyle("point", fontName="Helvetica", fontSize=10, textColor=INK, leading=13.5, leftIndent=10, bulletIndent=0)
S_SOURCE = ParagraphStyle("source", fontName="Helvetica-Oblique", fontSize=7.5, textColor=MUTED, leading=10, leftIndent=10, spaceAfter=4)
S_FOOT = ParagraphStyle("foot", fontName="Helvetica", fontSize=7.5, textColor=MUTED, leading=10)


def _trim(text: str, n: int = 110) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "\u2026"


def render_brief_pdf(v: Visit) -> bytes:
    assert v.brief is not None
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title=f"Appointment brief - {v.patient.name}", author="VisitReady (demo)")
    story = [
        Paragraph("VISITREADY \u00b7 APPOINTMENT BRIEF \u00b7 FICTIONAL DEMO", S_EYEBROW),
        Paragraph(escape(f"{v.patient.name}, {v.patient.age}"), S_TITLE),
    ]
    b = v.booking
    meta = [f"{v.patient.pronouns} \u00b7 {v.patient.suburb}"]
    if b:
        d = date.fromisoformat(b.date).strftime("%a %d %b %Y")
        meta.append(f"Appointment: {b.practitioner_name}, {b.clinic_name} \u00b7 {d} {b.time} \u00b7 Ref {b.reference}")
    status = "Saved" if v.brief.status == "saved" else "Draft"
    share = "Shared with clinician" if v.brief.shared else "Private (not shared)"
    source = "AI-organised (GPT-5.2)" if v.brief.ai_source == "live" else "Prepared fallback"
    meta.append(f"{status} \u00b7 {share} \u00b7 {source}")
    story += [Paragraph(escape(m), S_META) for m in meta]

    rule = Table([[""]], colWidths=[doc.width], rowHeights=[4])
    rule.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.8, LINE)]))
    story += [Spacer(1, 4), rule]

    sections: list[str] = []
    for p in v.brief.points:
        if p.section not in sections:
            sections.append(p.section)
    for section in sections:
        block = [Paragraph(escape(section), S_SECTION)]
        for p in [p for p in v.brief.points if p.section == section]:
            block.append(Paragraph(escape(p.text), S_POINT, bulletText="\u2022"))
            label = PREP_FIELD_LABELS.get(p.source_field, p.source_field)
            edited = " \u00b7 edited by patient" if p.edited else ""
            block.append(Paragraph(escape(f"Source \u2014 {label}: \u201c{_trim(p.source_text)}\u201d{edited}"), S_SOURCE))
        story.append(KeepTogether(block))

    box = Table(
        [[Paragraph(
            "This brief was organised from the patient's own words. It is not a diagnosis or medical advice. "
            "Every point lists the patient input it came from. All people, clinics and details are fictional. "
            "In an emergency call 000.", S_FOOT)]],
        colWidths=[doc.width],
    )
    box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SAND), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                             ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                             ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [Spacer(1, 10), box]
    doc.build(story)
    return buf.getvalue()


CATEGORY_LABEL = {"daily": "Daily", "follow_up": "Follow-up appointment", "one_time": "One-time", "urgent": "Urgent - know when to get help"}
CATEGORY_COLOR = {"daily": colors.HexColor("#16A34A"), "follow_up": colors.HexColor("#2563EB"), "one_time": colors.HexColor("#D97706"), "urgent": colors.HexColor("#DC2626")}


def render_summary_pdf(v: Visit) -> bytes:
    """Plain-language visit summary + approved task list for the patient."""
    c = v.consult
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title=f"Visit summary - {v.patient.name}", author="VisitReady (demo)")
    story = [Paragraph("VISITREADY \u00b7 YOUR VISIT SUMMARY \u00b7 FICTIONAL DEMO", S_EYEBROW), Paragraph(escape(v.patient.name), S_TITLE)]
    if v.booking:
        d = date.fromisoformat(v.booking.date).strftime("%a %d %b %Y")
        story.append(Paragraph(escape(f"{v.booking.service_name} \u00b7 {v.booking.clinic_name} \u00b7 {d} {v.booking.time}"), S_META))
    story.append(Paragraph(escape(f"Plan approved by {c.approved_by} \u00b7 {(c.approved_at or '')[:10]}"), S_META))
    story.append(Paragraph("What happened at your visit", S_SECTION))
    story.append(Paragraph(escape(c.patient_summary or c.notes.assessment if c.notes else ""), ParagraphStyle("sum", parent=S_POINT, leftIndent=0)))
    story.append(Paragraph("Your follow-up checklist", S_SECTION))
    rows = []
    for t in v.tasks:
        when = ""
        if t.category == "daily":
            when = f"Every day for {t.duration_days} days" + (f" ({t.start_date} to {t.end_date})" if t.start_date else " from the day you accept it")
        elif t.category == "follow_up" and (t.due_date or t.due_in_days):
            when = f"Due {t.due_date}" if t.due_date else f"Due within {t.due_in_days} days of your visit"
        label = Paragraph(f'<font color="{CATEGORY_COLOR[t.category].hexval().replace("0x", "#")}"><b>{CATEGORY_LABEL[t.category]}</b></font>', S_SOURCE)
        body = [Paragraph(f"<b>{escape(t.title)}</b>", S_POINT), Paragraph(escape(t.source_text), S_POINT)]
        if when:
            body.append(Paragraph(escape(when), S_SOURCE))
        if t.verbatim:
            body.append(Paragraph("Medication instruction copied word-for-word from your clinician.", S_SOURCE))
        rows.append([label, body])
    if rows:
        tbl = Table(rows, colWidths=[38 * mm, doc.width - 38 * mm])
        tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                                 ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        story.append(tbl)
    box = Table([[Paragraph("Instructions come only from your clinician's approved plan. This summary is not new medical advice. "
                            "All people and details are fictional. In an emergency call 000.", S_FOOT)]], colWidths=[doc.width])
    box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SAND), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [Spacer(1, 10), box]
    doc.build(story)
    return buf.getvalue()
