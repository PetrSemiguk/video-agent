"""Cliopatria (Seshat) as a historical source: one pinned release, frame by frame.

The data comes in frames: a row is valid for a span of whole years between two source images,
so a name or border can lag a real event by years. `--frame-year` selects another frame on
purpose; the report always names the frame used. Only POLITY rows are used: RELATION rows
group polities and would overlap them.
"""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from collections import Counter

import shapely
from shapely.geometry import box, shape

from . import hist_attribution
from .extract import _clean_polygonal
from .hist import EVIDENCE, align, save_layer
from .http import client as http_client
from .paths import RAW_DIR

VERSION = hist_attribution.CLIOPATRIA_VERSION
URL = (
    "https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/"
    f"{VERSION}/cliopatria.geojson.zip"
)
SHA256 = "e10a4e429fca708788ff9e7572a95fce801fae55852d217cffabc1c59cd4eed4"
ARCHIVE = RAW_DIR / "cliopatria" / f"cliopatria-{VERSION}.geojson.zip"
REPOSITORY = "https://github.com/Seshat-Global-History-Databank/cliopatria"


def load_rows() -> list[dict]:
    """The pinned release: downloaded once, and refused if its content ever differs."""
    if not ARCHIVE.is_file():
        ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
        with http_client(300) as session:
            response = session.get(URL)
            response.raise_for_status()
        ARCHIVE.write_bytes(response.content)
    if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != SHA256:
        raise ValueError(f"Cliopatria archive differs from {VERSION}: {ARCHIVE}")
    with zipfile.ZipFile(ARCHIVE) as archive:
        with archive.open(archive.namelist()[0]) as stream:
            return json.load(stream)["features"]


def year_of(date: str) -> int:
    return int(re.match(r"-?\d+", date)[0])


def next_year(year: int) -> int:
    """Exclusive end of an inclusive year; there is no year zero."""
    return 1 if year == -1 else year + 1


def iso_year(year: int) -> str:
    return f"{'-' if year < 0 else ''}{abs(year):04d}-01-01"


def rows_for(rows: list[dict], frame: int, meta: dict) -> tuple[list[dict], int]:
    """Polities of a frame touching the plate, and how many RELATION rows were left out."""
    frame_box = box(*meta["bbox_lonlat"])
    selected, relations = [], 0
    for row in rows:
        p = row["properties"]
        if not p["FromYear"] <= frame <= p["ToYear"] or not row.get("geometry"):
            continue
        if not shape(row["geometry"]).intersects(frame_box):
            continue
        if p["Type"] == "POLITY":
            selected.append(row)
        else:
            relations += 1
    return selected, relations


def to_records(rows: list[dict]) -> list[tuple[dict, object]]:
    seen: Counter = Counter()
    records = []
    for row in rows:
        p = row["properties"]
        slug = re.sub(r"[^a-z0-9]+", "-", p["Name"].casefold()).strip("-") or "unnamed"
        seen[slug] += 1
        suffix = f"-{seen[slug]}" if seen[slug] > 1 else ""
        props = {
            "id": f"cliopatria-{slug}{suffix}-{p['FromYear']}",
            "name_en": p["Name"],
            "valid_from": iso_year(p["FromYear"]),
            "valid_to": iso_year(next_year(p["ToYear"])),
            "source": "cliopatria",
            "source_ref": f"{REPOSITORY}/tree/{VERSION}",
            "license": "CC-BY-4.0",
            "wikidata": p.get("Wikidata") or None,
            "wikipedia": p.get("Wikipedia") or None,
            "confidence": "low",
            "approximate": True,
            "notes": f"Cliopatria {VERSION} frame {p['FromYear']}..{p['ToYear']}; "
            "whole years; hand-drawn; no border uncertainty encoded.",
        }
        records.append((props, _clean_polygonal(shapely.make_valid(shape(row["geometry"])))))
    return records


def run(command, plate_name, plate, meta, date, slug, frame_year) -> int:

    year = year_of(date)
    frame = frame_year if frame_year is not None else year
    rows, relations = rows_for(load_rows(), frame, meta)
    report = {
        "plate": plate_name,
        "resolved_plate": plate,
        "date": date,
        "source": "cliopatria",
        "version": VERSION,
        "frame_year": frame,
        "states": [
            {
                "name": row["properties"]["Name"],
                "valid_from": row["properties"]["FromYear"],
                "valid_to": row["properties"]["ToYear"],
                "area_km2": round(row["properties"]["Area"]),
            }
            for row in sorted(rows, key=lambda r: -r["properties"]["Area"])
        ],
        "relation_rows_left_out": relations,
    }
    if command == "probe":
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        target = EVIDENCE / f"probe-cliopatria-{plate_name}-{date}.json"
        target.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0
    if not rows:
        raise ValueError("no Cliopatria polity on this plate in this frame")
    collection, qa = align(to_records(rows), meta)
    credit = hist_attribution.CLIOPATRIA_CREDIT
    lines = [hist_attribution.CLIOPATRIA_TEXT]
    report |= {"slug": slug, "qa": qa, "attribution": {"credit": credit, "lines": lines}}
    text = save_layer(collection, report, plate, slug, credit, lines)
    summary = {k: v for k, v in report.items() if k != "states"}
    print(json.dumps(summary | {"bytes": len(text.encode("utf-8"))}, indent=2, ensure_ascii=False))
    return 0
