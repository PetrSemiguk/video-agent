"""Documented OHM access: Overpass and QLever GeoSPARQL, with bounded responses.

Both adapters return Candidate objects; absence of geometry is retained for probe.
QLever member-license exceptions are queried recursively through relation/way members.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field

import httpx
import shapely
from shapely.geometry import box, mapping

from .paths import RAW_DIR

OVERPASS = "https://overpass-api.openhistoricalmap.org/api/interpreter"
QLEVER = "https://qlever.dev/api/ohm-planet"
MAX_BYTES = 32_000_000
MAX_ROWS = 2000
PREFIXES = """
PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX osm: <https://www.openstreetmap.org/>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
PREFIX osmway: <https://www.openstreetmap.org/way/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
"""


@dataclass
class Candidate:
    element_id: int
    tags: dict
    geometry: dict | None
    backend: str
    geometry_error: str | None = None
    license_exceptions: list[dict] = field(default_factory=list)


def request_json(url: str, params: dict, backend: str) -> dict:
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
    cache = RAW_DIR / "historical" / f"{backend}-{key[:20]}.json"
    if cache.is_file():
        return json.loads(cache.read_text(encoding="utf-8"))
    with httpx.stream(
        "GET",
        url,
        params=params,
        timeout=httpx.Timeout(60, connect=15),
        follow_redirects=True,
        headers={"Accept": "application/sparql-results+json, application/json"},
    ) as r:
        r.raise_for_status()
        body = bytearray()
        for chunk in r.iter_bytes():
            body.extend(chunk)
            if len(body) > MAX_BYTES:
                raise ValueError(f"{backend} response exceeds {MAX_BYTES} bytes; narrow query")
    data = json.loads(body)
    if data.get("remark") or data.get("exception"):
        raise ValueError(
            f"{backend} incomplete response: {data.get('remark', data.get('exception'))}"
        )
    if backend == "overpass" and not isinstance(data.get("elements"), list):
        raise ValueError("invalid Overpass envelope")
    if backend == "qlever" and not isinstance(data.get("results", {}).get("bindings"), list):
        raise ValueError("invalid SPARQL result envelope")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data), encoding="utf-8")
    return data


def political(tags: dict) -> bool:
    return tags.get("boundary") == "political" or (
        tags.get("admin_level") == "2"
        and tags.get("boundary", "administrative") == "administrative"
    )


def overpass(meta: dict) -> list[Candidate]:
    # Import inside the adapter to share the existing tested assembly implementation.
    from .hist import license_ok, relation_geometry

    w, s, e, n = meta["bbox_lonlat"]
    bbox = f"({s},{w},{n},{e})"
    q = (
        f'[out:json][timeout:45];(relation{bbox}["boundary"="administrative"]'
        f'["admin_level"="2"];relation{bbox}["boundary"="political"];);'
        "(._;>>;);out body geom;"
    )
    data = request_json(OVERPASS, {"data": q}, "overpass")
    index = {(e["type"], e["id"]): e for e in data["elements"]}
    out = []
    for rel in data["elements"]:
        tags = rel.get("tags", {})
        if rel["type"] != "relation" or not political(tags):
            continue
        geom, error = None, None
        try:
            geom = mapping(relation_geometry(rel, index))
        except ValueError as exc:
            error = str(exc)
        exceptions, seen = [], set()

        def visit(kind, eid, seen=seen, exceptions=exceptions):
            key = kind, eid
            if key in seen:
                return
            seen.add(key)
            item = index.get(key)
            if item is None:
                exceptions.append(
                    {"id": f"{kind}/{eid}", "license": None, "reason": "missing member metadata"}
                )
                return
            if not license_ok(item.get("tags", {})):
                exceptions.append({"id": f"{kind}/{eid}", "license": item["tags"]["license"]})
            for m in item.get("members", []):
                if m.get("role") not in {"label", "admin_centre"}:
                    visit(m["type"], m["ref"])
            for node in item.get("nodes", []):
                visit("node", node)

        visit("relation", rel["id"])
        out.append(Candidate(rel["id"], tags, geom, "overpass", error, exceptions))
    return out


def qlever_query(meta: dict) -> str:
    bbox_wkt = box(*meta["bbox_lonlat"]).wkt
    # OPTIONAL keeps relations without a polygon visible in diagnostics. Such
    # relations cannot be spatially certified and must not enter extraction.
    return (
        PREFIXES
        + """
