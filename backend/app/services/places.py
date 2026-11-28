"""Place search helpers: parse a query, normalise two geocoders' answers, merge them.

Open-Meteo (GeoNames) is strong on cities, towns and villages but matches a bare name only.
Photon (OpenStreetMap) adds neighbourhoods, landmarks, streets and campuses, so between them
a user can find almost any place on Earth. These functions are pure, so they are easy to test.
"""

from math import cos, radians
from typing import Any

from app.schemas.air import GeocodeResult

MAX_RESULTS = 10
# Two results closer than this (in km) with the same name are treated as the same place.
_DUPLICATE_KM = 3.0
_KM_PER_DEGREE = 111.0


def split_query(query: str) -> tuple[str, list[str]]:
    """'Andheri West, Mumbai' -> ('Andheri West', ['mumbai']).

    Open-Meteo finds nothing for a comma-qualified query, so it gets the head only and the
    qualifiers are used to rank its results.
    """
    head, *rest = (part.strip() for part in query.split(","))
    return head or " ".join(query.replace(",", " ").split()), [q.casefold() for q in rest if q]


def _text(value: Any) -> str | None:
    return (value.strip()[:80] or None) if isinstance(value, str) else None


def _coords_ok(lat: Any, lon: Any) -> bool:
    return (
        isinstance(lat, int | float)
        and isinstance(lon, int | float)
        and not isinstance(lat, bool)
        and -90 <= lat <= 90
        and -180 <= lon <= 180
    )


def from_open_meteo(data: dict[str, Any]) -> list[GeocodeResult]:
    """Open-Meteo (GeoNames) results."""
    results: list[GeocodeResult] = []
    for item in data.get("results") or []:
        if not isinstance(item, dict) or not _coords_ok(item.get("latitude"), item.get("longitude")):
            continue
        name = _text(item.get("name"))
        if name is None:
            continue
        admin2 = _text(item.get("admin2"))
        results.append(
            GeocodeResult(
                name=name,
                area=admin2 if admin2 and admin2 != name else None,
                admin1=_text(item.get("admin1")),
                country=_text(item.get("country")),
                latitude=item["latitude"],
                longitude=item["longitude"],
            )
        )
    return results


def partition(results: list[GeocodeResult], qualifiers: list[str]) -> tuple[list[GeocodeResult], list[GeocodeResult]]:
    """Split into (matches every qualifier, the rest), each keeping its order."""
    hits: list[GeocodeResult] = []
    rest: list[GeocodeResult] = []
    for result in results:
        haystack = " ".join(filter(None, (result.area, result.admin1, result.country))).casefold()
        (hits if all(q in haystack for q in qualifiers) else rest).append(result)
    return hits, rest


def from_photon(data: dict[str, Any]) -> list[GeocodeResult]:
    """Photon GeoJSON features (coordinates are [lon, lat])."""
    results: list[GeocodeResult] = []
    for feature in data.get("features") or []:
        if not isinstance(feature, dict):
            continue
        coords = (feature.get("geometry") or {}).get("coordinates")
        props = feature.get("properties") or {}
        if not isinstance(coords, list) or len(coords) < 2 or not isinstance(props, dict):
            continue
        lon, lat = coords[0], coords[1]
        if not _coords_ok(lat, lon):
            continue
        name = _text(props.get("name")) or _text(props.get("street")) or _text(props.get("city"))
        if name is None:
            continue
        area = _text(props.get("city")) or _text(props.get("district")) or _text(props.get("county"))
        results.append(
            GeocodeResult(
                name=name,
                area=area if area and area != name else None,
                admin1=_text(props.get("state")),
                country=_text(props.get("country")),
                latitude=lat,
                longitude=lon,
            )
        )
    return results


def _distance_km(a: GeocodeResult, b: GeocodeResult) -> float:
    """Equirectangular approximation: plenty for a few-km duplicate check."""
    dy = (a.latitude - b.latitude) * _KM_PER_DEGREE
    dx = (a.longitude - b.longitude) * _KM_PER_DEGREE * cos(radians((a.latitude + b.latitude) / 2))
    return float((dx * dx + dy * dy) ** 0.5)


def merge(*groups: list[GeocodeResult], limit: int = MAX_RESULTS) -> list[GeocodeResult]:
    """Concatenate in priority order, dropping the same place reported twice."""
    merged: list[GeocodeResult] = []
    for result in (r for group in groups for r in group):
        if any(r.name.casefold() == result.name.casefold() and _distance_km(r, result) < _DUPLICATE_KM for r in merged):
            continue
        merged.append(result)
        if len(merged) == limit:
            break
    return merged
