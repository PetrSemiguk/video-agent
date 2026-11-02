"""Normalised Natural Earth features: one schema for the extractor and the name search.

Every feature becomes (props, geometry) with props = {id, name_en, type, scalerank}.
Ids: countries -> ISO_A3 (ADM0_A3 where ISO_A3 is -99, e.g. France, Norway);
rivers_lake_centerlines -> "rivernum-<n>" (that layer has no ne_id; all pieces of one river
share it); everything else -> "ne-<ne_id>".
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import NamedTuple

from . import naturalearth as ne

# Output layers produced by vap.geo.extract, in drawing order.
LAYERS = ["land", "ocean", "countries", "admin1", "coastline", "lakes", "rivers", "regions",
          "places"]  # fmt: skip
# admin1 is opt-in (extract --admin1-countries): dense and only needed for countries in focus.
DEFAULT_LAYERS = ["countries", "rivers", "lakes", "regions", "places", "coastline"]
POLYGON_LAYERS = {"land", "ocean", "countries", "admin1", "lakes"}
COVERAGE_LAYERS = {"countries", "admin1"}  # simplified as a coverage: shared edges stay shared
RANKED_LAYERS = {"rivers", "lakes", "regions", "places"}


def _num(value) -> int | None:
    try:
        return None if value is None else int(float(value))
    except (TypeError, ValueError):
        return None


def normalise(layer: str, stem: str, index: int, raw: dict) -> dict:
    p = {k.lower(): v for k, v in raw.items()}
    if layer == "countries":
        fid = p.get("iso_a3") if p.get("iso_a3") not in (None, "-99") else p.get("adm0_a3")
    elif stem == "rivers_lake_centerlines" and _num(p.get("rivernum")) is not None:
        fid = f"rivernum-{_num(p.get('rivernum'))}"
    elif p.get("ne_id"):
        fid = f"ne-{int(p['ne_id'])}"
    else:
        fid = f"{stem}-{index}"
    return {
        "id": fid,
        "name_en": p.get("name_en") or p.get("name") or None,
        "type": p.get("featurecla") or layer,
        "scalerank": _num(p.get("scalerank")),
    }


class Source(NamedTuple):
    props: dict  # normalised: id, name_en, type, scalerank
    geometry: dict  # GeoJSON geometry
    raw: dict  # original properties, keys lower-cased
    stem: str  # Natural Earth source layer, e.g. "geography_marine_polys"


def features(layer: str, scale: str) -> Iterator[Source]:
    """Yield every source feature of an output layer at a scale."""
    for stem in ne.SOURCES[layer][scale]:
        data = ne.load(scale, stem)
        for i, feat in enumerate(data["features"]):
            if feat.get("geometry"):
                raw = feat.get("properties") or {}
                yield Source(
                    normalise(layer, stem, i, raw),
                    feat["geometry"],
                    {k.lower(): v for k, v in raw.items()},
                    stem,
                )
