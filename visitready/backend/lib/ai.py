"""OpenAI GPT-5.2 via emergentintegrations. Returns parsed JSON or None (caller falls back)."""

import asyncio
import json
import logging
import os
import re
import uuid

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

logger = logging.getLogger(__name__)


async def generate_json(system: str, prompt: str, timeout: float = 90) -> dict | None:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return None
    chat = LlmChat(api_key=key, session_id=str(uuid.uuid4()), system_message=system).with_model("openai", "gpt-5.2")

    async def run() -> str:
        parts: list[str] = []
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(ev, TextDelta):
                parts.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
        return "".join(parts)

    try:
        text = await asyncio.wait_for(run(), timeout=timeout)
        match = re.search(r"\{.*\}", text, re.S)
        return json.loads(match.group(0)) if match else None
    except Exception as exc:  # any failure → prepared fallback keeps the demo resilient
        logger.warning("LLM generation failed: %s", exc)
        return None
