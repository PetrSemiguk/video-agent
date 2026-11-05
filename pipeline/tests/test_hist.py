"""Historical date, license, provenance, network and geometry safety checks (offline)."""

import copy
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
import shapely
from shapely.geometry import box, mapping, shape

from vap.geo import hist, hist_backends
from vap.geo.hist import (
    active,
    area_km2,
    classify_overlap,
    date_key,
    dated_states,
    find_overlaps,
    license_ok,
    normalized_selection,
    palette_indices,
    relation_geometry,
    state_exclusion,
    validate,
    way_license_exceptions,
)
from vap.geo.hist_backends import Candidate
from vap.geo.http import USER_AGENT

STATE = {"admin_level": "2", "boundary": "administrative", "type": "boundary"}
COMMITTED = sorted(Path(hist.PROCESSED_DIR).glob("*/historical/*.geojson"))


def square(way_id, west, south, east, north):
    points = [(west, south), (east, south), (east, north), (west, north), (west, south)]
    return {
        "type": "way",
        "id": way_id,
        "tags": {},
        "geometry": [{"lon": x, "lat": y} for x, y in points],
    }


def relation(*members, **tags):
    return {
        "type": "relation",
        "id": 20,
        "tags": {"name:en": "Test", "start_date": "1800", **STATE, **tags},
        "members": [{"type": "way", "ref": ref, "role": role} for ref, role in members],
    }


def index_of(*ways):
    return {("way", way["id"]): way for way in ways}


def candidate(geom=None, element_id=20, **tags):
    return Candidate(
        element_id,
        {"name": f"Test {element_id}", "start_date": "1800", **STATE, **tags},
        mapping(geom) if geom is not None else None,
        "overpass",
    )


@pytest.mark.parametrize("value", ["1644~", "1914-02-30", "0000", "1815-13", "before 1644"])
def test_ambiguous_or_invalid_dates_rejected(value):
    with pytest.raises(ValueError):
        date_key(value)


def test_bce_short_years_and_exclusive_end():
    assert date_key("-0044-03-15") < date_key("1644")
    assert date_key("899") == (899, 1, 1)
    tags = {"start_date": "1815", "end_date": "1914-07-01"}
    assert active(tags, "1815-01-01")
    assert not active(tags, "1914-07-01")
    assert not active(tags, "1814-12-31")


@pytest.mark.parametrize("license_value", ["CC-BY-SA-4.0", "CC-BY-NC-4.0", "GPL-3.0"])
def test_license_exceptions_never_pass(license_value):
    assert not license_ok({"license": license_value})
    assert license_ok({})
    assert license_ok({"license": "CC0-1.0"})


@pytest.mark.parametrize(
    "tags, excluded",
    [
        (STATE, False),
        ({"boundary": "political", "political_division": "parl_const"}, True),
        ({**STATE, "admin_level": "4"}, True),
        ({**STATE, "boundary": "disputed"}, True),
        ({**STATE, "type": "zone"}, True),
    ],
)
def test_only_states_are_kept(tags, excluded):
    assert bool(state_exclusion(tags)) is excluded


def test_dated_states_split_nonstates_and_unreadable_dates():
    rows = [
        candidate(element_id=1),
        candidate(element_id=2, boundary="political", admin_level="-"),
        candidate(element_id=3, start_date="around 1800"),
        candidate(element_id=4, start_date="1900"),
    ]
    states, not_states, bad = dated_states(rows, "1815-07-01")
    assert [c.element_id for c in states] == [1]
    assert [row["ohm_id"] for row in not_states] == [2]
    assert [row["ohm_id"] for row in bad] == [3]


def test_non_cc0_way_blocks_a_cc0_relation():
    way = square(10, 0, 0, 1, 1)
    rel = relation((10, "outer"))
    assert way_license_exceptions(rel, index_of(way)) == []
    way["tags"] = {"license": "CC-BY-SA-2.0"}
    exceptions = way_license_exceptions(rel, index_of(way))
    assert exceptions[0]["license"] == "CC-BY-SA-2.0"
    c = candidate(box(0, 0, 1, 1))
    c.license_exceptions = exceptions
    records, objects = normalized_selection([c], "1815-07-01")
    assert not records
    assert objects[0]["exclusion"] == "non-CC0 or missing ways: 1"


