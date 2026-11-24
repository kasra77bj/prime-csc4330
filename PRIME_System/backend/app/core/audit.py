"""Audit trail helper: call for every state-changing action (docs/13 section 4)."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


def _jsonable(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, (uuid.UUID, datetime)):
        return str(v)
    if isinstance(v, enum.Enum):
        return v.value
    return v


def audit(db: AsyncSession, user_id: uuid.UUID | None, action: str, entity_type: str | None = None,
          entity_id: uuid.UUID | None = None, before: dict | None = None, after: dict | None = None,
          request: Request | None = None) -> None:
    """Adds an audit row to the current transaction (caller commits)."""
    ip = None
    if request is not None and request.client is not None:
        ip = request.client.host if request.client.host not in ("testclient", "testserver") else None
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type, entity_id=entity_id,
                    before=_jsonable(before), after=_jsonable(after), ip=ip))
