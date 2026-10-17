"""Classify clinician-approved instructions into patient tasks (one-time / daily / follow-up / urgent).

GPT-5.2 first; deterministic keyword rules as a labelled fallback. Instruction text itself is never rewritten (BR-07).
"""

import json
import re

from lib.ai import generate_json

CATEGORIES = ("one_time", "daily", "follow_up", "urgent")
DEFAULT_DAILY_DAYS = 14

_WORDS = {"a": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
          "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "twenty": 20, "thirty": 30}
_NUM = r"(\d+|" + "|".join(_WORDS) + r")"
_UNIT = {"day": 1, "week": 7, "month": 30}

TITLES = {
    ("medication", "daily"): "Take your medication",
    ("self_care", "daily"): "Daily self-care",
    ("test", "one_time"): "Complete your test",
    ("referral", "one_time"): "Arrange your referral",
    ("appointment", "follow_up"): "Book your follow-up appointment",
    ("test", "follow_up"): "Book your results appointment",
}


def _num(s: str) -> int:
    return int(s) if s.isdigit() else _WORDS[s]


def _days(match: re.Match) -> int:
    return _num(match.group(1)) * _UNIT[match.group(2)]


def classify_rules(kind: str, text: str) -> dict:
    t = text.lower()
    duration = re.search(rf"for (?:the next )?{_NUM} (day|week|month)s?", t)
    follow = re.search(rf"(?:in|within) {_NUM} (day|week|month)s?", t) or re.search(rf"{_NUM} (day|week|month)s? after", t)
    if t.startswith("if ") or any(w in t for w in ("000", "emergency", "straight away", "immediately")):
        cat = "urgent"
    elif kind == "appointment" or (follow and any(w in t for w in ("appointment", "review", "follow up", "follow-up", "results"))) or "next week" in t:
        cat = "follow_up"
    elif duration or any(w in t for w in ("daily", "every day", "each day", "twice a day", "once a day", "a day", "each morning", "each night")):
        cat = "daily"
    else:
        cat = "one_time"
    due = None
    if cat == "follow_up":
        due = _days(follow) if follow else (7 if "next week" in t else 14)
    dur = (_days(duration) if duration else DEFAULT_DAILY_DAYS) if cat == "daily" else None
    title = TITLES.get((kind, cat)) or {"urgent": "Know when to get urgent help", "daily": "Daily task", "follow_up": "Book your follow-up", "one_time": "To do"}[cat]
    return {"category": cat, "title": title, "duration_days": dur, "due_in_days": due}


SYSTEM = (
    "You help patients understand a clinician-approved care plan. Classify each instruction and write a short plain-language "
    "summary of the visit for the patient (no new advice, no diagnosis beyond what the clinician wrote). Respond with JSON only."
)


async def classify(instructions: list[dict], assessment: str, plan: str, fallback_summary: str, use_ai: bool = True) -> tuple[str, list[dict], str]:
    """Returns (patient_summary, per-instruction classification, source 'ai'|'rules')."""
    rules = {i["id"]: classify_rules(i["kind"], i["text"]) for i in instructions}
    if use_ai:
        prompt = (
            "Clinician assessment: " + assessment + "\nClinician plan: " + plan + "\n\nApproved instructions (JSON):\n" +
            json.dumps([{"id": i["id"], "kind": i["kind"], "text": i["text"]} for i in instructions], ensure_ascii=False) +
            "\n\nReturn {\"summary\": 2-3 warm plain-English sentences addressed to the patient (\"you\"), "
            "\"tasks\": [{\"id\": same id, \"category\": one of [\"one_time\",\"daily\",\"follow_up\",\"urgent\"], "
            "\"title\": max 6 words, \"duration_days\": integer number of days for daily tasks if stated else null, "
            "\"due_in_days\": integer days until a follow-up is due if a timeframe is stated (e.g. 'in two weeks' = 14, 'next week' = 7) else null}]}. "
            "Use 'urgent' for safety-net / emergency advice, 'daily' for anything repeated every day, 'follow_up' for appointments to book."
        )
        data = await generate_json(SYSTEM, prompt)
        try:
            if data and isinstance(data.get("tasks"), list):
                out = {}
                for t in data["tasks"]:
                    if t.get("id") in rules and t.get("category") in CATEGORIES:
                        cat = t["category"]
                        dur = t.get("duration_days") if cat == "daily" else None
                        due = t.get("due_in_days") if cat == "follow_up" else None
                        out[t["id"]] = {
                            "category": cat,
                            "title": str(t.get("title") or rules[t["id"]]["title"])[:60],
                            "duration_days": max(1, min(int(dur), 90)) if isinstance(dur, (int, float)) else (DEFAULT_DAILY_DAYS if cat == "daily" else None),
                            "due_in_days": max(1, min(int(due), 365)) if isinstance(due, (int, float)) else (rules[t["id"]]["due_in_days"] or 14 if cat == "follow_up" else None),
                        }
                if len(out) == len(rules):
                    return str(data.get("summary") or fallback_summary), [out[i["id"]] for i in instructions], "ai"
        except (TypeError, ValueError):
            pass
    return fallback_summary, [rules[i["id"]] for i in instructions], "rules"