def test_missing_way_and_non_cc0_relation_are_reported():
    assert way_license_exceptions(relation((99, "outer")), {})[0]["reason"] == "missing way"
    records, objects = normalized_selection(
        [candidate(box(0, 0, 1, 1), license="CC-BY-4.0")], "1815-07-01"
    )
    assert not records
    assert objects[0]["exclusion"] == "non-CC0 relation: CC-BY-4.0"


def test_geometry_ignores_label_members_and_cuts_holes():
    index = index_of(square(10, 0, 0, 4, 4), square(11, 1, 1, 2, 2))
    rel = relation((10, "outer"), (11, "inner"))
    rel["members"].append({"type": "node", "ref": 5, "role": "label"})
    assert relation_geometry(rel, index).area == pytest.approx(15)


def test_geometry_accepts_two_rings_that_touch_and_an_island_in_a_hole():
    touching = index_of(square(10, 0, 0, 1, 1), square(11, 1, 0, 2, 1))
    geom = relation_geometry(relation((10, "outer"), (11, "outer")), touching)
    assert geom.area == pytest.approx(2)
    nested = index_of(square(10, 0, 0, 6, 6), square(11, 1, 1, 5, 5), square(12, 2, 2, 3, 3))
    geom = relation_geometry(relation((10, "outer"), (11, "inner"), (12, "outer")), nested)
    assert geom.area == pytest.approx(36 - 16 + 1)


def test_open_boundary_is_never_closed():
    way = square(10, 0, 0, 1, 1)
    way["geometry"].pop()
    with pytest.raises(ValueError, match="unclosed"):
        relation_geometry(relation((10, "outer")), index_of(way))


def test_nested_relation_member_is_refused():
    rel = relation()
    rel["members"] = [{"type": "relation", "ref": 3, "role": "outer"}]
    with pytest.raises(ValueError, match="nested relation"):
        relation_geometry(rel, {})


def collection_of(records):
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": p, "geometry": mapping(g)} for p, g in records
        ],
    }


def test_schema_requires_provenance_and_rejects_forbidden_data():
    records, _ = normalized_selection([candidate(box(0, 0, 1, 1))], "1815-07-01")
    collection = collection_of(records)
    validate(collection)
    for field, value in [
        ("source", "cshapes"),
        ("license", "CC-BY-NC-SA-4.0"),
        ("source_ref", "https://github.com/aourednik/historical-basemaps"),
    ]:
        invalid = copy.deepcopy(collection)
        invalid["features"][0]["properties"][field] = value
        with pytest.raises(ValueError):
            validate(invalid)
    del collection["features"][0]["properties"]["notes"]
    with pytest.raises(ValueError, match="missing fields"):
        validate(collection)


def test_geometry_absence_is_reported_not_rendered():
    records, objects = normalized_selection([candidate()], "1815-07-01")
    assert records == []
    assert objects[0]["eligible"] is False
    assert objects[0]["polygon_geometry"] is False


@pytest.mark.parametrize(
    "share, kind", [(1.0, "nesting"), (0.9, "nesting"), (0.5, "conflict"), (0.01, "sliver")]
)
def test_overlap_kinds(share, kind):
    assert classify_overlap(share) == kind


def merc_box(*bounds):
    return shapely.transform(box(*bounds), hist._to_merc)


def test_overlaps_are_listed_with_their_area_and_kind():
    geoms = [merc_box(0, 0, 4, 4), merc_box(3, 0, 7, 4), merc_box(0.5, 0.5, 1.5, 1.5)]
    props = [{"name_en": name} for name in "ABC"]
    rows = find_overlaps(props, geoms)
    kinds = {(row["a"], row["b"]): row["kind"] for row in rows}
    assert kinds == {("A", "B"): "conflict", ("A", "C"): "nesting"}
    conflict = next(row for row in rows if row["b"] == "B")
    assert conflict["area_km2"] == pytest.approx(area_km2(merc_box(3, 0, 4, 4)), abs=0.1)


