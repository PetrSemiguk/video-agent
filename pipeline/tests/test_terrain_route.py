"""Terrain masks and custom routes: the tools on small grids, then the committed pilot data."""

import json

import numpy as np
import pytest
from shapely.geometry import LineString, Point, box, shape

from vap.geo import route, terrainregion
from vap.geo.extract import PROCESSED_DIR
from vap.geo.mercator import Extent, lat_to_y, lon_to_x

PLATE = "china-east-hs05"


def grid():
    extent = Extent(lon_to_x(0), lat_to_y(0), lon_to_x(20), lat_to_y(20), 200, 200)
    return extent, box(extent.min_x, extent.min_y, extent.max_x, extent.max_y)


def bumps():
    """Two separate high areas in low ground, the eastern one larger."""
    elev = np.zeros((200, 200), dtype=np.float32)
    elev[40:160, 20:60] = 5000
    elev[40:160, 120:180] = 5000
    return elev


def test_seed_selects_its_own_connected_part():
    extent, land = grid()
    west = terrainregion.build(extent, bumps(), land, min_elev=4000, seed=(4.0, 10.0))
    east = terrainregion.build(extent, bumps(), land, min_elev=4000, seed=(15.0, 10.0))
    assert west.bounds[2] < lon_to_x(10) < east.bounds[0]


def test_without_a_seed_the_largest_part_wins():
    extent, land = grid()
    region = terrainregion.build(extent, bumps(), land, min_elev=4000)
    assert region.bounds[2] > lon_to_x(15)
    assert region.area > 0


def test_max_elev_selects_low_ground_and_seed_must_be_inside():
    extent, land = grid()
    low = terrainregion.build(extent, bumps(), land, max_elev=200, seed=(10.0, 10.0))
    assert not low.contains(Point(lon_to_x(4), lat_to_y(10)))
    with pytest.raises(ValueError, match="seed"):
        terrainregion.build(extent, bumps(), land, max_elev=200, seed=(4.0, 10.0))


def test_result_is_clipped_to_land():
    extent, _ = grid()
    half = box(extent.min_x, extent.min_y, lon_to_x(10), extent.max_y)
    region = terrainregion.build(extent, np.full((200, 200), 5000.0), half, min_elev=4000)
    assert region.bounds[2] <= lon_to_x(10) + 1


def test_smoothing_cuts_a_thin_link():
    extent, land = grid()
    elev = bumps()
    elev[99:101, 60:120] = 5000  # a two-pixel ridge joins the two areas
    joined = terrainregion.build(extent, elev, land, min_elev=4000, seed=(4.0, 10.0))
    apart = terrainregion.build(extent, elev, land, min_elev=4000, seed=(4.0, 10.0), smooth_km=120)
    assert joined.bounds[2] > lon_to_x(15)
    assert apart.bounds[2] < lon_to_x(10)


def test_bbox_limits_the_region():
    extent, land = grid()
    whole = np.full((200, 200), 5000.0)
    region = terrainregion.build(extent, whole, land, min_elev=4000, limit=(2, 2, 8, 18))
    assert region.bounds[2] <= lon_to_x(8.5)
    assert region.bounds[0] >= lon_to_x(1.5)


def test_threshold_needs_exactly_one_side():
    with pytest.raises(ValueError):
        terrainregion.threshold_mask(np.zeros((2, 2)), None, None)
    with pytest.raises(ValueError):
        terrainregion.threshold_mask(np.zeros((2, 2)), 1, 2)


SOURCES = {"s": {"url": "https://example.org", "supports": "x"}}


def spec(nodes, branch="main"):
    return {
        "slug": "t",
        "name_en": "Test",
        "era": "now",
        "sources": SOURCES,
        "simplifications": ["All straight."],
        "branches": [{"id": branch, "nodes": nodes}],
    }


def node(name, lonlat, **extra):
    return {"name": name, "lonlat": lonlat, "sources": ["s"], **extra}


def test_branch_has_monotone_cumfrac_and_node_fractions():
    feature = route.build_branch(
        spec([node("A", [0, 0]), node("B", [1, 0], label=True), node("C", [3, 0])])["branches"][0],
        {},
        {"s"},
    )
    props = feature["properties"]
    assert props["cumfrac"][0] == 0 and props["cumfrac"][-1] == 1
    assert props["cumfrac"] == sorted(props["cumfrac"])
    assert [n["fraction"] for n in props["nodes"]] == pytest.approx([0, 1 / 3, 1], abs=1e-4)
    assert props["approximate"] is True


