"""Checks on the committed main-stem river files (data/processed/<plate>/rivers/)."""

import json
import math

import numpy as np
import pytest
import shapely
from shapely.geometry import Point, shape

from vap.geo import mouth
from vap.geo.extract import PROCESSED_DIR

PLATE = "china-east-hs05"


def _river(slug: str) -> dict:
    path = PROCESSED_DIR / PLATE / "rivers" / f"{slug}.geojson"
    coll = json.loads(path.read_text(encoding="utf-8"))
    assert len(coll["features"]) == 1
    return coll["features"][0]


def test_no_water_in_reach_stays_valid_json():
    assert mouth.rounded_km(math.inf) is None
    assert mouth.rounded_km(1.234) == 1.23
    assert json.dumps({"km": mouth.rounded_km(math.inf)}, allow_nan=False) == '{"km": null}'


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


@pytest.mark.parametrize("slug", ["yellow", "yangtze"])
def test_mouth_reaches_the_coast(slug):
    """The mouth must be within 5 km of the (committed, simplified) plate coastline."""
    lon, lat = _river(slug)["geometry"]["coordinates"][-1]
    coast = json.loads((PROCESSED_DIR / PLATE / "coastline.geojson").read_text(encoding="utf-8"))
    lines = shapely.union_all([shape(f["geometry"]) for f in coast["features"]])
    kx = 111.32 * math.cos(math.radians(lat))

    km = shapely.transform(
        lines, lambda c: np.column_stack([(c[:, 0] - lon) * kx, (c[:, 1] - lat) * 111.32])
    )
    assert shapely.distance(Point(0, 0), km) <= 5.0
