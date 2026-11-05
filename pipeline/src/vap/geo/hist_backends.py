"""OpenHistoricalMap through Overpass: polite, retried and cached on disk.

Two steps: the tags of every political relation touching a plate (enough for a probe),
then the members of each selected relation. One request per relation, so a relation
active on several dates is fetched once.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field

import httpx
from shapely.geometry import mapping

from .http import client as http_client
from .paths import RAW_DIR

OVERPASS = "https://overpass-api.openhistoricalmap.org/api/interpreter"
MAX_BYTES = 64_000_000
PAUSE_SECONDS = 2.0
BACKOFF_SECONDS = 15.0
MAX_ATTEMPTS = 5
RETRY_STATUS = {429, 504}
REQUEST_TIMEOUT = httpx.Timeout(180.0, connect=15.0)
OVERPASS_TIMEOUT_SECONDS = 150
_last_request = 0.0


@dataclass
class Candidate:
    element_id: int
    tags: dict
    geometry: dict | None
    backend: str
    geometry_error: str | None = None
    license_exceptions: list[dict] = field(default_factory=list)


def _wait_for_turn() -> None:
    """Overpass etiquette: never two requests closer than PAUSE_SECONDS."""
    global _last_request
    remaining = _last_request + PAUSE_SECONDS - time.monotonic()
    if remaining > 0:
        time.sleep(remaining)
    _last_request = time.monotonic()


def _backoff(attempt: int, response: httpx.Response) -> float:
    retry_after = response.headers.get("retry-after", "")
    return float(retry_after) if retry_after.isdigit() else BACKOFF_SECONDS * 2**attempt


def _download(query: str) -> bytes:
    with http_client(REQUEST_TIMEOUT, headers={"Accept": "application/json"}) as session:
        for attempt in range(MAX_ATTEMPTS):
            _wait_for_turn()
            with session.stream("POST", OVERPASS, data={"data": query}) as r:
                if r.status_code in RETRY_STATUS and attempt < MAX_ATTEMPTS - 1:
                    time.sleep(_backoff(attempt, r))
                    continue
                r.raise_for_status()
                body = bytearray()
                for chunk in r.iter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise ValueError(f"Overpass response exceeds {MAX_BYTES} bytes")
                return bytes(body)
    raise AssertionError("unreachable: the last attempt returns or raises")


def overpass_json(query: str) -> dict:
    """Cached: a repeated run with the same query never touches the network."""
    key = hashlib.sha256(query.encode("utf-8")).hexdigest()
    cache = RAW_DIR / "historical" / f"overpass-{key[:20]}.json"
    if cache.is_file():
        return json.loads(cache.read_text(encoding="utf-8"))
    data = json.loads(_download(query))
    if data.get("remark"):
        raise ValueError(f"Overpass incomplete response: {data['remark']}")
    if not isinstance(data.get("elements"), list):
        raise ValueError("invalid Overpass envelope")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data), encoding="utf-8")
    return data


def political(tags: dict) -> bool:
    return tags.get("boundary") == "political" or tags.get("admin_level") == "2"


def relations_in_plate(meta: dict) -> list[Candidate]:
    w, s, e, n = meta["bbox_lonlat"]
    bbox = f"({s},{w},{n},{e})"
    query = (
        f'[out:json][timeout:{OVERPASS_TIMEOUT_SECONDS}];(relation{bbox}["admin_level"="2"];'
        f'relation{bbox}["boundary"="political"];);out tags;'
    )
    return [
        Candidate(rel["id"], rel.get("tags", {}), None, "overpass", "geometry not requested")
        for rel in overpass_json(query)["elements"]
        if rel["type"] == "relation" and political(rel.get("tags", {}))
    ]


def relations_named(pattern: str) -> list[dict]:
    """Worldwide name search at any admin level, for a polity missing from a plate list."""
    query = (
        f"[out:json][timeout:{OVERPASS_TIMEOUT_SECONDS}];"
        f'(relation["name"~{json.dumps(pattern)},i];'
        f'relation["name:en"~{json.dumps(pattern)},i];);out tags;'
    )
    return [
        {
            "ohm_id": rel["id"],
            "name": rel["tags"].get("name:en") or rel["tags"].get("name"),
            "admin_level": rel["tags"].get("admin_level"),
            "boundary": rel["tags"].get("boundary"),
            "valid_from": rel["tags"].get("start_date"),
            "valid_to": rel["tags"].get("end_date"),
        }
        for rel in overpass_json(query)["elements"]
        if rel["type"] == "relation" and rel.get("tags")
    ]


def with_geometry(candidate: Candidate) -> Candidate:
    """Fill in the assembled polygon, or the reason it cannot be assembled."""
    from .hist import relation_geometry, way_license_exceptions

    query = (
        f"[out:json][timeout:{OVERPASS_TIMEOUT_SECONDS}];relation({candidate.element_id});"
        "out body;way(r);out tags geom;"
    )
    data = overpass_json(query)
    index = {(e["type"], e["id"]): e for e in data["elements"]}
    relation = index[("relation", candidate.element_id)]
    candidate.license_exceptions = way_license_exceptions(relation, index)
    candidate.geometry, candidate.geometry_error = None, None
    try:
        candidate.geometry = mapping(relation_geometry(relation, index))
    except ValueError as exc:
        candidate.geometry_error = str(exc)
    return candidate
