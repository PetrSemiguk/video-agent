"""Step 1.7: CC BY policy, attribution, errata, Cliopatria records and the map compiler."""

import json
from types import SimpleNamespace

import pytest
import shapely
import yaml
from shapely.geometry import box, mapping, shape

from vap.geo import errata, hist, hist_attribution, hist_cliopatria, hist_compose
from vap.geo.hist import cc_by_ways, license_class, normalized_selection, spdx
from vap.geo.hist_backends import Candidate

STATE = {"admin_level": "2", "boundary": "administrative", "type": "boundary", "start_date": "1800"}


@pytest.mark.parametrize(
    "value, kind",
    [
        ("CC0-1.0", "cc0"),
        ("", "cc0"),
        ("CC-BY-4.0", "cc-by"),
        ("CC BY 4.0", "cc-by"),
        ("Creative Commons BY 4.0 International", "cc-by"),
        ("Creative Commons Attribution 4.0 International license", "cc-by"),
        ("CC-BY-SA-4.0", None),
        ("CC-BY-NC-4.0", None),
        ("CC-BY-ND-4.0", None),
        ("CC BY 3.0", None),
        ("whatever", None),
    ],
)
def test_only_cc0_and_cc_by_4_pass(value, kind):
    assert license_class({"license": value}) == kind


def way(way_id, tags, west=0.0):
    return {
        "type": "way",
        "id": way_id,
        "tags": tags,
        "geometry": [{"lon": west, "lat": 0}, {"lon": west + 1, "lat": 1}],
    }


def rel(*ids):
    return {"members": [{"type": "way", "ref": i, "role": "outer"} for i in ids]}


def test_only_cc_by_ways_inside_the_plate_need_a_credit():
    index = {
        ("way", 1): way(1, {"license": "CC BY 4.0", "source:name": "Kartverket Administrative"}),
        ("way", 2): way(2, {"license": "CC BY 4.0", "source:name": "Kartverket"}, west=50),
        ("way", 3): way(3, {"license": "CC0-1.0"}),
    }
    used = cc_by_ways(rel(1, 2, 3), index, [-5, -5, 5, 5])
    assert [row["id"] for row in used] == ["way/1"]
    assert used[0]["key"] == "kartverket"


@pytest.mark.parametrize(
    "tags, key",
    [
        ({"source:name": "IGN CNIG: Limites municipales"}, "ign"),
        ({"source": "https://centrodedescargas.cnig.es/x"}, "ign"),
        ({"source": "Administrative units from Kartverket"}, "kartverket"),
        (
            {"attribution": "Surveying and Mapping Authority of the Republic of Slovenia"},
            "slovenia",
        ),
        ({"source:geometry": "https://data.humdata.org/dataset/cod-ab-ukr"}, "hdx-ukraine"),
        ({"source:geometry": "https://data.humdata.org/dataset/cod-ab-cri"}, "hdx-costa-rica"),
        ({"source": "somewhere else"}, None),
    ],
)
def test_sources_are_recognised_from_way_tags(tags, key):
    assert hist_attribution.source_key(tags) == key


def test_every_known_source_is_recorded_in_licenses():
    text = (hist.REPO_ROOT / "docs/licenses.md").read_text(encoding="utf-8")
    for name in ("IGN CNIG", "Kartverket", "Slovenia", "cod-ab-ukr", "cod-ab-cri", "Cliopatria"):
        assert name in text


def test_slovenian_credit_has_the_form_the_publisher_requires():
    text = hist_attribution.SOURCES["slovenia"][1]
    assert text.startswith("Geodetska uprava Republike Slovenije, Evidenca državne meje, stanje")


@pytest.mark.parametrize("key", ["hdx-ukraine", "hdx-costa-rica"])
def test_hdx_credit_follows_the_source_license_not_the_ohm_tag(key):
    text = hist_attribution.SOURCES[key][1]
    assert "CC BY-IGO 3.0" in text and "by/3.0/igo/legalcode" in text
    assert "Changes:" in text and "No endorsement" in text
    assert "CC BY 4.0" not in text


