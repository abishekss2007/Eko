import pytest

from app.engines.aqi import averaged, category_for, compute_naqi, sub_index


@pytest.mark.parametrize(
    ("pollutant", "concentration", "expected"),
    [
        ("pm2_5", 0, 0),
        ("pm2_5", 30, 50),
        ("pm2_5", 45, 75),
        ("pm2_5", 90, 200),
        ("pm2_5", 120, 300),
        ("pm2_5", 250, 400),
        ("pm2_5", 273.4, 418),
        ("pm2_5", 380, 500),
        ("pm2_5", 900, 500),
        ("pm10", 100, 100),
        ("pm10", 300, 250),
        ("no2", 80, 100),
        ("no2", 230, 250),
    ],
)
def test_sub_index_matches_cpcb_breakpoints(pollutant: str, concentration: float, expected: int) -> None:
    assert sub_index(pollutant, concentration) == expected  # type: ignore[arg-type]


def test_sub_index_rejects_negative() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        sub_index("pm2_5", -1)


@pytest.mark.parametrize(
    ("index", "name"),
    [(0, "Good"), (50, "Good"), (51, "Satisfactory"), (200, "Moderate"), (301, "Very Poor"), (418, "Severe")],
)
def test_category_boundaries(index: int, name: str) -> None:
    assert category_for(index).name == name


def test_averaged_uses_24h_mean_when_enough_hours() -> None:
    assert averaged([100.0] * 12 + [200.0] * 12) == (150.0, True)


def test_averaged_falls_back_to_latest_when_too_few_hours() -> None:
    assert averaged([None] * 20 + [80.0, 90.0]) == (90.0, False)
    assert averaged([None, None]) == (None, False)


def test_naqi_is_highest_sub_index() -> None:
    result = compute_naqi({"pm2_5": [273.4] * 24, "pm10": [100.0] * 24, "no2": [40.0] * 24})
    assert result is not None
    assert result.value == 418
    assert result.category == "Severe"
    assert result.dominant_pollutant == "pm2_5"
    assert result.is_24h_average


def test_naqi_requires_particulates() -> None:
    assert compute_naqi({"no2": [40.0] * 24}) is None
