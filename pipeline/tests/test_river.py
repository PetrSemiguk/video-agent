"""Checks on the committed main-stem river files (data/processed/<plate>/rivers/)."""

import json

import pytest

from vap.geo.extract import PROCESSED_DIR

PLATE = "china-east-hs05"


def _river(slug: str) -> dict:
    path = PROCESSED_DIR / PLATE / "rivers" / f"{slug}.geojson"
    coll = json.loads(path.read_text(encoding="utf-8"))
    assert len(coll["features"]) == 1
    return coll["features"][0]


@pytest.mark.parametrize("slug", ["yellow", "yangtze"])
def test_single_linestring_source_to_mouth(slug):
    f = _river(slug)
    p, coords = f["properties"], f["geometry"]["coordinates"]
    assert f["geometry"]["type"] == "LineString"
    assert p["source_elev_m"] > p["mouth_elev_m"] + 1000  # Tibetan plateau vs the coast
    assert coords[0][0] < coords[-1][0]  # source in the west, mouth in the east
    assert p["length_km"] > 3000


@pytest.mark.parametrize("slug", ["yellow", "yangtze"])
def test_cumfrac_is_monotonic_per_vertex(slug):
    f = _river(slug)
    cum = f["properties"]["cumfrac"]
    assert len(cum) == len(f["geometry"]["coordinates"])
    assert cum[0] == 0 and cum[-1] == 1
    assert all(b >= a for a, b in zip(cum, cum[1:], strict=False))
