"""Checks on the committed data/processed/<plate>/ layers (no raw data needed)."""

import json

import pytest
import shapely
from shapely.geometry import shape

from vap.geo.extract import MARGIN, MAX_FILE_BYTES, MAX_TOTAL_BYTES, PROCESSED_DIR
from vap.geo.mercator import Extent, x_to_lon, y_to_lat
from vap.geo.paths import PLATES_DIR

PLATES = ["china-east-hs05", "europe"]


def _load(plate: str, layer: str) -> dict:
    return json.loads((PROCESSED_DIR / plate / f"{layer}.geojson").read_text(encoding="utf-8"))


def _country(plate: str, iso: str):
    feats = [f for f in _load(plate, "countries")["features"] if f["properties"]["id"] == iso]
    assert len(feats) == 1, iso
    return shape(feats[0]["geometry"])


def test_chn_mng_share_identical_border():
    chn, mng = _country("china-east-hs05", "CHN"), _country("china-east-hs05", "MNG")
    # Shared border: the boundary lines must coincide (not just touch at points).
    shared = shapely.intersection(chn.boundary, mng.boundary)
    shared_len = shapely.length(shapely.line_merge(shapely.union_all([shared])))
    assert shared_len > 35.0, f"shared border only {shared_len:.1f} deg long"
    # No gaps or overlaps: interiors are disjoint, and every MNG border vertex that lies on
    # CHN's boundary is exactly on it (identical coordinates after rounding).
    assert shapely.intersection(chn, mng).area < 1e-9
    mng_pts = shapely.get_coordinates(mng.boundary)
    on_chn = shapely.dwithin(shapely.points(mng_pts), chn.boundary, 1e-9)
    near_chn = shapely.dwithin(shapely.points(mng_pts), chn.boundary, 0.05)
    assert on_chn.sum() == near_chn.sum(), "some border vertices diverge between CHN and MNG"


@pytest.mark.parametrize("plate", PLATES)
def test_size_limits(plate):
    files = list((PROCESSED_DIR / plate).glob("*.geojson"))
    assert files
    sizes = {f.name: f.stat().st_size for f in files}
    assert all(s <= MAX_FILE_BYTES for s in sizes.values()), sizes
    assert sum(sizes.values()) <= MAX_TOTAL_BYTES


@pytest.mark.parametrize("plate", PLATES)
def test_coordinates_inside_bbox_with_margin(plate):
    meta = json.loads((PLATES_DIR / f"{plate}.json").read_text(encoding="utf-8"))
    ext = Extent(*meta["bbox_3857"], meta["width"], meta["height"])
    dx = (ext.max_x - ext.min_x) * MARGIN
    dy = (ext.max_y - ext.min_y) * MARGIN
    lon0, lon1 = x_to_lon(ext.min_x - dx), x_to_lon(ext.max_x + dx)
    lat0, lat1 = y_to_lat(ext.min_y - dy), y_to_lat(ext.max_y + dy)
    eps = 1e-3  # coordinate rounding (4 decimals) + projection round trip
    for f in (PROCESSED_DIR / plate).glob("*.geojson"):
        coll = json.loads(f.read_text(encoding="utf-8"))
        geoms = [shape(feat["geometry"]) for feat in coll["features"]]
        if not geoms:
            continue
        xy = shapely.get_coordinates(geoms)
        assert xy[:, 0].min() >= lon0 - eps and xy[:, 0].max() <= lon1 + eps, f.name
        assert xy[:, 1].min() >= lat0 - eps and xy[:, 1].max() <= lat1 + eps, f.name


@pytest.mark.parametrize("plate", PLATES)
def test_minimal_properties(plate):
    for f in (PROCESSED_DIR / plate).glob("*.geojson"):
        for feat in json.loads(f.read_text(encoding="utf-8"))["features"]:
            keys = set(feat["properties"])
            assert {"id", "name_en", "type", "scalerank"} <= keys <= {
                "id", "name_en", "type", "scalerank", "label",
            }, (f.name, keys)  # fmt: skip