def test_short_credit_adds_only_what_a_source_requires_on_the_frame():
    base = hist_attribution.OHM_CREDIT
    assert hist_attribution.short_credit(base, {"kartverket"}) == base
    assert "ign.es" in hist_attribution.short_credit(base, {"ign", "kartverket"})


def test_unknown_cc_by_source_is_flagged_for_review():
    text = hist_attribution.render("x", "credit", ["line"], [{"id": "way/1", "source": "who"}])
    assert "Needs review" in text and "way/1: who" in text


def test_spdx_takes_the_strongest_license():
    c = Candidate(1, STATE, None, "overpass")
    assert spdx(c) == "CC0-1.0"
    c.cc_by = [{"id": "way/1"}]
    assert spdx(c) == "CC-BY-4.0"
    c = Candidate(2, {**STATE, "license": "CC-BY-4.0"}, mapping(box(0, 0, 1, 1)), "overpass")
    assert normalized_selection([c], "1815-07-01")[0][0][0]["license"] == "CC-BY-4.0"


def blocker(severity="blocker"):
    return {
        "feature": "Qing",
        "problem": "too big",
        "correct": "smaller",
        "source": "https://example.org",
        "severity": severity,
    }


def story(**props):
    return {
        "plates": [{"id": "p", "name": "plate"}],
        "shots": [
            {
                "id": "one",
                "plate": "p",
                "layers": [{"type": "HistoricalLayer", "props": {"slug": "layer", **props}}],
            }
        ],
    }


def write_errata(root, entries):
    target = root / "data/processed/plate/historical"
    target.mkdir(parents=True)
    (target / "layer.errata.json").write_text(json.dumps(entries), encoding="utf-8")
    return target


def test_blocker_stops_a_shot_and_names_it(tmp_path):
    write_errata(tmp_path, [blocker()])
    issues = errata.blocking_issues(story(), tmp_path)
    assert "shot one" in issues[0] and "Qing" in issues[0]


def test_override_needs_a_real_reason(tmp_path):
    write_errata(tmp_path, [blocker()])
    assert errata.blocking_issues(story(errataOverride={"reason": "   "}), tmp_path)
    assert not errata.blocking_issues(
        story(errataOverride={"reason": "Shown as an error"}), tmp_path
    )


def test_warnings_and_missing_errata_do_not_stop(tmp_path):
    assert not errata.blocking_issues(story(), tmp_path)
    write_errata(tmp_path, [blocker("warning")])
    assert not errata.blocking_issues(story(), tmp_path)


@pytest.mark.parametrize(
    "bad",
    [
        {"feature": "x"},
        {**blocker(), "severity": "minor"},
        {**blocker(), "source": "not a url"},
    ],
)
def test_malformed_errata_is_refused(bad):
    with pytest.raises(ValueError):
        errata.validate([bad])


def test_committed_errata_are_well_formed_and_have_the_known_blockers():
    files = sorted(hist.PROCESSED_DIR.glob("*/historical/*.errata.json"))
    assert files
    for path in files:
        errata.validate(json.loads(path.read_text(encoding="utf-8")))
    root = hist.REPO_ROOT
    assert any(
        e["severity"] == "blocker" for e in errata.load(root, "china-east-hs05", "china-1644")
    )
    features = " ".join(e["feature"] for e in errata.load(root, "europe", "europe-1815"))
    assert "Bavaria" in features and "Austrian Empire" in features


def test_episode_attributions_block_is_updated_in_place(tmp_path):
    target_dir = tmp_path / "data/processed/plate/historical"
    target_dir.mkdir(parents=True)
    source = target_dir / "layer.attribution.md"
    source.write_text("# Attribution: layer\n\n- first\n", encoding="utf-8")
    episode = tmp_path / "attributions.md"
    episode.write_text("# Credits\n\nHand-written.\n", encoding="utf-8")
    hist_attribution.update_episode(episode, tmp_path, story())
    once = episode.read_text(encoding="utf-8")
    assert "Hand-written." in once and "- first" in once
    hist_attribution.update_episode(episode, tmp_path, story())
    assert episode.read_text(encoding="utf-8") == once
    source.write_text("# Attribution: layer\n\n- second\n", encoding="utf-8")
    hist_attribution.update_episode(episode, tmp_path, story())
    text = episode.read_text(encoding="utf-8")
    assert "- second" in text and "- first" not in text
    hist_attribution.update_episode(episode, tmp_path, {"shots": []})
    assert episode.read_text(encoding="utf-8") == "# Credits\n\nHand-written.\n"


