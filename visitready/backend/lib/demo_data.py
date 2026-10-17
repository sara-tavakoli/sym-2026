"""Fictional reference data for the VisitReady demo. Nothing here is real."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from lib.dates import today_iso

VISIT_ID = "visit-alex-001"

PATIENT = {"name": "Alex Turner", "age": 32, "pronouns": "they/them", "suburb": "Carlton VIC 3053"}

SERVICES = [
    {"id": "gp", "name": "General Practice (GP)", "description": "Everyday health concerns, check-ups, referrals and ongoing care.", "keywords": ["fever", "cough", "cold", "flu", "sore throat", "throat", "headache", "tired", "rash", "ear", "stomach", "pain", "check-up", "prescription", "vomit", "temperature"]},
    {"id": "telehealth", "name": "Telehealth GP", "description": "A video or phone consult with a GP from home.", "keywords": ["fever", "cold", "flu", "sore throat", "prescription", "certificate", "home", "video"]},
    {"id": "physio", "name": "Physiotherapy", "description": "Muscle, joint and movement concerns.", "keywords": ["back", "knee", "shoulder", "neck", "joint", "muscle", "sprain", "injury", "ankle", "stiff"]},
    {"id": "psychology", "name": "Psychology", "description": "Support for mood, stress, anxiety and wellbeing.", "keywords": ["stress", "anxiety", "anxious", "sad", "low mood", "sleep", "worried", "panic", "mood"]},
    {"id": "skin", "name": "Skin Check", "description": "Mole and skin spot checks with a skin-focused GP.", "keywords": ["mole", "skin", "spot", "freckle", "rash", "itch", "lump", "sunburn"]},
    {"id": "dental", "name": "Dental", "description": "Teeth, gums and oral health.", "keywords": ["tooth", "teeth", "toothache", "gum", "jaw", "mouth"]},
]

IMG_CLINIC_1 = "https://images.unsplash.com/photo-1505410603994-c3ac6269711f?crop=entropy&cs=srgb&fm=jpg&w=900&q=70"
IMG_CLINIC_2 = "https://images.unsplash.com/photo-1510414890190-f33e404300b6?crop=entropy&cs=srgb&fm=jpg&w=900&q=70"
IMG_CLINIC_3 = "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?crop=entropy&cs=srgb&fm=jpg&w=900&q=70"
IMG_CLINIC_4 = "https://images.unsplash.com/photo-1758691461990-03b49d969495?crop=entropy&cs=srgb&fm=jpg&w=900&q=70"

_CLINICS = [
    {
        "id": "carlton-family",
        "name": "Carlton Family Medical",
        "suburb": "Carlton VIC 3053",
        "address": "112 Lygon Street, Carlton VIC 3053",
        "image": IMG_CLINIC_1,
        "bulk_billing": True,
        "rating": 4.8,
        "lat": -37.7995, "lng": 144.9668, "online": False,
        "services": ["gp", "skin", "telehealth"],
        "blurb": "A warm neighbourhood practice with long appointments available and an on-site nurse.",
        "practitioners": [
            {"id": "dr-lin", "name": "Dr Sarah Lin", "role": "General Practitioner", "bio": "Interests in respiratory health, asthma and preventive care.", "languages": ["English", "Mandarin"]},
            {"id": "dr-vance", "name": "Dr Marcus Vance", "role": "General Practitioner", "bio": "Family medicine, men's health and skin checks.", "languages": ["English"]},
        ],
    },
    {
        "id": "fitzroy-health",
        "name": "Fitzroy North Health Centre",
        "suburb": "Fitzroy North VIC 3068",
        "address": "48 St Georges Road, Fitzroy North VIC 3068",
        "image": IMG_CLINIC_2,
        "bulk_billing": False,
        "rating": 4.6,
        "lat": -37.783, "lng": 144.9895, "online": False,
        "services": ["gp", "physio", "psychology"],
        "blurb": "Multidisciplinary centre with GPs, physiotherapists and psychologists under one roof.",
        "practitioners": [
            {"id": "dr-okafor", "name": "Dr Amara Okafor", "role": "General Practitioner", "bio": "Women's health, mental health care plans and chronic conditions.", "languages": ["English", "Igbo"]},
            {"id": "jo-harris", "name": "Jo Harris", "role": "Physiotherapist", "bio": "Sports injuries and back pain rehabilitation.", "languages": ["English"]},
        ],
    },
    {
        "id": "melbourne-telehealth",
        "name": "Melbourne Telehealth Hub",
        "suburb": "Online · Victoria",
        "address": "Video and phone consults (online, Australia-wide demo)",
        "image": IMG_CLINIC_3,
        "bulk_billing": True,
        "rating": 4.5,
        "lat": None, "lng": None, "online": True,
        "services": ["telehealth", "gp", "psychology"],
        "blurb": "Same-day video consults with GPs from home.",
        "practitioners": [
            {"id": "dr-patel", "name": "Dr Ravi Patel", "role": "General Practitioner", "bio": "Telehealth-first GP focused on acute and everyday care.", "languages": ["English", "Hindi"]},
        ],
    },
    {
        "id": "brunswick-dental",
        "name": "Brunswick Smile Studio",
        "suburb": "Brunswick VIC 3056",
        "address": "301 Sydney Road, Brunswick VIC 3056",
        "image": IMG_CLINIC_4,
        "bulk_billing": False,
        "rating": 4.7,
        "lat": -37.768, "lng": 144.9614, "online": False,
        "services": ["dental"],
        "blurb": "General and preventive dentistry.",
        "practitioners": [
            {"id": "dr-nguyen", "name": "Dr Linh Nguyen", "role": "Dentist", "bio": "Gentle general dentistry and check-ups.", "languages": ["English", "Vietnamese"]},
        ],
    },
]

_TIMES = ["08:45", "10:15", "13:30", "16:00", "17:30"]
TZ = "Australia/Melbourne"  # fictional clinics are in Melbourne

# ---- Fictional Sydney demo clinics (not real providers). Coordinates are real suburb/street locations so distances are genuine. ----
def _syd(cid, name, suburb, address, lat, lng, services, blurb, practitioners, img, bulk=True, rating=4.6):
    return {"id": cid, "name": name, "suburb": suburb, "address": address, "image": img, "bulk_billing": bulk, "rating": rating,
            "lat": lat, "lng": lng, "online": False, "services": services, "blurb": blurb,
            "practitioners": [{"id": pid, "name": pn, "role": role, "bio": bio, "languages": langs} for pid, pn, role, bio, langs in practitioners]}


_CLINICS += [
    _syd("macquarie-park-gp", "Macquarie Park Family Practice", "Macquarie Park NSW 2113", "Waterloo Road, Macquarie Park NSW 2113", -33.7770, 151.1230,
         ["gp", "skin", "telehealth"], "Fictional demo practice near the business park, with early-morning appointments.",
         [("dr-chen", "Dr Emily Chen", "General Practitioner", "Family medicine and respiratory care.", ["English", "Cantonese"])], IMG_CLINIC_1),
    _syd("north-ryde-physio", "North Ryde Movement Physio", "North Ryde NSW 2113", "Lane Cove Road, North Ryde NSW 2113", -33.7969, 151.1243,
         ["physio"], "Fictional demo physiotherapy studio for back, neck and sports injuries.",
         [("sam-reid", "Sam Reid", "Physiotherapist", "Back pain and running injuries.", ["English"])], IMG_CLINIC_2, bulk=False, rating=4.7),
    _syd("epping-dental", "Epping Smile Dental", "Epping NSW 2121", "Oxford Street, Epping NSW 2121", -33.7727, 151.0818,
         ["dental"], "Fictional demo dental clinic offering check-ups and gentle cleans.",
         [("dr-kim", "Dr Jun Kim", "Dentist", "General and preventive dentistry.", ["English", "Korean"])], IMG_CLINIC_3, bulk=False, rating=4.5),
    _syd("chatswood-gp", "Chatswood Village GP", "Chatswood NSW 2067", "Victoria Avenue, Chatswood NSW 2067", -33.7969, 151.1803,
         ["gp", "psychology", "telehealth"], "Fictional demo GP and wellbeing clinic close to Chatswood station.",
         [("dr-wong", "Dr Grace Wong", "General Practitioner", "Women's health and mental health care plans.", ["English", "Mandarin"]),
          ("mia-ross", "Mia Ross", "Psychologist", "Anxiety, stress and sleep.", ["English"])], IMG_CLINIC_1, rating=4.8),
    _syd("st-leonards-skin", "St Leonards Skin Clinic", "St Leonards NSW 2065", "Pacific Highway, St Leonards NSW 2065", -33.8234, 151.1955,
         ["skin", "gp"], "Fictional demo skin-check clinic with dermatoscope mole mapping.",
         [("dr-ahmed", "Dr Omar Ahmed", "GP (Skin Cancer Medicine)", "Mole checks and skin spot reviews.", ["English", "Arabic"])], IMG_CLINIC_2),
    _syd("town-hall-medical", "Town Hall Medical Centre", "Sydney NSW 2000", "George Street, Sydney NSW 2000", -33.8731, 151.2067,
         ["gp", "skin", "telehealth"], "Fictional demo CBD practice for city workers, open late on weekdays.",
         [("dr-brooks", "Dr Hannah Brooks", "General Practitioner", "Acute care and travel health.", ["English"])], IMG_CLINIC_1, rating=4.4),
    _syd("surry-hills-mind", "Surry Hills Mind & Body", "Surry Hills NSW 2010", "Crown Street, Surry Hills NSW 2010", -33.8861, 151.2111,
         ["psychology", "physio"], "Fictional demo practice for psychology and physiotherapy.",
         [("dr-lopez", "Dr Sofia Lopez", "Clinical Psychologist", "Mood, stress and life transitions.", ["English", "Spanish"])], IMG_CLINIC_3, bulk=False, rating=4.9),
    _syd("bondi-junction-gp", "Bondi Junction Health", "Bondi Junction NSW 2022", "Oxford Street, Bondi Junction NSW 2022", -33.8932, 151.2490,
         ["gp", "skin"], "Fictional demo GP practice with sun-safety skin checks.",
         [("dr-taylor", "Dr Liam Taylor", "General Practitioner", "Men's health and skin checks.", ["English"])], IMG_CLINIC_2),
    _syd("parramatta-family", "Parramatta Family Doctors", "Parramatta NSW 2150", "Church Street, Parramatta NSW 2150", -33.8150, 151.0011,
         ["gp", "dental", "telehealth"], "Fictional demo family practice in western Sydney.",
         [("dr-singh", "Dr Arjun Singh", "General Practitioner", "Chronic conditions and family care.", ["English", "Punjabi", "Hindi"])], IMG_CLINIC_3, rating=4.6),
]

CLINICIAN = {"id": "dr-lin", "name": "Dr Sarah Lin", "role": "General Practitioner", "clinic": "Carlton Family Medical"}


def _today_times(now: datetime) -> list[str]:
    """Remaining standard times today, plus two near-term demo slots so a same-day booking is always possible."""
    current = now.strftime("%H:%M")
    times = {t for t in _TIMES if t > current}
    base = now.replace(second=0, microsecond=0) + timedelta(minutes=30 - now.minute % 30)
    for k in range(2):
        t = base + timedelta(minutes=30 * k)
        if t.date() == now.date():
            times.add(t.strftime("%H:%M"))
    return sorted(times)


def clinics() -> list[dict]:
    """Clinics with slots for today (remaining times) and the next two days, anchored on Melbourne time."""
    now = datetime.now(ZoneInfo(TZ))
    start = date.fromisoformat(today_iso(TZ))
    out = []
    for c in _CLINICS:
        slots = []
        for d in range(3):
            day = (start + timedelta(days=d)).isoformat()
            for pi, p in enumerate(c["practitioners"]):
                times = _today_times(now) if d == 0 else [t for ti, t in enumerate(_TIMES) if (ti + pi + d) % 3 != 2]
                for t in times:
                    mode = "telehealth" if c["online"] else "in_person"
                    slots.append({"id": f"{c['id']}_{p['id']}_{day}_{t}", "practitioner_id": p["id"], "date": day, "time": t, "mode": mode})
        out.append({**c, "slots": slots})
    return out


RED_FLAGS = [
    "chest pain", "can't breathe", "cannot breathe", "difficulty breathing", "short of breath", "shortness of breath",
    "coughing blood", "coughing up blood", "unconscious", "fainting", "stroke", "severe bleeding", "suicidal", "blue lips",
]

_PATHWAYS = [
    (["skin", "mole", "rash", "spot", "freckle"], "skin"),
    (["back", "knee", "shoulder", "joint", "sprain", "ankle", "neck pain"], "physio"),
    (["anxious", "anxiety", "stress", "mood", "depress", "panic", "sleep"], "psychology"),
    (["tooth", "teeth", "gum", "dental", "jaw"], "dental"),
]


def suggest_pathway(q: dict) -> dict:
    """Predefined, rule-based service suggestion. Explicitly NOT a diagnosis or triage decision."""
    text = f"{q['main_concern']} {q.get('referral', '')}".lower()
    emergency = any(flag in text for flag in RED_FLAGS)
    service_id = "gp"
    for words, sid in _PATHWAYS:
        if any(w in text for w in words):
            service_id = sid
            break
    if service_id == "gp" and q.get("preference") == "telehealth":
        service_id = "telehealth"
    names = {s["id"]: s["name"] for s in SERVICES}

    reasons = [f"You described: \u201c{q['main_concern'].strip()}\u201d"]
    reasons.append(f"It has been going on for {q['duration']}.")
    if q["consulted_before"] == "no":
        reasons.append("You haven't seen a health professional about this yet \u2014 a GP is a common first stop.")
    else:
        reasons.append("You've already seen someone \u2014 a GP can review progress and coordinate next steps.")
    if q.get("referral"):
        reasons.append(f"Referral noted: {q['referral']}. Bring it to your appointment.")

    explanations = {
        "gp": "Many people with concerns like this start with a General Practitioner, who can assess you in person, arrange tests and refer you on if needed.",
        "telehealth": "A telehealth GP can talk through your concern from home and arrange an in-person visit or tests if needed.",
        "skin": "Skin-focused GPs can look at spots and changes and refer you to a dermatologist if needed.",
        "physio": "A physiotherapist can assess movement concerns. A GP is also a good option if you're unsure.",
        "psychology": "A GP can create a Mental Health Treatment Plan, and psychologists offer ongoing support.",
        "dental": "A dentist is the right place to start for teeth and gum concerns.",
    }
    alternatives = [s for s in ["gp", "telehealth"] if s != service_id][:2]
    return {
        "service_id": service_id,
        "service_name": names[service_id],
        "headline": f"People with similar concerns often explore {names[service_id]}",
        "explanation": explanations[service_id],
        "reasons": reasons,
        "alternatives": alternatives,
        "emergency": emergency,
    }


SAMPLE_TRANSCRIPT_TITLE = "Fictional consult \u2014 Dr Sarah Lin & Alex Turner (6 min)"
SAMPLE_TRANSCRIPT = """Dr Lin: Hi Alex, come on in. I've had a look at the notes you shared before today \u2014 thank you, that's really helpful. Tell me about this cough.
Alex: It started after a cold about three weeks ago. The cold went away but the cough just hasn't. It's dry, and it's worst at night \u2014 it's keeping me up.
Dr Lin: Any fever, chills, or coughing anything up?
Alex: No fever for the last two weeks. Nothing coming up, it's just dry and tickly.
Dr Lin: Any shortness of breath, chest pain, or wheezing?
Alex: Maybe a little wheezy when I go for a run, but no chest pain.
Dr Lin: Do you smoke or vape? Any asthma history?
Alex: I don't smoke. I had mild asthma as a kid but haven't needed a puffer in years.
Dr Lin: What have you tried so far?
Alex: Honey and lemon, and some lozenges from the chemist. They help a bit.
Dr Lin: OK. Let me have a listen to your chest. ... Your temperature is 36.8, oxygen saturation is 98 percent, and your chest sounds clear today with a very faint wheeze on forced breathing out. Throat looks normal.
Alex: Is it something serious? That's my main worry.
Dr Lin: It's a really common pattern after a viral infection \u2014 we call it a post-viral cough, and with your childhood asthma there may be some airway sensitivity. It usually settles, but because it's been three weeks I'd like a chest X-ray just to be thorough.
Alex: Sure.
Dr Lin: I'm also going to prescribe a preventer inhaler. Fluticasone 125 micrograms, two puffs twice a day for four weeks, and rinse your mouth with water after each use.
Alex: Got it.
Dr Lin: Please book a review appointment with me in two weeks so we can go over the X-ray and see how the inhaler is going. Keep up the honey and warm drinks, and try to avoid smoky environments.
Dr Lin: And importantly \u2014 if you become short of breath, have chest pain, or cough up blood, call 000 or go to the emergency department straight away.
Alex: Thanks, Dr Lin. That's reassuring."""

