"""Editing rhythm: statistics and warnings. It reports, and never fails a build."""

import math

import pytest

from vap.qa import rhythm

FPS = 30
Y_33 = 6378137.0 * math.log(math.tan(math.pi / 4 + math.radians(33) / 2))
ZOOM = {"wide": 4.7, "regional": 5.5, "detail": 7.0}


def build(*shots, seconds=None):
    """shots: (id, seconds, scale). A plan, storyboard and words of one sentence per shot."""
    plan_shots, frames, story, words, cursor = [], [], [], [], 0
    for index, (name, length, scale, *rest) in enumerate(shots):
        count = int(length * FPS)
        plan_shots.append(
            {"id": name, "from": cursor, "frames": count, "preset": "drift", "reason": None}
        )
        frames += [[0.0, Y_33, ZOOM[scale]] for _ in range(count)]
        layers = rest[0] if rest else [{"type": "PlaceLabel"}]
        story.append({"id": name, "layers": layers})
        text = rest[1] if len(rest) > 1 else "Sentence."
        if len(rest) > 2:
            story[-1]["transition"] = {"kind": rest[2]}
        words.append({"text": text, "start": cursor / FPS, "end": (cursor + count - 3) / FPS})
        cursor += count
        assert index >= 0
    plan = {"fps": FPS, "width": 1920, "height": 1080, "frames": frames, "shots": plan_shots}
    return plan, {"shots": story}, {"words": words}


def test_scale_from_frame_width():
    assert rhythm.scale_of(5000) == "wide"
    assert rhythm.scale_of(3000) == "regional"
    assert rhythm.scale_of(800) == "detail"
    # With a plate to compare against, wide is relative to it, not to the absolute 4,500 km.
    assert rhythm.scale_of(3000, 2700) == "wide"
    assert rhythm.scale_of(5000, 6000) == "regional"
    assert rhythm.scale_of(900, 6000) == "detail"
    y = Y_33
    assert rhythm.frame_width_km([0, y, 4.7], 1920) > rhythm.WIDE_KM
    assert rhythm.frame_width_km([0, y, 5.5], 1920) < rhythm.WIDE_KM
    assert rhythm.frame_width_km([0, y, 7.0], 1920) < rhythm.REGIONAL_KM


def crossfaded(name, seconds, scale):
    return (name, seconds, scale, [{"type": "PlaceLabel"}], "Sentence.", "crossfade")


def test_good_rhythm_has_no_warnings():
    report = rhythm.analyze(
        *build(
            crossfaded("a", 30, "wide"),
            crossfaded("b", 30, "regional"),
            crossfaded("c", 30, "detail"),
            ("d", 30, "regional"),
        )
    )
    assert report["shots_per_minute"] == 1.5
    assert report["hard_cuts_per_minute"] == 1.5
    assert report["hard_cuts_by_minute"] == [1, 2, 0]
    assert [cut["why"] for cut in report["hard_cuts"]] == [["crossfade"]] * 3
    assert report["graphic_share"] == 0
    assert report["warnings"] == []


def alternating(count, seconds, make=lambda *shot: shot):
    return [make(f"s{i}", seconds, "wide" if i % 2 else "detail") for i in range(count)]


def test_smooth_shot_changes_on_one_plate_are_not_cuts():
    report = rhythm.analyze(*build(*alternating(12, 5)))
    assert report["shots_per_minute"] > 3
    assert report["hard_cuts"] == []
    assert report["hard_cuts_per_minute"] == 0
    assert not any("cuts per minute" in w for w in report["warnings"])


def test_over_three_hard_cuts_per_minute_is_a_violation():
    report = rhythm.analyze(*build(*alternating(12, 5, crossfaded)))
    assert report["hard_cuts_per_minute"] > 3
    assert any(w.startswith("VIOLATION") for w in report["warnings"])