def row(name, start, end, geom=None, kind="POLITY"):
    return {
        "properties": {
            "Name": name,
            "FromYear": start,
            "ToYear": end,
            "Area": 1.0,
            "Type": kind,
            "Wikidata": "Q1",
            "Wikipedia": "X",
        },
        "geometry": mapping(geom if geom is not None else box(0, 0, 1, 1)),
    }


def test_cliopatria_frame_selection_and_relation_rows():
    rows = [
        row("Old", 500, 559),
        row("Now", 555, 560),
        row("Far", 555, 560, box(50, 50, 51, 51)),
        row("Group", 555, 560, kind="RELATION"),
    ]
    selected, relations = hist_cliopatria.rows_for(rows, 560, {"bbox_lonlat": [-1, -1, 2, 2]})
    assert [r["properties"]["Name"] for r in selected] == ["Now"]
    assert relations == 1


def test_cliopatria_records_validate_including_bce_and_duplicates():
    records = hist_cliopatria.to_records(
        [row("(Chen) Dynasty", -2, -1), row("(Chen) Dynasty", 5, 9)]
    )
    props = [p for p, _ in records]
    assert props[0]["valid_from"] == "-0002-01-01" and props[0]["valid_to"] == "0001-01-01"
    assert len({p["id"] for p in props}) == 2
    assert all(p["source"] == "cliopatria" and p["license"] == "CC-BY-4.0" for p in props)
    features = [{"type": "Feature", "properties": p, "geometry": mapping(g)} for p, g in records]
    hist.validate({"type": "FeatureCollection", "features": features})


@pytest.fixture
def compose_env(tmp_path, monkeypatch):
    processed = tmp_path / "processed"
    plates = tmp_path / "plates"
    (processed / "p/historical").mkdir(parents=True)
    plates.mkdir()
    merc = shapely.transform(box(-1, -1, 9, 9), hist._to_merc)
    meta = {"bbox_3857": list(merc.bounds), "bbox_lonlat": [-1, -1, 9, 9], "pixel_size_m": 1000}
    (plates / "p.json").write_text(json.dumps(meta), encoding="utf-8")
    land = box(0, 0, 8, 8)
    monkeypatch.setattr(hist, "features", lambda *a: [SimpleNamespace(geometry=mapping(land))])
    monkeypatch.setattr(hist, "PROCESSED_DIR", processed)
    monkeypatch.setattr(hist_compose, "PROCESSED_DIR", processed)
    monkeypatch.setattr(hist_compose, "PLATES_DIR", plates)
    monkeypatch.setattr(hist, "mirror_to_public", lambda plate: None)
    monkeypatch.setattr(
        hist_compose,
        "features",
        lambda layer, scale: [
            SimpleNamespace(props={"id": "AAA"}, geometry=mapping(box(0, 0, 3, 3)))
        ],
    )
    return SimpleNamespace(root=tmp_path, processed=processed)


def state(name, *union, minus=None, **extra):
    return {
        "name_en": name,
        "valid_from": "0557",
        "valid_to": "0581",
        "sources": ["https://example.org/a"],
        "confidence": "medium",
        "geometry": {"union": list(union), **({"minus": minus} if minus else {})},
        **extra,
    }


def square(west, south, east, north):
    return {"polygon": [[west, south], [east, south], [east, north], [west, north], [west, south]]}


def compile_spec(env, *states, slug="map"):
    path = env.root / f"{slug}.yaml"
    path.write_text(yaml.safe_dump({"slug": slug, "states": list(states)}), encoding="utf-8")
    return hist_compose.compose("p", path)