FALLBACK_NOTES = {
    "subjective": "32yo presenting with 3-week dry cough following a viral URTI. Cough worse at night, disturbing sleep. No fever for 2 weeks, non-productive. Mild exertional wheeze when running. No chest pain. Non-smoker, no vaping. Childhood mild asthma, no inhaler use in years. Tried honey/lemon and OTC lozenges with partial relief. Patient concerned about serious cause.",
    "objective": "Temp 36.8\u00b0C. SpO2 98% on room air. Chest clear on auscultation, faint end-expiratory wheeze on forced expiration. Throat NAD.",
    "assessment": "Likely post-viral cough with possible airway hyperreactivity given childhood asthma history. No red-flag features identified today.",
    "plan": "Chest X-ray given 3-week duration. Commence inhaled corticosteroid preventer. Review in 2 weeks with X-ray results. Supportive care. Safety-netting advice given re: SOB, chest pain, haemoptysis.",
}

FALLBACK_INSTRUCTIONS = [
    {"kind": "test", "text": "Have a chest X-ray at any radiology clinic using the request form from Dr Lin."},
    {"kind": "medication", "text": "Fluticasone 125 micrograms, two puffs twice a day for four weeks, and rinse your mouth with water after each use."},
    {"kind": "appointment", "text": "Book a review appointment with Dr Lin in two weeks to go over the X-ray and how the inhaler is going."},
    {"kind": "self_care", "text": "Keep up honey and warm drinks, and avoid smoky environments."},
    {"kind": "self_care", "text": "If you become short of breath, have chest pain, or cough up blood, call 000 or go to the emergency department straight away."},
]

