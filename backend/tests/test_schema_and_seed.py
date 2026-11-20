import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (Adjustment, AdjustParam, AdjustSource, PrintSession, SessionStatus, Site, User)
from app.seed.seed import main as seed_main


def test_seed_is_idempotent(sync_engine, capsys):
    seed_main(["--reset"])
    seed_main([])
    assert "Already seeded" in capsys.readouterr().out
    with Session(sync_engine) as db:
        assert db.scalar(text("select count(*) from users")) == 8
        assert db.scalar(text("select count(*) from datasets")) == 5
        assert db.scalar(text("select count(*) from print_sessions")) == 3


def test_manual_adjustment_requires_note(sync_engine):
    with Session(sync_engine) as db:
        s = db.scalar(select(PrintSession).where(PrintSession.status == SessionStatus.scheduled))
        u = db.scalar(select(User).limit(1))
        db.add(Adjustment(session_id=s.id, parameter=AdjustParam.pump_rpm, from_value=27, to_value=34,
                          source=AdjustSource.manual, user_id=u.id, requested_at_layer=5, note=None))
        with pytest.raises(IntegrityError):
            db.commit()


def test_one_active_session_per_printer(sync_engine):
    with Session(sync_engine) as db:
        sessions = db.scalars(select(PrintSession).where(PrintSession.status == SessionStatus.scheduled)).all()
        wp03 = next(s for s in sessions if s.scenario_name == "demo")
        wp03.status = SessionStatus.running
        db.commit()
        other = PrintSession(job_id=wp03.job_id, printer_id=wp03.printer_id, status=SessionStatus.running)
        db.add(other)
        with pytest.raises(IntegrityError):
            db.commit()
