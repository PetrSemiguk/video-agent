import numpy as np

from vap.geo.look import apply_grade, load_grades, load_plate_look


def test_land_midtones_lift_without_lifting_water():
    grades = load_grades()
    rgb = np.full((16, 16, 3), 0.3, dtype=np.float32)
    land = np.ones((16, 16), dtype=np.float32)
    before = apply_grade(rgb, grades["dark_v1"], land)
    after = apply_grade(rgb, grades["dark"], land)
    np.testing.assert_allclose(after / before, 1.125, atol=1e-6)
    rgb[:] = [0.03, 0.08, 0.18]
    sea = np.zeros((16, 16), dtype=np.float32)
    np.testing.assert_array_equal(
        apply_grade(rgb, grades["dark_v1"], sea),
        apply_grade(rgb, grades["dark"], sea),
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