TASK_TITLES = {
    "test": "Complete your test",
    "medication": "Take medication as prescribed",
    "appointment": "Book your follow-up appointment",
    "referral": "Arrange your referral",
    "self_care": "Self-care advice",
}

PREP_FIELD_LABELS = {
    "main_concern": "Main concern",
    "symptoms": "Symptoms",
    "duration": "Duration",
    "previous_care": "Previous care",
    "history": "Relevant history",
    "medications": "Current medications",
    "concerns": "Worries",
    "questions": "Questions",
}


# ---------- Second persona: Priya (skin check pathway) ----------
PRIYA_TRANSCRIPT_TITLE = "Fictional consult \u2014 Dr Marcus Vance & Priya Sharma (5 min)"
PRIYA_TRANSCRIPT = """Dr Vance: Hi Priya, thanks for sharing your notes ahead of today. You mentioned a mole on your back?
Priya: Yes, on my upper back. My partner noticed it looks darker than it used to, and the edge seems more uneven. Maybe over the last two or three months.
Dr Vance: Any itching, bleeding or crusting?
Priya: It itched a little last week. No bleeding.
Dr Vance: Any family history of melanoma or skin cancer?
Priya: My dad had a melanoma removed about ten years ago.
Dr Vance: Thanks, that's important. And sun exposure growing up?
Priya: Lots of beach summers in Queensland, a few bad sunburns as a teenager.
Dr Vance: Let me take a look with the dermatoscope. ... It's about 7 millimetres, with some asymmetry and an irregular border, and two shades of brown. The rest of your skin check looks fine today.
Priya: Should I be worried?
Dr Vance: Most changing moles turn out to be harmless, but given the changes and your family history, I'd like to remove it so it can be looked at under a microscope. That's the safest way to know for sure.
Priya: OK. How does that work?
Dr Vance: Please book a 30-minute procedure appointment with me next week for an excision biopsy. It's done here under local anaesthetic.
Dr Vance: After the procedure, apply mupirocin 2% ointment to the wound twice a day for five days, and keep the dressing dry for 48 hours.
Dr Vance: The results usually take about a week. We'll call you, and please book a results appointment for ten days after the procedure.
Dr Vance: In the meantime, use SPF 50+ sunscreen daily and keep up a yearly full skin check.
Dr Vance: If the mole bleeds, grows quickly, or you notice any new changing spots before then, book in sooner.
Priya: Thank you, that's really clear."""

