"""Session report, quality score and data export (US-12, US-13; docs/12 section 7, docs/17 sections 5-7)."""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import not_found
from app.core.rbac import Permission, require
from app.db import get_db
from app.models import PrintJob, PrintSession, SessionReport, User
from app.reports.service import build_report, bundle_to_zip, export_bundle, quality, report_payload

router = APIRouter(tags=["reports"])
REPORTS = require(Permission.view_reports)
EXPORT = require(Permission.export_data)


class SummaryIn(BaseModel):
    summary_text: str = Field(min_length=10, max_length=4000)


async def _session(db: AsyncSession, session_id: uuid.UUID) -> PrintSession:
    s = await db.get(PrintSession, session_id)
    if s is None:
        raise not_found("Session")
    return s


@router.get("/sessions/{session_id}/quality")
async def session_quality(session_id: uuid.UUID, _: User = Depends(require(Permission.view_live)),
                          db: AsyncSession = Depends(get_db)):
    """Live quality score (0-100) with its three factors and the clean-print streak."""
    await _session(db, session_id)
    return await quality(db, session_id)


@router.get("/sessions/{session_id}/report")
async def get_report(session_id: uuid.UUID, _: User = Depends(REPORTS), db: AsyncSession = Depends(get_db)):
    await _session(db, session_id)
    return await report_payload(db, session_id)


@router.post("/sessions/{session_id}/report")
async def regenerate_report(session_id: uuid.UUID, request: Request, user: User = Depends(REPORTS),
                            db: AsyncSession = Depends(get_db)):
    await _session(db, session_id)
    rep = await build_report(db, session_id)
    audit(db, user.id, "report.generate", "session_report", rep.id, request=request)
    await db.commit()
    return await report_payload(db, session_id)


@router.patch("/sessions/{session_id}/report")
async def edit_summary(session_id: uuid.UUID, body: SummaryIn, request: Request, user: User = Depends(EXPORT),
                       db: AsyncSession = Depends(get_db)):
    """Engineers and managers may edit the generated summary before exporting it."""
    await _session(db, session_id)
    rep = await db.scalar(select(SessionReport).where(SessionReport.session_id == session_id))
    if rep is None:
        rep = await build_report(db, session_id)
    before = rep.summary_text
    rep.summary_text = body.summary_text.strip()
    audit(db, user.id, "report.edit_summary", "session_report", rep.id, {"summary_text": before},
          {"summary_text": rep.summary_text}, request)
    await db.commit()
    return await report_payload(db, session_id)


async def _filename(db: AsyncSession, s: PrintSession, ext: str) -> str:
    job = await db.get(PrintJob, s.job_id)
    day = (s.started_at or s.created_at).strftime("%Y-%m-%d")
    return f"PRIME_{job.code}_{day}.{ext}"


@router.get("/sessions/{session_id}/export.csv")
async def export_csv(session_id: uuid.UUID, request: Request, user: User = Depends(EXPORT),
                     db: AsyncSession = Depends(get_db)):
    """Zip of readings.csv, predictions.csv, adjustments.csv and alerts.csv (units in the headers)."""
    s = await _session(db, session_id)
    data = bundle_to_zip(await export_bundle(db, session_id))
    name = await _filename(db, s, "zip")
    audit(db, user.id, "session.export", "print_session", s.id, None, {"format": "csv"}, request)
    await db.commit()
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/sessions/{session_id}/export.json")
async def export_json(session_id: uuid.UUID, request: Request, user: User = Depends(EXPORT),
                      db: AsyncSession = Depends(get_db)):
    s = await _session(db, session_id)
    bundle = await export_bundle(db, session_id)
    name = await _filename(db, s, "json")
    audit(db, user.id, "session.export", "print_session", s.id, None, {"format": "json"}, request)
    await db.commit()
    return Response(json.dumps(bundle, default=str), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
