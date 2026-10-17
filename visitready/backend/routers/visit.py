"""VisitReady journey endpoints. Each fictional persona has one visit linking every stage (BR-08)."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from lib.geo import geocode, haversine_km
from lib.auth import clinician_persona, is_account, patient_persona
from fastapi.responses import Response

from lib import demo_data as D
from lib.ai import generate_json
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from lib.brief_pdf import render_brief_pdf, render_summary_pdf
from lib.tasks import classify
from lib.dates import today_iso
from lib.db import db
from models.visit import (
    GeoPoint,
    NearbyClinics,
    Patient,
    ApproveRequest,
    Booking,
    BookingRequest,
    Brief,
    BriefPoint,
    BriefUpdate,
    Clinic,
    ClinicianDashboard,
    ClinicalNotes,
    ConfirmTasksRequest,
    ConsultUpdate,
    Event,
    GenerateBriefRequest,
    GenerateNotesRequest,
    Instruction,
    PathwaySuggestion,
    Persona,
    PrepForm,
    Questionnaire,
    Service,
    Task,
    TaskDayToggle,
    TaskStatusUpdate,
    Transcript,
    Visit,
)

router = APIRouter()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def persona_cfg(persona: str) -> dict:
    cfg = D.PERSONAS.get(persona)
    if not cfg:
        raise HTTPException(404, "Unknown demo persona")
    return cfg


def _age(dob: str) -> int:
    try:
        d = date.fromisoformat(dob)
    except ValueError:
        return 0
    t = date.today()
    return t.year - d.year - ((t.month, t.day) < (d.month, d.day))


async def get_cfg(persona: str) -> dict:
    """Demo personas use their fixed config. A real account reuses the matching fictional consult
    template (Skin Check -> Priya's, otherwise Alex's) with its own visit id and profile."""
    if persona in D.PERSONAS:
        return D.PERSONAS[persona]
    user = await db.users.find_one({"user_id": persona}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Visit not found")
    doc = await db.visits.find_one({"id": f"visit-{persona}"}, {"_id": 0, "booking": 1})
    skin = bool(doc and doc.get("booking") and doc["booking"].get("service_id") == "skin")
    prof = user.get("profile") or {}
    name = prof.get("full_name") or user["email"].split("@")[0]
    return {**D.PERSONAS["priya" if skin else "alex"], "visit_id": f"visit-{persona}",
            "initials": "".join(w[0] for w in name.split()[:2]).upper() or "P",
            "patient": {"name": name, "age": _age(prof.get("date_of_birth", "")), "pronouns": "", "suburb": ""}}


async def load(persona: str) -> Visit:
    cfg = await get_cfg(persona)
    doc = await db.visits.find_one({"id": cfg["visit_id"]}, {"_id": 0})
    if not doc:
        # upsert (not insert) so concurrent first requests can't race into a duplicate-key error
        fresh = Visit(id=cfg["visit_id"], persona=persona, patient=cfg["patient"], updated_at=now()).model_dump()
        await db.visits.update_one({"id": cfg["visit_id"]}, {"$setOnInsert": fresh}, upsert=True)
        doc = await db.visits.find_one({"id": cfg["visit_id"]}, {"_id": 0})
    v = Visit(**doc)
    if persona not in D.PERSONAS:
        v.patient = Patient(**cfg["patient"])  # keep the account's latest profile details
    v.today = today_iso(D.TZ)
    return v


async def save(v: Visit) -> Visit:
    v.updated_at = now()
    v.today = today_iso(D.TZ)
    await db.visits.replace_one({"id": v.id}, v.model_dump(), upsert=True)
    return v


def log(v: Visit, actor: str, actor_name: str, type_: str, message: str) -> None:
    """Audit timeline entry: who did what, when."""
    v.events.append(Event(id=uuid.uuid4().hex[:10], at=now(), actor=actor, actor_name=actor_name, type=type_, message=message))


async def notify(audience: str, persona: str, title: str, body: str, link: str) -> None:
    await db.notifications.insert_one({
        "id": uuid.uuid4().hex, "audience": audience, "persona": persona, "title": title, "body": body,
        "link": link, "created_at": now(), "read": False,
    })


DR = D.CLINICIAN["name"]

PatientP = Depends(patient_persona)
ClinicianP = Depends(clinician_persona)


# ---------- reference data ----------
@router.get("/services", response_model=list[Service])
async def list_services():
    return D.SERVICES


@router.post("/pathway/suggest", response_model=PathwaySuggestion)
async def suggest_pathway(body: Questionnaire):
    """Stateless guidance for signed-out guests — nothing is saved until they sign in."""
    return D.suggest_pathway(body.model_dump())


@router.get("/today")
async def get_today():
    return {"today": today_iso(D.TZ)}


@router.get("/clinics", response_model=list[Clinic])
async def list_clinics():
    return D.clinics()


RADII = (5, 10, 20, 50)


@router.get("/clinics/nearby", response_model=NearbyClinics)
async def nearby_clinics(location: str = Query(..., min_length=2, max_length=120), radius_km: float = Query(10)):
    """Geocode an Australian suburb/postcode/address, then filter fictional clinics by real straight-line distance."""
    if radius_km not in RADII:
        raise HTTPException(422, f"radius_km must be one of {list(RADII)}")
    try:
        point = await geocode(location)
    except RuntimeError:
        raise HTTPException(503, "Location lookup is unavailable right now. Please try again in a moment.")
    if not point:
        raise HTTPException(404, f"We couldn't find \"{location}\" in Australia. Try a suburb with its state, or a postcode.")
    inside, outside, online = [], [], []
    for c in D.clinics():
        if c["online"]:
            online.append(c)
            continue
        d = round(haversine_km(point["lat"], point["lng"], c["lat"], c["lng"]), 1)
        (inside if d <= radius_km else outside).append({**c, "distance_km": d})
    inside.sort(key=lambda c: c["distance_km"])
    return NearbyClinics(location=GeoPoint(**point), radius_km=radius_km, clinics=inside, online=online,
                         outside_count=len(outside), nearest_outside_km=min((c["distance_km"] for c in outside), default=None))


@router.get("/personas", response_model=list[Persona])
async def list_personas():
    return [{**p, "demo_prep": {**p["demo_prep"]}} for p in D.PERSONAS.values()]


@router.get("/demo/transcript", response_model=Transcript)
async def sample_transcript(persona: str = ClinicianP):
    cfg = await get_cfg(persona)
    return Transcript(title=cfg["transcript_title"], text=cfg["transcript"])


@router.get("/clinician/dashboard", response_model=ClinicianDashboard)
async def clinician_dashboard():
    rows = []
    account_ids = [d["persona"] async for d in db.visits.find({"persona": {"$regex": "^user_"}, "booking": {"$ne": None}}, {"_id": 0, "persona": 1})]
    for pid in [*D.PERSONAS.keys(), *account_ids]:
        cfg = await get_cfg(pid)
        v = await load(pid)
        rows.append({
            "persona": pid, "visit_id": v.id, "patient": v.patient, "initials": cfg["initials"],
            "concern": v.questionnaire.main_concern if v.questionnaire else None,
            "booking": v.booking,
            "brief_shared": bool(v.brief and v.brief.shared and v.brief.status == "saved"),  # BR-02
            "consult_status": v.consult.status,
            "instructions_released": len(v.consult.instructions) if v.consult.status == "approved" else 0,
        })
    rows.sort(key=lambda r: (r["booking"] is None, r["booking"].date if r["booking"] else "", r["booking"].time if r["booking"] else ""))
    return {"today": today_iso(D.TZ), "clinician": D.CLINICIAN, "appointments": rows}


@router.get("/clinician/visit", response_model=Visit)
async def clinician_visit(persona: str = ClinicianP):
    return await load(persona)


# ---------- visit ----------
@router.get("/visit", response_model=Visit)
async def get_visit(persona: str = PatientP):
    return await load(persona)


@router.post("/visit/reset", response_model=Visit)
async def reset_visit(persona: str = PatientP):
    await db.visits.delete_many({"id": (await get_cfg(persona))["visit_id"]})
    await db.notifications.delete_many({"persona": persona})
    return await load(persona)


# Feature 1 — navigation & booking
@router.post("/visit/questionnaire", response_model=Visit)
async def submit_questionnaire(body: Questionnaire, persona: str = PatientP):
    v = await load(persona)
    v.questionnaire = body
    v.pathway = PathwaySuggestion(**D.suggest_pathway(body.model_dump()))
    log(v, "patient", v.patient.name, "questionnaire", f"Answered guided questions — suggested {v.pathway.service_name}")
    return await save(v)


@router.post("/visit/booking", response_model=Visit)
async def book(body: BookingRequest, persona: str = PatientP):
    clinic = next((c for c in D.clinics() if c["id"] == body.clinic_id), None)
    if not clinic:
        raise HTTPException(404, "Clinic not found")
    slot = next((s for s in clinic["slots"] if s["id"] == body.slot_id), None)
    if not slot:
        raise HTTPException(404, "That time is no longer available")
    prac = next(p for p in clinic["practitioners"] if p["id"] == slot["practitioner_id"])
    service = next((s for s in D.SERVICES if s["id"] == body.service_id), D.SERVICES[0])
    if is_account(persona):
        user = await db.users.find_one({"user_id": persona}, {"_id": 0, "profile": 1})
        prof = (user or {}).get("profile") or {}
        if not all(prof.get(f) for f in ("full_name", "date_of_birth", "mobile")):
            raise HTTPException(409, "Please complete your profile before booking")
    v = await load(persona)
    if v.booking and v.booking.slot_id == slot["id"] and v.booking.clinic_id == clinic["id"]:
        return v  # repeated confirm click — the same appointment, never a duplicate
    v.booking = Booking(
        reference=f"VR-{uuid.uuid4().hex[:6].upper()}",
        clinic_id=clinic["id"], clinic_name=clinic["name"], clinic_address=clinic["address"],
        practitioner_id=prac["id"], practitioner_name=prac["name"],
        service_id=service["id"], service_name=service["name"],
        slot_id=slot["id"], date=slot["date"], time=slot["time"], mode=slot["mode"], confirmed_at=now(),
    )
    when = date.fromisoformat(slot["date"]).strftime("%a %d %b")
    log(v, "patient", v.patient.name, "booking", f"Booked {service['name']} with {prac['name']} · {when} {slot['time']}")
    await notify("clinician", persona, f"New booking: {v.patient.name}", f"{service['name']} · {when} at {slot['time']} · {clinic['name']}",
                 f"/clinician/consult/{persona}")
    return await save(v)


# Feature 2 — preparation
@router.put("/visit/prep", response_model=Visit)
async def save_prep(body: PrepForm, persona: str = PatientP):
    v = await load(persona)
    v.prep = body
    return await save(v)


def fallback_brief(prep: PrepForm) -> list[dict]:
    sections = [
        ("main_concern", "Main concern"), ("symptoms", "Symptoms"), ("duration", "Timeline"),
        ("previous_care", "What I've tried"), ("history", "Relevant history"), ("medications", "Medications"),
        ("concerns", "What worries me"),
    ]
    points = []
    for field, section in sections:
        val = getattr(prep, field).strip()
        if val:
            points.append({"section": section, "text": val[0].upper() + val[1:], "source_field": field})
    for q in [q.strip("-• ").strip() for q in prep.questions.splitlines() if q.strip()]:
        points.append({"section": "Questions for my doctor", "text": q, "source_field": "questions"})
    return points


BRIEF_SYSTEM = (
    "You organise a patient's own words into a concise one-page appointment brief for their doctor. "
    "Never diagnose, never add medical advice, never invent facts. Use first person from the patient's perspective. "
    "Every point must cite exactly one source field it came from. Respond with JSON only."
)


@router.post("/visit/brief/generate", response_model=Visit)
async def generate_brief(body: GenerateBriefRequest, persona: str = PatientP):
    v = await load(persona)
    if not v.booking:
        raise HTTPException(409, "Book an appointment before preparing a brief")
    prep = body.prep
    v.prep = prep
    fields = {k: getattr(prep, k) for k in D.PREP_FIELD_LABELS if getattr(prep, k).strip()}
    if not fields:
        raise HTTPException(422, "Add at least one detail before generating a brief")

    raw = None
    if not body.use_fallback:
        prompt = (
            "Patient input fields (JSON):\n" + json.dumps(fields, ensure_ascii=False) +
            "\n\nReturn {\"points\": [{\"section\": one of [\"Main concern\",\"Symptoms\",\"Timeline\",\"What I've tried\","
            "\"Relevant history\",\"Medications\",\"What worries me\",\"Questions for my doctor\"], "
            "\"text\": short clear sentence (max 25 words), \"source_field\": one of " + json.dumps(list(fields)) + "}]}. "
            "Keep 5-10 points, one per question for questions. Order by section as listed."
        )
        data = await generate_json(BRIEF_SYSTEM, prompt)
        if data and isinstance(data.get("points"), list):
            raw = [p for p in data["points"] if isinstance(p, dict) and p.get("source_field") in fields and p.get("text")]
    ai_source = "live" if raw else "fallback"
    if not raw:
        raw = fallback_brief(prep)

    points = [
        BriefPoint(id=f"bp-{i+1}", section=str(p.get("section", "Notes")), text=str(p["text"]),
                   source_field=p["source_field"], source_text=fields[p["source_field"]])
        for i, p in enumerate(raw)
    ]
    v.brief = Brief(points=points, ai_source=ai_source, generated_at=now())
    log(v, "ai", "GPT-5.2" if ai_source == "live" else "Prepared fallback", "brief_generated", f"Organised {len(points)} brief points from the patient's own words")
    return await save(v)


@router.put("/visit/brief", response_model=Visit)
async def update_brief(body: BriefUpdate, persona: str = PatientP):
    v = await load(persona)
    if not v.brief:
        raise HTTPException(409, "Generate a brief first")
    edits = {e.id: e.text for e in body.points}
    for p in v.brief.points:
        if p.id in edits and edits[p.id].strip() != p.text:
            p.text = edits[p.id].strip()
            p.edited = True
    was_shared_before = v.brief.shared and v.brief.status == "saved"
    v.brief.shared = body.shared  # BR-02: explicit patient choice
    v.brief.status = "saved"
    was_shared = was_shared_before
    v.brief.saved_at = now()
    log(v, "patient", v.patient.name, "brief_saved", "Saved preparation brief and shared it with the clinician" if body.shared else "Saved preparation brief privately")
    if body.shared and not was_shared:
        await notify("clinician", persona, f"{v.patient.name} shared a preparation brief", f"{len(v.brief.points)} points ready to review before the consult",
                     f"/clinician/consult/{persona}")
    return await save(v)


@router.get("/visit/brief/pdf")
async def brief_pdf(persona: str = PatientP):
    v = await load(persona)
    if not v.brief:
        raise HTTPException(404, "No brief has been generated yet")
    pdf = render_brief_pdf(v)
    first = v.patient.name.split()[0].lower()
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="visitready-brief-{first}.pdf"'},
    )


# Feature 3 — clinical notes
NOTES_SYSTEM = (
    "You are a clinical documentation assistant drafting notes for a GP to review. Use only information in the transcript. "
    "Write concise SOAP notes in clinical shorthand. Separately list patient-facing follow-up instructions in plain language. "
    "Medication instructions MUST be copied word-for-word from what the doctor said in the transcript. Respond with JSON only."
)


@router.post("/visit/consult/generate", response_model=Visit)
async def generate_notes(body: GenerateNotesRequest, persona: str = ClinicianP):
    cfg = await get_cfg(persona)
    v = await load(persona)
    if not v.booking:
        raise HTTPException(409, "No appointment booked for this patient yet")
    if v.consult.status == "approved":
        raise HTTPException(409, "Notes are already approved and released")

    notes, instructions = None, None
    if not body.use_fallback:
        shared = ""
        if v.brief and v.brief.shared and v.brief.status == "saved":
            shared = "\n\nPatient-shared preparation brief:\n" + "\n".join(f"- {p.section}: {p.text}" for p in v.brief.points)
        prompt = (
            "Consultation transcript:\n" + body.transcript + shared +
            "\n\nReturn {\"notes\": {\"subjective\": str, \"objective\": str, \"assessment\": str, \"plan\": str}, "
            "\"instructions\": [{\"kind\": one of [\"appointment\",\"test\",\"referral\",\"medication\",\"self_care\"], \"text\": str}]}"
        )
        data = await generate_json(NOTES_SYSTEM, prompt)
        try:
            if data:
                notes = {k: str(data["notes"][k]) for k in ("subjective", "objective", "assessment", "plan")}
                instructions = [i for i in data["instructions"] if i.get("kind") in D.TASK_TITLES and i.get("text")]
        except (KeyError, TypeError):
            notes, instructions = None, None
    ai_source = "live" if notes and instructions else "fallback"
    if ai_source == "fallback":
        notes, instructions = cfg["fallback_notes"], cfg["fallback_instructions"]

    ins = [Instruction(id=f"ins-{i+1}", kind=x["kind"], text=str(x["text"])) for i, x in enumerate(instructions)]
    v.consult.transcript = body.transcript
    v.consult.notes = ClinicalNotes(**notes)
    v.consult.instructions = ins
    v.consult.ai_notes = ClinicalNotes(**notes)
    v.consult.ai_instructions = [i.model_copy() for i in ins]
    v.consult.status = "draft"  # BR-04: AI output always starts as Draft
    v.consult.ai_source = ai_source
    v.consult.edited = False
    v.consult.generated_at = now()
    v.tasks = []
    log(v, "ai", "GPT-5.2" if ai_source == "live" else "Prepared fallback", "notes_drafted", f"Drafted SOAP notes and {len(ins)} patient-facing instructions from the transcript (status: Draft)")
    return await save(v)


def _content(ins: list[Instruction]) -> list[tuple[str, str, str]]:
    return [(i.id, i.kind, i.text) for i in ins]


def _apply_edits(v: Visit, body: ConsultUpdate) -> None:
    if v.consult.status == "none":
        raise HTTPException(409, "Generate draft notes first")
    if v.consult.status == "approved":
        raise HTTPException(409, "Approved notes are locked")
    v.consult.notes = body.notes
    v.consult.instructions = body.instructions
    v.consult.edited = body.notes != v.consult.ai_notes or _content(body.instructions) != _content(v.consult.ai_instructions)


@router.put("/visit/consult", response_model=Visit)
async def update_consult(body: ConsultUpdate, persona: str = ClinicianP):
    v = await load(persona)
    _apply_edits(v, body)
    log(v, "clinician", DR, "notes_edited", "Saved edits to the draft notes" + (" (differs from AI draft)" if v.consult.edited else ""))
    return await save(v)


@router.post("/visit/consult/approve", response_model=Visit)
async def approve_consult(body: ApproveRequest, persona: str = ClinicianP):
    v = await load(persona)
    _apply_edits(v, body)
    if not v.consult.instructions:
        raise HTTPException(422, "Add at least one patient-facing instruction")
    if not all(i.approved for i in v.consult.instructions):
        raise HTTPException(422, "Approve every follow-up item before releasing to the patient")
    v.consult.status = "approved"
    v.consult.approved_at = now()
    v.consult.approved_by = DR  # the signed-in demo clinician reviews every visit
    if v.consult.edited:
        log(v, "clinician", DR, "notes_edited", "Corrected the AI draft before approval")
    log(v, "clinician", DR, "approved", f"Approved notes and released {len(v.consult.instructions)} patient-facing instructions")

    cfg = await get_cfg(persona)
    ins = [i.model_dump() for i in v.consult.instructions]
    summary, cats, source = await classify(ins, v.consult.notes.assessment, v.consult.notes.plan, cfg["fallback_summary"], use_ai=v.consult.ai_source == "live")
    v.consult.patient_summary = summary
    v.consult.classified_by = source
    # BR-05 / BR-07: tasks derive only from approved instructions; source text preserved verbatim.
    v.tasks = [
        Task(id=f"task-{i.id}", title=c["title"], kind=i.kind, source_instruction_id=i.id, source_text=i.text,
             verbatim=i.kind == "medication", category=c["category"], duration_days=c["duration_days"],
             due_in_days=c["due_in_days"], classified_by=source)
        for i, c in zip(v.consult.instructions, cats)
    ]
    log(v, "ai", "GPT-5.2" if source == "ai" else "Keyword rules (fallback)", "tasks_classified",
        "Sorted the plan into " + ", ".join(f"{n} {k.replace('_', '-')}" for k in ("daily", "follow_up", "one_time", "urgent") if (n := sum(t.category == k for t in v.tasks))))
    await notify("patient", persona, f"{DR} released your treatment plan", f"{len(v.tasks)} follow-up items are ready for you to review and accept",
                 "/patient/follow-through")
    return await save(v)


# Feature 4 — follow-up tracker
@router.post("/visit/tasks/confirm", response_model=Visit)
async def confirm_tasks(body: ConfirmTasksRequest, persona: str = PatientP):
    v = await load(persona)
    if v.consult.status != "approved":
        raise HTTPException(409, "Follow-up tasks are released only after clinician approval")
    ids = set(body.task_ids)
    today = date.fromisoformat(today_iso(D.TZ))
    consult_day = datetime.fromisoformat(v.consult.approved_at).astimezone(ZoneInfo(D.TZ)).date() if v.consult.approved_at else today
    accepted = []
    for t in v.tasks:
        if t.id in ids and t.status == "suggested":
            t.status = "todo"
            t.confirmed_at = now()
            if t.category == "daily":
                t.start_date = today.isoformat()
                t.end_date = (today + timedelta(days=(t.duration_days or 14) - 1)).isoformat()
            if t.category == "follow_up" and t.due_in_days:
                t.due_date = (consult_day + timedelta(days=t.due_in_days)).isoformat()  # auto deadline from clinician timeframe
            accepted.append(t.title)
    if accepted:
        log(v, "patient", v.patient.name, "tasks_accepted", f"Accepted {len(accepted)} task(s): " + ", ".join(accepted))
        await notify("clinician", persona, f"{v.patient.name} accepted the care plan", f"{len(accepted)} task(s) now active", f"/clinician/consult/{persona}")
    return await save(v)


@router.patch("/visit/tasks/{task_id}", response_model=Visit)
async def update_task(task_id: str, body: TaskStatusUpdate, persona: str = PatientP):
    v = await load(persona)
    task = next((t for t in v.tasks if t.id == task_id), None)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status == "suggested":
        raise HTTPException(409, "Confirm this task before tracking it")
    task.status = body.status
    if body.status == "completed":
        log(v, "patient", v.patient.name, "task_completed", f"Completed: {task.title}")
    return await save(v)


@router.post("/visit/tasks/{task_id}/day", response_model=Visit)
async def toggle_task_day(task_id: str, body: TaskDayToggle, persona: str = PatientP):
    v = await load(persona)
    task = next((t for t in v.tasks if t.id == task_id), None)
    if not task or task.category != "daily":
        raise HTTPException(404, "Daily task not found")
    if task.status == "suggested" or not task.start_date or not task.end_date:
        raise HTTPException(409, "Accept this task before ticking off days")
    if not (task.start_date <= body.date <= task.end_date):
        raise HTTPException(422, "That day is outside this task's schedule")
    if body.date > v.today:
        raise HTTPException(422, "You can't tick off a future day")
    days = set(task.done_dates)
    days.add(body.date) if body.done else days.discard(body.date)
    task.done_dates = sorted(days)
    total = (date.fromisoformat(task.end_date) - date.fromisoformat(task.start_date)).days + 1
    was_done = task.status == "completed"
    task.status = "completed" if len(days) >= total else ("in_progress" if days else "todo")
    if task.status == "completed" and not was_done:
        log(v, "patient", v.patient.name, "task_completed", f"Finished all {total} days: {task.title}")
    return await save(v)


@router.get("/visit/summary/pdf")
async def summary_pdf(persona: str = PatientP):
    v = await load(persona)
    if v.consult.status != "approved":
        raise HTTPException(404, "Your visit summary is available once your clinician approves it")
    first = v.patient.name.split()[0].lower()
    return Response(content=render_summary_pdf(v), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="visitready-visit-summary-{first}.pdf"'})
