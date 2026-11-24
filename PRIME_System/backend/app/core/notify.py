"""Create a notification row and push it to the user's WebSocket channel."""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification
from app.ws.hub import hub


async def notify(db: AsyncSession, user_id: uuid.UUID | None, kind: str, title: str, body: str | None = None,
                 link: str | None = None, extra: dict | None = None) -> Notification | None:
    if user_id is None:
        return None
    n = Notification(user_id=user_id, kind=kind, title=title, body=body, link=link)
    db.add(n)
    await db.flush()
    await hub.publish(f"user:{user_id}", "notification",
                      {"id": str(n.id), "kind": kind, "title": title, "body": body, "link": link, **(extra or {})})
    return n
