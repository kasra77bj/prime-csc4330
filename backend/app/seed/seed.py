"""Seed the database for development and the demo (task T0.2).

    python -m app.seed.seed            # idempotent: does nothing if already seeded
    python -m app.seed.seed --reset    # truncate everything and reseed (used by `make reset-demo`)

Prints the demo users' TOTP secrets so they can be added to an authenticator app.
"""
from __future__ import annotations

import hashlib
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import yaml
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.security import encrypt_secret, hash_password
from app.models import (Badge, Base, Dataset, ModelTarget, ModelVersion, OnboardingProgress, PrintJob, Printer,
                        PrintSession, Sensor, SessionStatus, ShiftGoal, Signal, SignalLimit, Site, User,
                        UserBadge, UserRole)

DEMO_PASSWORD = "Prime!2026"
# Fixed base32 TOTP secrets: ONLY used when DEMO_MODE=true (never in production)
DEMO_USERS = [
    ("Maya Ortiz", "maya@prime.demo", UserRole.operator, "MAYAPRIMEDEMO234"),
    ("Dev Patel", "dev@prime.demo", UserRole.engineer, "DEVPRIMEDEMO2345"),
    ("Sam Lee", "sam@prime.demo", UserRole.admin, "SAMPRIMEDEMO2345"),
    ("Jordan Brooks", "jordan@prime.demo", UserRole.manager, "JORDANPRIMEDEMO2"),
    ("Kasra Banijamali", "kasra@prime.demo", UserRole.admin, "KASRAPRIMEDEMO23"),
    ("Carlos Manosalvas", "carlos@prime.demo", UserRole.admin, "CARLOSPRIMEDEMO2"),
]

SENSORS = [
    (Signal.temperature, "Material thermocouple", "°C"),
    (Signal.voltage, "Pump supply voltage", "V"),
    (Signal.current, "Pump motor current", "A"),
    (Signal.duty, "Pump driver duty", "%"),
    (Signal.pump_rpm, "Pump encoder", "RPM"),
    (Signal.print_speed, "Gantry controller", "mm/s"),
    (Signal.sll_width, "Vision: layer width", "mm"),
    (Signal.sll_height, "Vision: layer height", "mm"),
]

# Printer-default limits (normal_min, normal_max, critical_min, critical_max, rate_limit_per_min)
PRINTER_LIMITS = {
    Signal.temperature: (18.0, 24.0, 15.0, 27.0, 1.5),
    Signal.pump_rpm: (5.0, 75.0, 0.0, 80.0, None),
    Signal.motor_power: (-7.0, 0.0, -8.5, 0.5, None),
    Signal.voltage: (11.5, 12.5, 11.0, 13.0, None),
    Signal.print_speed: (5.0, 20.0, 0.0, 25.0, None),
}

BADGES = [
    ("first_catch", "First Catch", "Acknowledged an alert within 15 seconds", "zap", 1),
    ("early_bird", "Early Bird", "Escalated a predicted issue before it became a defect", "sunrise", 1),
    ("steady_hands", "Steady Hands", "100 consecutive in-tolerance layers", "layers", 100),
    ("model_partner", "Model Partner", "Reviewed 10 AI recommendations", "sparkles", 10),
    ("calibrated", "Calibrated", "Completed a sensor test or camera calibration", "crosshair", 1),
    ("safety_first", "Safety First", "Completed the hold-to-stop practice", "shield-check", 1),
]


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def reset(db: Session) -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    db.commit()


def ensure_datasets(db: Session) -> dict[str, Dataset]:
    from app.replay.source_csv import ingest
    data_dir = get_settings().data_dir
    for m in sorted((data_dir / "mappings").glob("*.yaml")):
        name = yaml.safe_load(m.read_text())["dataset"]
        if not db.scalar(select(Dataset).where(Dataset.name == name)):
            ingest(m)
    return {d.name: d for d in db.scalars(select(Dataset))}


