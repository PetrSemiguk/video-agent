"""Historical date, license, provenance and geometry safety checks (offline)."""

import copy

import pytest
from shapely.geometry import box, mapping

from vap.geo.hist import (
    active,
    date_key,
    license_ok,
    normalized_selection,
    relation_geometry,
    select,
    validate,
)
from vap.geo.hist_backends import Candidate, fetch, parse_wkt, qlever


@pytest.mark.parametrize("value", ["1644~", "1914-02-30", "0000", "1815-13", "before 1644"])
def test_ambiguous_or_invalid_dates_rejected(value):
    with pytest.raises(ValueError):
        date_key(value)


def test_bce_and_exclusive_end():
    assert date_key("-0044-03-15") < date_key("1644")
    tags = {"start_date": "1815", "end_date": "1914-07-01"}
    assert active(tags, "1815-01-01")
    assert not active(tags, "1914-07-01")
    assert not active(tags, "1814-12-31")


@pytest.mark.parametrize("license_value", ["CC-BY-SA-4.0", "CC-BY-NC-4.0", "GPL-3.0"])
def test_license_exceptions_never_pass(license_value):
    assert not license_ok({"license": license_value})
    assert license_ok({})
    assert license_ok({"license": "CC0-1.0"})


def fixture_data():
    points = [(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]
    nodes = [{"type": "node", "id": i, "tags": {}} for i in range(4)]
    way = {
        "type": "way",
        "id": 10,
        "nodes": [0, 1, 2, 3, 0],
        "geometry": [{"lon": x, "lat": y} for x, y in points],
    }
    rel = {
        "type": "relation",
        "id": 20,
        "tags": {"name:en": "Test", "admin_level": "2", "start_date": "1800"},
        "members": [{"type": "way", "ref": 10, "role": "outer"}],
    }
    return {"elements": [rel, way, *nodes]}


def test_member_license_blocks_parent_with_default_cc0():
    data = fixture_data()
    assert len(select(data, "1815")[0]) == 1
    data["elements"][-1]["tags"] = {"license": "CC-BY-SA-2.0"}
    records, skipped = select(data, "1815")
    assert not records
    assert "non-CC0 node" in skipped[0]["reason"]


def test_incomplete_boundary_is_not_automatically_closed():
    data = fixture_data()
    data["elements"][1]["geometry"].pop()
    index = {(e["type"], e["id"]): e for e in data["elements"]}
    with pytest.raises(ValueError, match="unclosed"):
        relation_geometry(data["elements"][0], index)


def test_schema_requires_provenance_and_rejects_forbidden_data():
    records, _ = select(fixture_data(), "1815")
    collection = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": records[0][0], "geometry": mapping(box(0, 0, 1, 1))}
        ],
    }
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


def test_fallback_keeps_network_failure_distinct_from_empty_success(monkeypatch):
    import httpx

    from vap.geo import hist_backends as b

    def denied(meta):
        raise httpx.ConnectTimeout("offline")

    monkeypatch.setattr(b, "overpass", denied)
    monkeypatch.setattr(b, "qlever", lambda meta: [])
    rows, attempts = fetch({})
    assert rows == []
    assert [a["status"] for a in attempts] == ["error", "ok"]
    monkeypatch.setattr(b, "qlever", denied)
    rows, attempts = fetch({})
    assert rows is None
    assert len(attempts) == 2


@pytest.mark.parametrize(
    "wkt",
    [
        "POINT(1 2)",
        "POLYGON EMPTY",
        "<http://www.opengis.net/def/crs/EPSG/0/3857> POLYGON((0 0,1 0,1 1,0 0))",
        "POLYGON((0 0,200 0,1 1,0 0))",
    ],
)
def test_wkt_rejects_nonpolygon_unknown_crs_and_bad_coordinates(wkt):
    with pytest.raises(ValueError):
        parse_wkt(wkt)


def test_qlever_wkt_and_member_exception_share_normalized_policy(monkeypatch):
    from vap.geo import hist_backends as b

    def answer(url, params, backend):
        if "?audit_error" in params["query"]:
            return {
                "results": {
                    "bindings": [
                        {
                            "member": {"value": "https://www.openhistoricalmap.org/way/10"},
                            "license": {"value": "CC-BY-SA-4.0"},
                        }
                    ]
                }
            }
        return {
            "results": {
                "bindings": [
                    {
                        k: {"value": v}
                        for k, v in {
                            "relation": "https://www.openhistoricalmap.org/relation/20",
                            "name": "Test",
                            "start_date": "1800",
                            "end_date": "1900",
                            "geometry": "POLYGON((0 0,1 0,1 1,0 0))",
                        }.items()
                    }
                ]
            }
        }

    monkeypatch.setattr(b, "request_json", answer)
    candidates = qlever({"bbox_lonlat": [0, 0, 2, 2]})
    records, objects = normalized_selection(candidates, "1815")
    assert not records
    assert objects[0]["polygon_geometry"]
    assert objects[0]["ohm_id"] == 20
    assert objects[0]["license_exceptions"][0]["license"] == "CC-BY-SA-4.0"


def test_normalized_policy_preserves_default_license_and_dates():
    c = Candidate(
        20,
        {"name": "Test", "start_date": "1800", "end_date": "1900"},
        mapping(box(0, 0, 1, 1)),
        "qlever",
    )
    records, objects = normalized_selection([c], "1815")
    validate(
        {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": records[0][0], "geometry": mapping(records[0][1])}
            ],
        }
    )
    assert records[0][0]["license_raw"] is None
    assert objects[0]["effective_license"] == "CC0-1.0"
    assert not normalized_selection([c], "1900")[0]


def test_geometry_absence_is_reported_not_rendered():
    c = Candidate(20, {"name": "Test", "start_date": "1800"}, None, "qlever")
    records, objects = normalized_selection([c], "1815")
    assert records == []
    assert objects[0]["eligible"] is False
    assert objects[0]["polygon_geometry"] is False


def test_land_clipping_with_two_polygon_coverage_keeps_coast(monkeypatch):
    from types import SimpleNamespace

    import shapely

    from vap.geo import hist

    land = box(0, 0, 2, 1)
    monkeypatch.setattr(hist, "features", lambda *args: [SimpleNamespace(geometry=mapping(land))])
    merc = shapely.transform(box(-1, -1, 3, 2), hist._to_merc)
    records = []
    for i, geom in enumerate([box(-1, -1, 1, 2), box(1, -1, 3, 2)]):
        c = Candidate(i + 1, {"name": f"Test {i}", "start_date": "1800"}, mapping(geom), "qlever")
        records.extend(normalized_selection([c], "1815")[0])
    collection, qa = hist.align(
        records,
        {"bbox_3857": list(merc.bounds), "bbox_lonlat": [-1, -1, 3, 2], "pixel_size_m": 1000},
    )
    assert len(collection["features"]) == 2
    assert qa["coast_outside_land_m2"] < 1
    hist.validate(collection)