def test_neighbours_get_different_palette_colors():
    geoms = [box(0, 0, 1, 1), box(1, 0, 2, 1), box(2, 0, 3, 1), box(9, 9, 10, 10)]
    colors, conflicts = palette_indices(geoms)
    assert colors[0] != colors[1] and colors[1] != colors[2]
    assert conflicts == 0


def land_stub(monkeypatch, land):
    monkeypatch.setattr(hist, "features", lambda *args: [SimpleNamespace(geometry=mapping(land))])
    merc = shapely.transform(box(-1, -1, 4, 2), hist._to_merc)
    return {"bbox_3857": list(merc.bounds), "bbox_lonlat": [-1, -1, 4, 2], "pixel_size_m": 1000}


def records_for(*geoms):
    rows = [candidate(g, element_id=i + 1) for i, g in enumerate(geoms)]
    return normalized_selection(rows, "1815-07-01")[0]


def test_land_clipping_of_a_valid_coverage_keeps_the_coast(monkeypatch):
    meta = land_stub(monkeypatch, box(0, 0, 2, 1))
    collection, qa = hist.align(records_for(box(-1, -1, 1, 2), box(1, -1, 3, 2)), meta)
    assert len(collection["features"]) == 2
    assert qa["coverage_valid"] and qa["simplify"] == "coverage_simplify"
    assert qa["coast_outside_land_km2"] < 1
    assert qa["land_covered"] == pytest.approx(1, abs=0.01)
    validate(collection)


def test_overlapping_polities_do_not_stop_extraction(monkeypatch):
    meta = land_stub(monkeypatch, box(0, 0, 3, 1))
    collection, qa = hist.align(records_for(box(-1, -1, 2, 2), box(1, -1, 4, 2)), meta)
    assert len(collection["features"]) == 2
    assert not qa["coverage_valid"] and qa["simplify"] == "per polygon"
    assert qa["overlaps"][0]["kind"] == "conflict"
    assert qa["overlap_kinds"] == {"conflict": 1}
    assert qa["coast_max_error_px"] < 2
    validate(collection)


def test_polity_entirely_at_sea_is_dropped(monkeypatch):
    meta = land_stub(monkeypatch, box(0, 0, 1, 1))
    collection, _ = hist.align(records_for(box(0, 0, 1, 1), box(2, 0, 3, 1)), meta)
    assert len(collection["features"]) == 1


@pytest.fixture
def overpass_stub(tmp_path, monkeypatch):
    """Offline Overpass: serves a scripted list of responses and records the requests."""
    monkeypatch.setattr(hist_backends, "RAW_DIR", tmp_path)
    monkeypatch.setattr(hist_backends, "_last_request", 0.0)
    sleeps = []
    monkeypatch.setattr(hist_backends.time, "sleep", sleeps.append)
    requests, replies = [], []

    def handler(request):
        requests.append(request)
        return replies.pop(0)

    def client(timeout, headers=None):
        merged = {"User-Agent": USER_AGENT, **(headers or {})}
        return httpx.Client(transport=httpx.MockTransport(handler), headers=merged)

    monkeypatch.setattr(hist_backends, "http_client", client)
    return SimpleNamespace(requests=requests, replies=replies, sleeps=sleeps)


def ok(elements=()):
    return httpx.Response(200, json={"elements": list(elements)})


def test_response_is_cached_and_repeats_never_touch_the_network(overpass_stub):
    overpass_stub.replies.append(ok([{"type": "relation", "id": 1}]))
    first = hist_backends.overpass_json("q")
    assert hist_backends.overpass_json("q") == first
    assert len(overpass_stub.requests) == 1


