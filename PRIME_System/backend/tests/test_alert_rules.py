from app.alerts.engine import AlertRules, Limit
from app.models import AlertKind, Severity, Signal


def rules():
    return AlertRules({Signal.sll_width: Limit(18.5, 20.5, 17.5, 21.5, target=19.5, tolerance=1.0),
                       Signal.temperature: Limit(18, 24, 15, 27, rate_limit_per_min=1.5)})


def feed(r, values, signal="sll_width", printing=True, extra=None):
    out = []
    for v in values:
        row = {"sll_width": 19.5, "temperature": 21.0, **(extra or {})}
        row[signal] = v
        out += r.evaluate(row, printing)
    return out


def test_warning_needs_three_readings_then_critical_then_resolve():
    r = rules()
    assert feed(r, [18.3, 18.3]) == []
    d = feed(r, [18.3])
    assert [(x.action, x.severity) for x in d] == [("open", Severity.warning)]
    assert "below target (19.5 ± 1 mm)" in d[0].message and "Check Vision" in d[0].message
    d = feed(r, [17.3, 17.2])
    assert [(x.action, x.severity) for x in d] == [("upgrade", Severity.critical)]
    assert feed(r, [19.5] * 9) == []
    d = feed(r, [19.5])
    assert d[0].action == "resolve"


def test_geometry_ignored_during_interlayer_delay():
    r = rules()
    assert feed(r, [10.0] * 5, printing=False) == []


def test_sensor_lost_after_five_seconds_and_reconnect():
    r = rules()
    d = feed(r, [None] * 5, signal="temperature")
    assert [(x.kind, x.severity) for x in d] == [(AlertKind.sensor_lost, Severity.critical)]
    d = feed(r, [21.0], signal="temperature")
    assert d[0].action == "resolve" and d[0].kind == AlertKind.sensor_lost


def test_rapid_temperature_change_is_info():
    r = rules()
    d = feed(r, [21.5] * 30 + [19.8], signal="temperature")
    assert [(x.kind, x.severity) for x in d] == [(AlertKind.rapid_change, Severity.info)]
    assert "dropped 1.7 °C" in d[0].message