def test_a_change_of_plate_is_a_hard_cut():
    plan, story, words = build(("a", 30, "wide"), ("b", 30, "wide"))
    story["shots"][0]["plate"], story["shots"][1]["plate"] = "china", "europe"
    assert rhythm.analyze(plan, story, words)["hard_cuts"][0]["why"] == ["plate"]
    story["shots"][1]["plate"] = "china"
    assert rhythm.analyze(plan, story, words)["hard_cuts"] == []


def test_a_break_in_camera_motion_is_a_hard_cut_and_steady_motion_is_not():
    plan, story, words = build(("a", 30, "wide"), ("b", 30, "wide"))
    metres = rhythm.EARTH_M / (512 * 2 ** ZOOM["wide"])
    for f, pose in enumerate(plan["frames"]):
        pose[0] = f * 2 * metres
    assert rhythm.analyze(plan, story, words)["hard_cuts"] == []
    for f, pose in enumerate(plan["frames"]):
        if f >= 900:
            pose[0] += (f - 899) * 6 * metres
    assert rhythm.analyze(plan, story, words)["hard_cuts"][0]["why"][0].startswith("camera")


def test_long_episode_with_almost_no_hard_cuts_warns_softly():
    report = rhythm.analyze(*build(("a", 100, "wide"), ("b", 100, "detail")))
    assert any("at least about 1" in w for w in report["warnings"])
    assert not any(w.startswith("VIOLATION") for w in report["warnings"])


def test_three_shots_at_one_scale_warn_with_their_names():
    report = rhythm.analyze(
        *build(
            ("a", 30, "wide"), ("b", 30, "regional"), ("c", 30, "regional"), ("d", 30, "regional")
        )
    )
    assert any("b, c, d" in w for w in report["warnings"])


def test_three_graphics_in_a_row_warn():
    graphic = [{"type": "BarCompare"}]
    report = rhythm.analyze(
        *build(("a", 20, "wide", graphic), ("b", 20, "wide", graphic), ("c", 20, "wide", graphic))
    )
    assert any("a, b, c" in w for w in report["warnings"])


@pytest.mark.parametrize(
    ("layers", "kind"),
    [
        ([{"type": "BRollClip"}], "broll"),
        ([{"type": "BarCompare"}], "graphic"),
        ([{"type": "BarCompare"}, {"type": "RiverLine"}], "map"),
        ([{"type": "LowerThird"}], "map"),
        ([], "map"),
    ],
)
def test_kind_of_a_shot(layers, kind):
    assert rhythm.kind_of({"layers": layers}) == kind


def test_graphic_share_over_the_limit_warns_and_broll_counts():
    report = rhythm.analyze(*build(("a", 30, "wide", [{"type": "BRollClip"}]), ("b", 90, "detail")))
    assert report["graphic_share"] == 0.25
    assert report["seconds_by_kind"]["broll"] == 30
    assert any("graphic-only share" in w for w in report["warnings"])


def test_cut_inside_a_sentence_warns():
    report = rhythm.analyze(
        *build(
            ("a", 30, "wide", [{"type": "PlaceLabel"}], "unfinished"),
            ("b", 30, "regional"),
            ("c", 30, "detail"),
        )
    )
    assert report["warnings"] == ["shot change not at a sentence end: b"]


def sectioned():
    return build(
        ("a", 30, "wide", [{"type": "SectionTag"}]),
        ("b", 30, "regional", [{"type": "PlaceLabel"}]),
        ("c", 30, "regional", [{"type": "SectionTag"}]),
    )


def test_section_needs_a_tag_and_a_change_of_scale():
    script = "# T\n\n## One\n\nFirst.\n\n## Two\n\nSecond.\n\n## Three\n\nThird.\n"
    report = rhythm.analyze(*sectioned(), script)
    names = {s["name"]: s for s in report["sections"]}
    assert names["One"]["section_tag"] and names["One"]["scale_change"]
    assert not names["Two"]["section_tag"]
    assert names["Three"]["section_tag"] and not names["Three"]["scale_change"]
    assert 'section "Two" opens with no SectionTag' in report["warnings"]
    assert 'section "Three" opens with no change of scale' in report["warnings"]


