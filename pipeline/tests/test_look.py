import numpy as np

from vap.geo.look import apply_grade, load_grades, load_plate_look


def test_land_midtones_lift_without_lifting_water():
    """The step 2.1 lift, pinned to the grade it was measured on (v2)."""
    grades = load_grades()
    rgb = np.full((16, 16, 3), 0.3, dtype=np.float32)
    land = np.ones((16, 16), dtype=np.float32)
    before = apply_grade(rgb, grades["dark_v1"], land)
    after = apply_grade(rgb, grades["dark_v2"], land)
    np.testing.assert_allclose(after / before, 1.125, atol=1e-6)
    rgb[:] = [0.03, 0.08, 0.18]
    sea = np.zeros((16, 16), dtype=np.float32)
    for name in ("dark_v2", "dark"):
        np.testing.assert_array_equal(
            apply_grade(rgb, grades["dark_v1"], sea),
            apply_grade(rgb, grades[name], sea),
        )


def test_v3_darkens_vegetation_and_rolls_the_desert_off_harder():
    """A dry country's cultivated ground must read as a dark ribbon, not blend into the sand."""
    grades = load_grades()
    for grade in grades.values():
        grade["vignette"]["strength"] = 0
    land = np.ones((8, 8), dtype=np.float32)
    green = np.full((8, 8, 3), [0.12, 0.26, 0.10], dtype=np.float32)
    sand = np.full((8, 8, 3), [0.62, 0.56, 0.45], dtype=np.float32)
    luma = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    v2_green = apply_grade(green.copy(), grades["dark_v2"], land) @ luma
    v3_green = apply_grade(green.copy(), grades["dark"], land) @ luma
    v2_sand = apply_grade(sand.copy(), grades["dark_v2"], land) @ luma
    v3_sand = apply_grade(sand.copy(), grades["dark"], land) @ luma
    assert (v3_green < v2_green).all(), "vegetation must darken"
    assert (v3_sand < v2_sand).all(), "bright sand must roll off"
    # The point is separation: the gap between sand and vegetation has to widen.
    assert (v3_sand - v3_green).mean() > (v2_sand - v2_green).mean()
    # Grey ground carries no vegetation term at all.
    grey = np.full((8, 8, 3), 0.4, dtype=np.float32)
    assert np.allclose(
        apply_grade(grey.copy(), grades["dark"], land),
        apply_grade(grey.copy(), {**grades["dark"], "vegetation": None}, land),
    )


def test_highlight_rolloff_is_monotonic_and_preserves_gray():
    grades = load_grades()
    # A spatial vignette would darken the right end of a horizontal ramp.
    for grade in grades.values():
        grade["vignette"]["strength"] = 0
    ramp = np.linspace(0, 1, 1000, dtype=np.float32)
    rgb = np.repeat(ramp[None, :, None], 3, axis=2)
    elev = np.ones((1, 1000), dtype=np.float32)
    after = apply_grade(rgb, grades["dark"], elev)
    before = apply_grade(rgb, grades["dark_v1"], elev)
    assert np.isfinite(after).all()
    assert np.all(np.diff(after[0, :, 0]) >= -1e-7)
    assert after[0, -1, 0] < before[0, -1, 0]
    np.testing.assert_allclose(after[..., 0], after[..., 1])
    assert load_plate_look()["hillshade"] == 0.65
