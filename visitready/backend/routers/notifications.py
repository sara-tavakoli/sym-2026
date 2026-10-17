"""Notification feed for patient and clinician areas."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from lib.auth import patient_persona

from lib.db import db
from models.visit import Notification

router = APIRouter()


def _filter(audience: str, persona: str | None) -> dict:
    q: dict = {"audience": audience}
    if audience == "patient":  # patients only ever see their own visit's notifications
        q["persona"] = persona or "alex"
    return q


async def _check(request: Request, audience: str, persona: str | None) -> None:
    if audience == "patient":  # a real account's notifications are owner-only
        await patient_persona(request, persona or "alex")


@router.get("/notifications", response_model=list[Notification])
async def list_notifications(request: Request, audience: Literal["patient", "clinician"], persona: str | None = Query(None)):
    await _check(request, audience, persona)
    return await db.notifications.find(_filter(audience, persona), {"_id": 0}).sort("created_at", -1).to_list(50)


@router.post("/notifications/read-all", response_model=list[Notification])
async def read_all(request: Request, audience: Literal["patient", "clinician"], persona: str | None = Query(None)):
    await _check(request, audience, persona)
    q = _filter(audience, persona)
    await db.notifications.update_many(q, {"$set": {"read": True}})
    return await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)


@router.post("/notifications/{notification_id}/read", response_model=Notification)
async def read_one(notification_id: str):
    doc = await db.notifications.find_one_and_update({"id": notification_id}, {"$set": {"read": True}}, projection={"_id": 0}, return_document=True)
    if not doc:
        raise HTTPException(404, "Notification not found")
    return doc