def test_compose_builds_a_shared_border_and_clips_to_land(compose_env):
    report = compile_spec(
        compose_env,
        state("West", square(-1, 0, 4, 8)),
        state("East", square(4, 0, 9, 8), color="conflict"),
    )
    assert report["qa"]["coverage_valid"]
    layer = compose_env.processed / "p/historical/map.geojson"
    data = json.loads(layer.read_text(encoding="utf-8"))
    west, east = [shape(f["geometry"]) for f in data["features"]]
    assert west.bounds[0] == pytest.approx(0, abs=1e-3)
    assert east.bounds[2] == pytest.approx(8, abs=1e-3)
    assert west.intersection(east).area == pytest.approx(0, abs=1e-6)
    props = data["features"][1]["properties"]
    assert props["source"] == "custom" and props["approximate"] is True
    assert props["color_role"] == "conflict"
    assert data["attribution"] == hist_attribution.CUSTOM_CREDIT
    assert (compose_env.processed / "p/historical/map.sources.md").is_file()
    assert (compose_env.processed / "p/historical/map.attribution.md").is_file()


def test_compose_names_the_overlapping_pair(compose_env):
    with pytest.raises(hist_compose.ComposeError, match="West and East overlap"):
        compile_spec(
            compose_env, state("West", square(0, 0, 5, 8)), state("East", square(4, 0, 8, 8))
        )


def test_compose_subtraction_resolves_an_overlap(compose_env):
    cut = square(4, 0, 5, 8)
    report = compile_spec(
        compose_env,
        state("West", square(0, 0, 5, 8), minus=[cut]),
        state("East", square(4, 0, 8, 8)),
    )
    assert report["qa"]["features"] == 2


def test_compose_uses_natural_earth_and_layer_features(compose_env):
    layer = compose_env.processed / "p/historical/base.geojson"
    layer.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"id": "f1", "license": "CC-BY-4.0"},
                        "geometry": mapping(box(4, 4, 6, 6)),
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    layer.with_suffix(".report.json").write_text(
        json.dumps({"attribution": {"lines": ["Base layer credit"]}}), encoding="utf-8"
    )
    report = compile_spec(
        compose_env,
        state("Modern", {"ne_admin0": "AAA"}),
        state("Old", {"layer": "base", "feature": "f1"}),
    )
    assert report["layers_used"] == ["base"]
    assert "Base layer credit" in report["attribution"]["lines"]
    data = json.loads(
        (compose_env.processed / "p/historical/map.geojson").read_text(encoding="utf-8")
    )
    assert all(f["properties"]["license"] == "CC-BY-4.0" for f in data["features"])


@pytest.mark.parametrize(
    "bad, message",
    [
        ({"sources": []}, "sources"),
        ({"sources": ["no url"]}, "sources"),
        ({"confidence": "sure"}, "confidence"),
        ({"color": "pink"}, "color"),
        ({"geometry": {"union": []}}, "union"),
    ],
)
def test_compose_rejects_bad_states(compose_env, bad, message):
    with pytest.raises(hist_compose.ComposeError, match=message):
        compile_spec(compose_env, {**state("A", square(0, 0, 1, 1)), **bad})


@pytest.mark.parametrize(
    "part, message",
    [
        ({"ne_admin0": "ZZZ"}, "unknown Natural Earth"),
        ({"layer": "none", "feature": "x"}, "unknown layer"),
        ({"polygon": [[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]}, "invalid custom polygon"),
        ({"ne_admin0": "AAA", "polygon": []}, "exactly one kind"),
    ],
)
def test_compose_rejects_bad_parts(compose_env, part, message):
    with pytest.raises(hist_compose.ComposeError, match=message):
        compile_spec(compose_env, state("A", part))


def test_compose_rejects_a_state_without_land(compose_env):
    with pytest.raises(hist_compose.ComposeError, match="no land"):
        compile_spec(compose_env, state("Sea", square(8.5, 8.5, 9, 9)))


def test_episode_build_refuses_a_blocked_layer(tmp_path):
    from vap.episode import Builder, StageError, write_json

    (tmp_path / "episodes/ep").mkdir(parents=True)
    write_errata(tmp_path, [blocker()])
    write_json(
        tmp_path / "episodes/ep/storyboard.json",
        {**story(), "episode": {"slug": "ep"}, "audio": {"src": "a", "words": "b"}},
    )
    builder = Builder(tmp_path, "ep")
    builder.state = {"version": 1, "stages": {}}
    with pytest.raises(StageError, match="errata blockers"):
        builder.run_stage("preview")