PRIYA_FALLBACK_NOTES = {
    "subjective": "41yo presenting with changing pigmented lesion upper back, noticed by partner over 2\u20133 months: darker, more irregular edge. Mild itch last week. No bleeding. FHx: father melanoma (~10 yrs ago). Significant childhood sun exposure (QLD), several blistering sunburns as teen.",
    "objective": "Dermatoscopy: 7mm pigmented lesion upper back with asymmetry, irregular border, two shades of brown. Remainder of full skin check unremarkable.",
    "assessment": "Changing atypical naevus \u2014 melanoma not excluded given ABCD features and positive family history.",
    "plan": "Excision biopsy under LA next week (30 min procedure appt). Histology. Post-procedure wound care. Results appt 10 days post-procedure. Sun protection, annual skin check. Safety-netting re: bleeding/rapid growth/new lesions.",
}

PRIYA_FALLBACK_INSTRUCTIONS = [
    {"kind": "appointment", "text": "Book a 30-minute procedure appointment with Dr Vance next week for an excision biopsy of the mole on your upper back."},
    {"kind": "medication", "text": "After the procedure, apply mupirocin 2% ointment to the wound twice a day for five days, and keep the dressing dry for 48 hours."},
    {"kind": "test", "text": "Book a results appointment for ten days after the procedure to go over the biopsy results."},
    {"kind": "self_care", "text": "Use SPF 50+ sunscreen daily and keep up a yearly full skin check."},
    {"kind": "self_care", "text": "If the mole bleeds, grows quickly, or you notice any new changing spots, book in sooner."},
]