def test_leg_can_follow_a_river_in_travel_order():
    river = LineString([(0, 0.1), (1, 0.2), (2, 0.1), (3, 0.2), (4, 0.1)])
    feature = route.build_branch(
        {"id": "m", "nodes": [node("A", [4, 0]), node("B", [0, 0], follow="r")]},
        {"r": river},
        {"s"},
    )
    lons = [c[0] for c in feature["geometry"]["coordinates"]]
    assert lons == sorted(lons, reverse=True)
    assert len(lons) > 4


def test_followed_river_too_far_away_is_an_error():
    river = LineString([(0, 5), (4, 5)])
    with pytest.raises(ValueError, match="from the followed river"):
        route.follow_river(river, [0, 0], [4, 0])


def test_node_without_a_known_source_is_an_error():
    with pytest.raises(ValueError, match="sources"):
        route.build_branch(
            {"id": "m", "nodes": [node("A", [0, 0]), {"name": "B", "lonlat": [1, 0]}]}, {}, {"s"}
        )


def load(*parts):
    return json.loads((PROCESSED_DIR / PLATE).joinpath(*parts).read_text(encoding="utf-8"))


@pytest.mark.parametrize("slug", ["grand-canal-sui", "grand-canal-yuan"])
def test_committed_routes_are_approximate_and_sourced(slug):
    layer = load("routes", f"{slug}.geojson")
    assert layer["approximate"] is True
    assert all(f["properties"]["approximate"] for f in layer["features"])
    sources = (PROCESSED_DIR / PLATE / "routes" / f"{slug}.sources.md").read_text(encoding="utf-8")
    assert "https://en.wikipedia.org/wiki/Grand_Canal_(China)" in sources
    assert "Simplified or unconfirmed" in sources
    for feature in layer["features"]:
        for item in feature["properties"]["nodes"]:
            assert item["name"] in sources


def test_sui_system_is_y_shaped_with_its_hub_at_luoyang():
    south, north = load("routes", "grand-canal-sui.geojson")["features"]
    assert south["properties"]["nodes"][-1]["name"] == "Luoyang"
    assert north["properties"]["nodes"][0]["name"] == "Luoyang"
    assert south["geometry"]["coordinates"][-1] == north["geometry"]["coordinates"][0]


def test_yuan_route_runs_hangzhou_to_beijing_through_shandong_not_luoyang():
    nodes = load("routes", "grand-canal-yuan.geojson")["features"][0]["properties"]["nodes"]
    names = [item["name"] for item in nodes]
    assert names[0] == "Hangzhou" and names[-1] == "Beijing"
    assert {"Jining", "Linqing"} <= set(names)
    assert "Luoyang" not in names


def test_masks_hold_known_places_and_exclude_others():
    plateau = shape(load("terrain", "tibetan-plateau.geojson")["features"][0]["geometry"])
    low = shape(load("terrain", "eastern-lowlands.geojson")["features"][0]["geometry"])
    assert plateau.contains(Point(91.1, 31.5))  # north of Lhasa
    assert not plateau.contains(Point(104.07, 30.67))  # Chengdu
    assert low.contains(Point(114.3, 34.8))  # Kaifeng, on the North China Plain
    assert low.contains(Point(114.3, 30.6))  # Wuhan, on the middle Yangtze
    assert not low.contains(Point(108.9, 34.3))  # Xi'an, in the Wei valley above 200 m
    yangtze = shape(load("terrain", "yangtze-lowlands.geojson")["features"][0]["geometry"])
    assert yangtze.contains(Point(114.3, 30.6))  # Wuhan
    assert not yangtze.contains(Point(114.3, 34.8))  # Kaifeng is on the other plain
    assert yangtze.bounds[3] < 33
    for name in ("tibetan-plateau", "eastern-lowlands", "yangtze-lowlands"):
        props = load("terrain", f"{name}.geojson")["features"][0]["properties"]
        assert props["approximate"] is True and props["threshold_m"] > 0