def test_wide_is_measured_against_the_plate_the_shot_is_on():
    plan, story, words = build(("a", 30, "regional"), ("b", 30, "detail"))
    for shot in plan["shots"]:
        shot["plate"] = "small"
    # A plate whose widest safe frame is zoom 5.4: the regional shot at 5.5 is wide on it.
    plan["plates"] = {"small": {"widestSafeZoom": 5.4}}
    scales = [row["scale"] for row in rhythm.analyze(plan, story, words)["table"]]
    assert scales == ["wide", "detail"]
    plan["plates"] = {"small": {"widestSafeZoom": 4.0}}
    assert [row["scale"] for row in rhythm.analyze(plan, story, words)["table"]] == [
        "regional",
        "detail",
    ]


def test_one_scale_throughout_warns():
    same = rhythm.analyze(*build(("a", 30, "regional"), ("b", 30, "regional")))
    assert same["scale_spread"] == 1.0
    assert any("scale spread" in w for w in same["warnings"])
    varied = rhythm.analyze(*build(("a", 30, "wide"), ("b", 30, "detail")))
    assert varied["scale_spread"] >= rhythm.MIN_SCALE_SPREAD
    assert not [w for w in varied["warnings"] if "scale spread" in w]


def test_every_section_needs_a_wide_shot():
    script = "# T\n\n## One\n\nFirst.\n\n## Two\n\nSecond.\n\n## Three\n\nThird.\n"
    report = rhythm.analyze(*sectioned(), script)
    names = {s["name"]: s for s in report["sections"]}
    assert names["One"]["wide_shots"] == ["a"]
    assert names["Two"]["wide_shots"] == [] and names["Three"]["wide_shots"] == []
    assert 'section "One" has no wide shot' not in report["warnings"]
    assert 'section "Two" has no wide shot' in report["warnings"]
    assert 'section "Three" has no wide shot' in report["warnings"]


def test_a_wide_shot_later_in_the_section_counts():
    script = "# T\n\n## One\n\nFirst.\n\n## Two\n\nSecond. Third.\n"
    report = rhythm.analyze(
        *build(
            ("a", 30, "wide", [{"type": "SectionTag"}]),
            ("b", 30, "regional", [{"type": "SectionTag"}]),
            ("c", 30, "wide", [{"type": "PlaceLabel"}]),
        ),
        script,
    )
    assert {s["name"]: s["wide_shots"] for s in report["sections"]} == {
        "One": ["a"],
        "Two": ["c"],
    }
    assert not [w for w in report["warnings"] if "no wide shot" in w]


def test_pauses_are_counted_per_section_and_comments_are_not_spoken():
    sections = rhythm.script_sections(
        "<!-- ## Not a section\nsome words -->\n## A\n"
        "One two [pause 1.0] three.\n[pause 2.5]\n## B\nFour.\n"
    )
    assert [s["name"] for s in sections] == ["A", "B"]
    assert sections[0]["pauses"] == [1.0, 2.5]
    assert sections[1]["first_word"] == 3


def test_too_many_or_too_long_pauses_warn():
    script = "## A\nFirst. [pause 1.0] Then. [pause 2.5]\n"
    report = rhythm.analyze(*sectioned(), script)
    assert 'section "A" has 2 pauses' in report["warnings"]
    assert 'section "A": pause outside 0.6-1.5 s' in report["warnings"]


def test_long_script_without_sections_warns():
    plan, story, words = build(("a", 60, "wide"), ("b", 60, "detail"))
    assert any(
        "no ## sections" in w for w in rhythm.analyze(plan, story, words, "Text.")["warnings"]
    )
    assert not any("sections" in w for w in rhythm.analyze(plan, story, words)["warnings"])