def test_429_and_504_retry_with_backoff_and_honor_retry_after(overpass_stub):
    overpass_stub.replies += [
        httpx.Response(429, headers={"Retry-After": "7"}),
        httpx.Response(504),
        ok(),
    ]
    assert hist_backends.overpass_json("q") == {"elements": []}
    assert len(overpass_stub.requests) == 3
    assert 7.0 in overpass_stub.sleeps
    assert hist_backends.BACKOFF_SECONDS * 2 in overpass_stub.sleeps


def test_retries_are_bounded_and_failures_are_not_cached(overpass_stub):
    overpass_stub.replies += [httpx.Response(429) for _ in range(hist_backends.MAX_ATTEMPTS)]
    with pytest.raises(httpx.HTTPStatusError):
        hist_backends.overpass_json("q")
    assert len(overpass_stub.requests) == hist_backends.MAX_ATTEMPTS
    assert not list(Path(hist_backends.RAW_DIR).rglob("*.json"))


@pytest.mark.parametrize("status", [403, 500])
def test_other_errors_fail_at_once(overpass_stub, status):
    overpass_stub.replies.append(httpx.Response(status))
    with pytest.raises(httpx.HTTPStatusError):
        hist_backends.overpass_json("q")
    assert len(overpass_stub.requests) == 1


def test_partial_response_with_a_remark_is_rejected_and_not_cached(overpass_stub):
    overpass_stub.replies.append(httpx.Response(200, json={"elements": [], "remark": "timeout"}))
    with pytest.raises(ValueError, match="incomplete"):
        hist_backends.overpass_json("q")
    assert not list(Path(hist_backends.RAW_DIR).rglob("*.json"))


def test_requests_are_paced(overpass_stub, monkeypatch):
    overpass_stub.replies += [ok(), ok()]
    clock = iter([100.0, 100.0, 100.5, 100.5])
    monkeypatch.setattr(hist_backends.time, "monotonic", lambda: next(clock))
    hist_backends.overpass_json("a")
    hist_backends.overpass_json("b")
    assert overpass_stub.sleeps == [pytest.approx(hist_backends.PAUSE_SECONDS - 0.5)]


def test_every_request_carries_the_project_user_agent_without_personal_data(overpass_stub):
    overpass_stub.replies.append(ok())
    hist_backends.overpass_json("q")
    agent = overpass_stub.requests[0].headers["user-agent"]
    assert agent == "video-agent/0.1 (+https://github.com/PetrSemiguk/video-agent)"
    assert "@" not in agent


def test_shared_client_is_the_only_way_to_build_one():
    from vap.geo.http import client

    with client() as session:
        assert session.headers["user-agent"] == USER_AGENT
    sources = Path(hist.__file__).parent.glob("*.py")
    direct = ("httpx.Client(", "httpx.stream(", "httpx.get(", "httpx.head(", "httpx.post(")
    offenders = [
        path.name
        for path in sources
        if path.name != "http.py" and any(c in path.read_text(encoding="utf-8") for c in direct)
    ]
    assert not offenders


def test_geometry_step_records_license_exceptions_and_errors(overpass_stub):
    way = square(10, 0, 0, 1, 1)
    way["tags"] = {"license": "CC-BY-SA-2.0"}
    rel = relation((10, "outer"))
    overpass_stub.replies.append(ok([rel, way]))
    c = hist_backends.with_geometry(candidate())
    assert c.license_exceptions[0]["id"] == "way/10"
    assert shape(c.geometry).area == pytest.approx(1)


@pytest.mark.parametrize("path", COMMITTED, ids=lambda p: p.stem)
def test_committed_historical_layers_pass_the_validator(path):
    collection = json.loads(path.read_text(encoding="utf-8"))
    validate(collection)
    assert collection["features"]
    for feature in collection["features"]:
        props = feature["properties"]
        assert props["source"] == "ohm"
        assert 0 <= props["palette_index"] < hist.PALETTE_SIZE
        assert shape(feature["geometry"]).buffer(0.2).covers(shapely.Point(props["label"]))