PERSONAS: dict[str, dict] = {
    "alex": {
        "id": "alex",
        "visit_id": VISIT_ID,
        "initials": "AT",
        "patient": PATIENT,
        "tagline": "Dry cough for three weeks \u2192 GP pathway",
        "quote": "I've had a dry cough for three weeks since a cold. I don't know if I need a GP, a specialist, or just to wait it out.",
        "demo_questionnaire": {
            "main_concern": "Dry cough that started after a cold and won't go away. Worse at night.",
            "duration": "more than 3 weeks", "consulted_before": "no", "referral": "",
            "location": "Carlton VIC 3053", "preference": "in_person", "consent_reuse": True,
        },
        "demo_prep": {
            "symptoms": "Dry, tickly cough, worst at night and keeping me awake. A little wheezy when I go for a run. No fever now.",
            "previous_care": "Haven't seen a doctor yet. Tried honey and lemon and throat lozenges, which help a bit.",
            "history": "Mild asthma as a child, haven't used a puffer in years. I don't smoke or vape.",
            "medications": "Throat lozenges from the pharmacy",
            "concerns": "I'm worried it might be something serious because it isn't going away.",
            "questions": "Could this be my asthma coming back?\nDo I need a chest X-ray?\nWhat can I do to sleep better tonight?",
        },
        "transcript_title": SAMPLE_TRANSCRIPT_TITLE,
        "transcript": SAMPLE_TRANSCRIPT,
        "fallback_notes": FALLBACK_NOTES,
        "fallback_instructions": FALLBACK_INSTRUCTIONS,
        "fallback_summary": "Your cough is most likely a post-viral cough, which is common after a cold and usually settles. Because it has lasted three weeks, Dr Lin has asked for a chest X-ray and started a preventer inhaler. You'll review the results together in two weeks.",
    },
    "priya": {
        "id": "priya",
        "visit_id": "visit-priya-001",
        "initials": "PS",
        "patient": {"name": "Priya Sharma", "age": 41, "pronouns": "she/her", "suburb": "Brunswick VIC 3056"},
        "tagline": "A mole that has changed \u2192 Skin Check pathway",
        "quote": "My partner says the mole on my back looks darker than it used to. It's probably nothing, but I'm not sure who to see.",
        "demo_questionnaire": {
            "main_concern": "A mole on my upper back seems darker and its edge looks more uneven over the last few months.",
            "duration": "several months", "consulted_before": "no", "referral": "",
            "location": "Brunswick VIC 3056", "preference": "in_person", "consent_reuse": True,
        },
        "demo_prep": {
            "symptoms": "Mole on upper back looks darker with an uneven edge. Itched a little last week. No bleeding.",
            "previous_care": "Haven't had it checked yet. Last full skin check was about five years ago.",
            "history": "My dad had a melanoma removed about ten years ago. Lots of sunburns as a teenager in Queensland.",
            "medications": "None",
            "concerns": "Worried because of my dad's melanoma.",
            "questions": "Does this mole need to be removed?\nHow often should I have skin checks?\nWhat should I watch for at home?",
        },
        "transcript_title": PRIYA_TRANSCRIPT_TITLE,
        "transcript": PRIYA_TRANSCRIPT,
        "fallback_notes": PRIYA_FALLBACK_NOTES,
        "fallback_instructions": PRIYA_FALLBACK_INSTRUCTIONS,
        "fallback_summary": "The mole on your back has changed, and with your family history Dr Vance would like to remove it so it can be checked under a microscope. Most changing moles turn out to be harmless. You'll book a short procedure next week and a results appointment afterwards.",
    },
}