SELECT DISTINCT ?relation ?name ?name_en ?start_date ?end_date ?license ?geometry
WHERE {
  ?relation a osm:relation .
  { ?relation osmkey:boundary "administrative" ; osmkey:admin_level "2" . }
  UNION { ?relation osmkey:boundary "political" . }
  OPTIONAL { ?relation osmkey:name ?name . }
  OPTIONAL { ?relation <https://www.openstreetmap.org/wiki/Key:name:en> ?name_en . }
  OPTIONAL { ?relation osmkey:start_date ?start_date . }
  OPTIONAL { ?relation osmkey:end_date ?end_date . }
  OPTIONAL { ?relation osmkey:license ?license . }
  OPTIONAL { ?relation geo:hasGeometry/geo:asWKT ?geometry . }
  FILTER(!BOUND(?geometry) || geof:sfIntersects(?geometry, """
        + json.dumps(bbox_wkt)
        + f"""^^geo:wktLiteral))
}} ORDER BY ?relation LIMIT {MAX_ROWS + 1}
"""
    )


def parse_wkt(value: str):
    # GeoSPARQL defaults to CRS84 lon/lat. Reject other CRS rather than swapping axes.
    if value.startswith("<"):
        crs, value = value.split(">", 1)
        if crs[1:] != "http://www.opengis.net/def/crs/OGC/1.3/CRS84":
            raise ValueError(f"unsupported WKT CRS: {crs[1:]}")
    g = shapely.from_wkt(value.strip())
    if g.geom_type not in {"Polygon", "MultiPolygon"} or g.is_empty or not g.is_valid:
        raise ValueError("WKT is not a complete valid polygon")
    if not box(-180, -90, 180, 90).covers(g):
        raise ValueError("WKT outside lon/lat bounds")
    return mapping(g)


def qlever(meta: dict) -> list[Candidate]:
    from .hist import license_ok

    rows = request_json(QLEVER, {"query": qlever_query(meta)}, "qlever")["results"]["bindings"]
    if len(rows) > MAX_ROWS:
        raise ValueError("QLever result truncated: narrow query before extraction")
    out = []
    for row in rows:

        def value(k, row=row):
            return row.get(k, {}).get("value")

        uri = value("relation") or ""
        match = re.fullmatch(r"https://www.openhistoricalmap.org/relation/(\d+)", uri)
        if not match:
            raise ValueError(f"unexpected OHM relation URI: {uri}")
        tags = {
            k: value(k)
            for k in ("name", "start_date", "end_date", "license")
            if value(k) is not None
        }
        if value("name_en"):
            tags["name:en"] = value("name_en")
        geometry, error = None, None
        try:
            if not value("geometry"):
                raise ValueError("no WKT; spatial intersection unknown")
            geometry = parse_wkt(value("geometry"))
        except (ValueError, shapely.errors.GEOSException) as exc:
            error = str(exc)
        # Check all explicit license exceptions, including nested relations and ways.
        # rdf:first/rest are not used: osm2rdf documents member/member_id and way:node.
        check = (
            PREFIXES
            + f"""
SELECT DISTINCT ?member ?license ?audit_error WHERE {{
  {{ <{uri}> (osmrel:member/osmrel:member_id|osmway:node/osmway:node)* ?member .
     ?member osmkey:license ?license . }}
  UNION {{ <{uri}> (osmrel:member/osmrel:member_id)* ?member .
    ?member a osm:way .
    FILTER NOT EXISTS {{ ?member osmway:node/osmway:node ?node . }}
    BIND("way-node membership unavailable" AS ?audit_error) }}
  UNION {{ BIND(<{uri}> AS ?member)
    FILTER NOT EXISTS {{ <{uri}> osmrel:member/osmrel:member_id ?child . }}
    BIND("relation membership unavailable" AS ?audit_error) }}
}} LIMIT {MAX_ROWS + 1}
"""
        )
        licenses = request_json(QLEVER, {"query": check}, "qlever")["results"]["bindings"]
        if len(licenses) > MAX_ROWS:
            raise ValueError("member license audit truncated")
        exceptions = []
        for r in licenses:
            license_value = r.get("license", {}).get("value")
            audit_error = r.get("audit_error", {}).get("value")
            if audit_error or not license_ok({"license": license_value or ""}):
                exceptions.append(
                    {
                        "id": r["member"]["value"],
                        "license": license_value,
                        "reason": audit_error or "explicit license exception",
                    }
                )
        out.append(Candidate(int(match[1]), tags, geometry, "qlever", error, exceptions))
    return out


def fetch(meta: dict, backend: str = "auto") -> tuple[list[Candidate] | None, list[dict]]:
    attempts = []
    for name in ["overpass", "qlever"] if backend == "auto" else [backend]:
        try:
            candidates = {"overpass": overpass, "qlever": qlever}[name](meta)
            attempts.append({"backend": name, "status": "ok", "count": len(candidates)})
            return candidates, attempts
        except (httpx.HTTPError, ValueError, shapely.errors.GEOSException) as exc:
            attempts.append({"backend": name, "status": "error", "error": str(exc)})
    return None, attempts
