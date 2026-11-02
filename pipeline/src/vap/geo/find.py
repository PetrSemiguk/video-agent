"""Find Natural Earth objects by name (case-insensitive substring on name_en and name).

uv run python -m vap.geo.find "Yellow" [--layer rivers|regions|places|countries|admin1|lakes]
    [--plate <name>]

Without --plate the whole 10m dataset is searched; with --plate only the extracted
data/processed/<plate>/ files. Ids are the same ones the extractor writes.
"""

from __future__ import annotations

import argparse
import json
import sys

from . import naturalearth as ne
from .extract import PROCESSED_DIR
from .vectors import LAYERS, normalise

SEARCHABLE = ["countries", "admin1", "rivers", "lakes", "regions", "places"]


def search_raw(query: str, layers: list[str]) -> list[dict]:
    q = query.casefold()
    hits: dict[tuple[str, str], dict] = {}
    for layer in layers:
        for stem in ne.SOURCES[layer]["10m"]:
            for i, feat in enumerate(ne.load("10m", stem)["features"]):
                raw = feat.get("properties") or {}
                names = [v for k, v in raw.items() if k.lower() in ("name", "name_en") and v]
                if not any(q in str(n).casefold() for n in names):
                    continue
                props = normalise(layer, stem, i, raw)
                geom = feat["geometry"]
                at = geom["coordinates"] if geom and geom["type"] == "Point" else None
                hits.setdefault((layer, props["id"]), {"layer": layer, **props, "at": at})
    return list(hits.values())


def search_plate(query: str, layers: list[str], plate: str) -> list[dict]:
    q = query.casefold()
    hits = []
    for layer in layers:
        path = PROCESSED_DIR / plate / f"{layer}.geojson"
        if not path.exists():
            continue
        for feat in json.loads(path.read_text(encoding="utf-8"))["features"]:
            p = feat["properties"]
            if p.get("name_en") and q in p["name_en"].casefold():
                g = feat["geometry"]
                hits.append(
                    {
                        "layer": layer,
                        **{k: p.get(k) for k in ("id", "name_en", "type", "scalerank")},
                        "at": g["coordinates"] if g["type"] == "Point" else p.get("label"),
                    }
                )
    return hits


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(
        prog="python -m vap.geo.find",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("query")
    ap.add_argument("--layer", choices=[x for x in LAYERS if x in SEARCHABLE])
    ap.add_argument("--plate", help="search only data/processed/<plate>/")
    args = ap.parse_args(argv)
    layers = [args.layer] if args.layer else SEARCHABLE
    hits = (
        search_plate(args.query, layers, args.plate)
        if args.plate
        else search_raw(args.query, layers)
    )
    hits.sort(key=lambda h: (h["layer"], h["scalerank"] if h["scalerank"] is not None else 99))
    for h in hits:
        rank = "-" if h["scalerank"] is None else h["scalerank"]
        at = h.get("at")
        where = f"  at {at[0]:.4f},{at[1]:.4f}" if at else ""
        print(
            f"{h['layer']:<10} {h['id']:<16} {h['name_en']!s:<40} {h['type']}  rank {rank}{where}"
        )
    print(f"{len(hits)} match(es)")
    return 0 if hits else 1


if __name__ == "__main__":
    sys.exit(main())