def seed(db: Session) -> None:
    s = get_settings()
    now = datetime.now(timezone.utc)
    site = Site(name="RECAST Lab", timezone="America/Chicago")
    db.add(site)
    db.flush()

    users: dict[str, User] = {}
    for name, email, role, secret in DEMO_USERS:
        u = User(email=email, full_name=name, role=role, password_hash=hash_password(DEMO_PASSWORD),
                 totp_secret_enc=encrypt_secret(secret) if s.demo_mode else None,
                 mfa_enrolled=s.demo_mode)
        u.sites.append(site)
        db.add(u)
        users[email.split("@")[0]] = u
    db.flush()

    printers = {
        "Gantry-02": Printer(site_id=site.id, name="Gantry-02", bay="Bay 2", kind="gantry"),
        "Arm-01": Printer(site_id=site.id, name="Arm-01", bay="Bay 1", kind="robot_arm"),
        "Gantry-03": Printer(site_id=site.id, name="Gantry-03", bay="Bay 3", kind="gantry"),
    }
    for p in printers.values():
        p.sensors = [Sensor(signal=sig, label=label, unit=unit, status="live") for sig, label, unit in SENSORS]
        db.add(p)
    db.flush()
    for p in printers.values():
        for sig, (nmin, nmax, cmin, cmax, rate) in PRINTER_LIMITS.items():
            db.add(SignalLimit(printer_id=p.id, signal=sig, normal_min=nmin, normal_max=nmax,
                               critical_min=cmin, critical_max=cmax, rate_limit_per_min=rate))

    dev = users["dev"]
    jobs = {
        "WP-03": PrintJob(name="Wall Panel WP-03", code="A-1027", total_layers=8, created_by=dev.id),
        "C-12": PrintJob(name="Column C-12", code="A-1031", total_layers=6, created_by=dev.id),
        "WP-02": PrintJob(name="Wall Panel WP-02", code="A-1019", total_layers=8, created_by=dev.id),
        "F-2": PrintJob(name="Footing F-2", code="A-1040", total_layers=6, created_by=dev.id),
    }
    db.add_all(jobs.values())
    db.flush()
    # job-specific layer geometry limits (target +/- tolerance, critical = +/- 2x tolerance)
    for job in jobs.values():
        for sig, tgt, tol in ((Signal.sll_width, job.target_layer_width_mm, job.width_tolerance_mm),
                              (Signal.sll_height, job.target_layer_height_mm, job.height_tolerance_mm)):
            for p in printers.values():
                db.add(SignalLimit(printer_id=p.id, job_id=job.id, signal=sig, normal_min=tgt - tol,
                                   normal_max=tgt + tol, critical_min=tgt - 2 * tol,
                                   critical_max=tgt + 2 * tol))

    ds = ensure_datasets(db)
    maya = users["maya"]
    db.add_all([
        PrintSession(job_id=jobs["WP-02"].id, printer_id=printers["Gantry-02"].id,
                     dataset_id=ds["hist_wp02_completed"].id, status=SessionStatus.completed,
                     started_at=now - timedelta(days=1, hours=2), ended_at=now - timedelta(days=1, hours=1, minutes=7),
                     current_layer=8, operator_id=maya.id, engineer_id=dev.id, quality_score=93.0,
                     replay_speed=1.0),
        PrintSession(job_id=jobs["WP-03"].id, printer_id=printers["Gantry-02"].id,
                     dataset_id=ds["demo_wp03"].id, branch_dataset_id=ds["demo_wp03_noaction"].id,
                     scenario_name="demo", status=SessionStatus.scheduled, operator_id=maya.id,
                     engineer_id=dev.id, replay_speed=s.demo_speed, current_delay_min=5),
        PrintSession(job_id=jobs["C-12"].id, printer_id=printers["Arm-01"].id,
                     dataset_id=ds["trial_c12_calm"].id, scenario_name="background",
                     status=SessionStatus.scheduled, operator_id=maya.id, engineer_id=dev.id,
                     replay_speed=s.demo_speed, current_delay_min=5),
    ])

    cfg = yaml.safe_load(s.model_config_path.read_text())
    for target, key, algo, kind, classes in (
            (ModelTarget.extrusion_rate, "extrusion_rate", "xgboost", "regression", None),
            (ModelTarget.interlayer_delay, "interlayer_delay", "random_forest", "classification", [1, 5, 10])):
        f = s.model_dir / cfg[key]["file"]
        db.add(ModelVersion(target=target, algorithm=algo, kind=kind, file_name=f.name,
                            sha256=sha256(f) if f.exists() else "missing",
                            feature_names=[x["name"] for x in cfg["features"]], classes=classes,
                            trained_with={"scikit-learn": "1.8.0"} if algo == "random_forest" else
                            {"xgboost": "unknown (loads in 3.4.1)"}))

    badges = {code: Badge(code=code, name=n, description=d, icon=i, threshold=t) for code, n, d, i, t in BADGES}
    db.add_all(badges.values())
    db.flush()
    for code in ("first_catch", "calibrated", "safety_first", "early_bird"):
        db.add(UserBadge(user_id=maya.id, badge_id=badges[code].id, progress=1, earned_at=now - timedelta(days=3)))
    db.add(UserBadge(user_id=maya.id, badge_id=badges["steady_hands"].id, progress=46))
    db.add(UserBadge(user_id=dev.id, badge_id=badges["model_partner"].id, progress=7))

    for key, u in users.items():
        done = key != "maya"            # Maya experiences onboarding live in the demo
        db.add(OnboardingProgress(user_id=u.id, welcome_done=done, role_seen=done, tour_done=done,
                                  practice_stop_done=done, first_live_watched=done, first_alert_ack=done,
                                  dismissed=done))
    db.add(ShiftGoal(site_id=site.id, shift_label="Shift B", date=date.today(),
                     goal_text="3 prints with quality score ≥ 90", target=3, progress=1))
    db.commit()

    print("\nSeeded PRIME demo data. Password for every demo user:", DEMO_PASSWORD)
    if s.demo_mode:
        print("TOTP secrets (add to an authenticator app as 'PRIME <name>'):")
        for name, email, role, secret in DEMO_USERS:
            print(f"  {name:18s} {email:20s} {role.value:9s} {secret}")


def main(argv: list[str]) -> None:
    engine = create_engine(get_settings().sync_database_url)
    with Session(engine) as db:
        if "--reset" in argv:
            reset(db)
        elif db.scalar(select(Site).limit(1)):
            print("Already seeded (use --reset to start over).")
            return
        seed(db)
    engine.dispose()


if __name__ == "__main__":
    main(sys.argv[1:])
