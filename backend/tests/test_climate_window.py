from datetime import datetime, timedelta

from app.engines.climate import detect_inversion
from app.engines.window import find_best_window
from app.schemas.air import HourlyPoint


def test_inversion_needs_all_three_conditions() -> None:
    assert detect_inversion(9, 3, 273.4).detected
    assert not detect_inversion(16, 3, 273.4).detected
    assert not detect_inversion(9, 10, 273.4).detected
    assert not detect_inversion(9, 3, 90).detected


def test_inversion_missing_reading_is_not_met() -> None:
    result = detect_inversion(None, 3, 200)
    assert not result.detected
    assert [c.met for c in result.checks] == [False, True, True]


def _series(start: datetime, values: list[float | None]) -> list[HourlyPoint]:
    return [HourlyPoint(time=start + timedelta(hours=i), pm2_5=v) for i, v in enumerate(values)]


def test_best_window_picks_cleanest_daytime_slot() -> None:
    start = datetime(2026, 11, 20, 0)
    values: list[float | None] = [200.0] * 24
    values[2] = values[3] = 10.0  # 02:00 is clean but outside activity hours
    values[15] = values[16] = 80.0
    window = find_best_window(_series(start, values), now=start)
    assert window is not None
    assert (window.start.hour, window.end.hour) == (15, 17)
    assert window.mean_pm2_5 == 80.0
    assert window.category == "Moderate"


def test_best_window_respects_end_hour_and_gaps() -> None:
    start = datetime(2026, 11, 20, 0)
    values: list[float | None] = [200.0] * 24
    values[20] = values[21] = 5.0  # would end at 22:00, too late
    values[10] = None
    points = _series(start, values)
    window = find_best_window(points, now=start)
    assert window is not None
    assert window.end.hour <= 21
    assert window.start.hour not in (9, 10)


def test_best_window_ignores_past_hours_and_handles_empty() -> None:
    start = datetime(2026, 11, 20, 0)
    values: list[float | None] = [200.0] * 24
    values[7] = values[8] = 1.0
    window = find_best_window(_series(start, values), now=start.replace(hour=12))
    assert window is not None and window.start.hour >= 12
    assert find_best_window([], now=start) is None
