"""The motion rule: no stretch over 2 s without camera motion, except explained holds."""

import json
import math

import numpy as np
import pytest

from vap.qa import motion

FPS = 30


def plan(shots, frames=300, pose=lambda f: (f * 2000.0, 0.0, 5.0)):
    return {
        "fps": FPS,
        "width": 1920,
        "height": 1080,
        "frames": [list(pose(f)) for f in range(frames)],
        "shots": shots,
    }


def shot(preset="focusOn", reason=None, start=0, frames=300, name="a"):
    return {"id": name, "from": start, "frames": frames, "preset": preset, "reason": reason}


def test_moving_camera_passes():
    speed = np.full(300, 1.0)
    assert motion.gate(speed, plan([shot()]), FPS)["passed"]


def test_a_stretch_of_exactly_the_limit_passes_and_a_longer_one_fails():
    for still, passed in ((60, True), (70, False)):
        speed = np.ones(300)
        speed[100 : 100 + still] = 0.0
        assert motion.gate(speed, plan([shot()]), FPS)["passed"] is passed


def test_one_noisy_pair_does_not_break_a_still_stretch():
    speed = np.zeros(200)
    speed[100] = 4.0  # an overlay fading in moves the correlation peak for a frame
    assert len(motion.still_stretches(speed, FPS, 0.03, 2.0)) == 1


def test_default_drift_passes_on_a_long_shot():
    frames = 600
    # 1.5% of the frame width over 20 s at zoom 5, the drift preset's default.
    metres_per_px = 2 * np.pi * 6378137 / (512 * 2**5)
    step = 0.015 * 1920 * metres_per_px / frames
    camera = plan([shot("drift", frames=frames)], frames, lambda f: (f * step, 0.0, 5.0))
    pan, zoom = motion.plan_speeds(camera)
    assert motion.gate(np.hypot(pan, zoom), camera, FPS)["passed"]


def test_plan_speed_counts_pan_and_zoom():
    pan, zoom = motion.plan_speeds(plan([shot()], 3))
    assert pan[0] > 0 and zoom[0] == 0
    camera = plan([shot()], 3, lambda f: (0.0, 0.0, 5.0 + f * 0.001))
    pan, zoom = motion.plan_speeds(camera)
    assert pan[0] == 0 and zoom[0] > 0.3


@pytest.mark.parametrize(
    ("preset", "reason", "passed"),
    [("hold", None, False), ("hold", "The date is read", True), ("focusOn", "ignored", False)],
)
def test_only_a_hold_with_a_reason_may_stand_still(preset, reason, passed):
    speed = np.zeros(300)
    assert motion.gate(speed, plan([shot(preset, reason)]), FPS)["passed"] is passed


def test_still_stretch_leaving_a_reasoned_hold_fails():
    shots = [shot("hold", "Read", 0, 150, "a"), shot("focusOn", None, 150, 150, "b")]
    report = motion.gate(np.zeros(300), plan(shots), FPS)
    assert not report["passed"]
    assert report["failures"][0]["shots"] == ["a", "b"]


def test_video_stretch_explained_by_zoom_is_allowed():
    speed = np.zeros(300)
    zoom = np.full(300, 0.5)
    report = motion.gate(speed, plan([shot()]), FPS, zoom=zoom)
    assert report["passed"]
    assert "zoom" in report["stills"][0]["why"]


def test_screen_motion_counts_zoom_at_the_corners():
    moving = plan([shot()], 3, lambda f: (0.0, 0.0, 5.0 + f * 0.01))
    expected = math.hypot(960, 540) * (2**0.01 - 1)
    assert motion.screen_motion(moving)[0] == pytest.approx(expected)
    metres = 2 * math.pi * 6378137 / (512 * 2**5)
    panning = plan([shot()], 3, lambda f: (f * 7 * metres, 0.0, 5.0))
    assert motion.screen_motion(panning)[0] == pytest.approx(7)


LIMITS = {"panPx": 9, "zoomPx": 16, "zoomWithLabelPx": 9, "tolerancePx": 0.5}
METRES = 2 * math.pi * 6378137 / (512 * 2**5)


def zooming_plan(per_frame: float, shots=None, frames=60):
    """A camera that only zooms, by per_frame zoom levels after frame 30."""
    return plan(
        shots or [shot(name="slow", frames=30), shot(name="fast", start=30, frames=30)],
        frames,
        lambda f: (0.0, 0.0, 5.0 + max(0, f - 30) * per_frame),
    )


def test_too_fast_names_the_shot_and_which_of_pan_or_zoom():
    camera = plan(
        [shot(name="slow", frames=30), shot(name="fast", start=30, frames=30)],
        60,
        lambda f: (max(0, f - 30) * 12 * METRES, 0.0, 5.0),
    )
    camera["limits"] = LIMITS
    found = motion.too_fast(camera, FPS)
    assert [(item["shot"], item["what"]) for item in found] == [("fast", "pan")]
    assert found[0]["peak_px"] == pytest.approx(12, abs=0.1)
    assert motion.too_fast({**camera, "limits": {**LIMITS, "panPx": 50}}, FPS) == []
    del camera["limits"]
    assert motion.too_fast(camera, FPS) == []


def test_pan_and_zoom_have_their_own_budgets():
    # 7 px/frame of pan and 12 of zoom: together 19, yet each is inside its own limit.
    camera = plan(
        [shot(name="both", frames=3)],
        3,  # short: a rising zoom would otherwise make each later pan step more pixels
        lambda f: (f * 7 * METRES, 0.0, 5.0 + f * 0.01568),
    )
    camera["limits"] = LIMITS
    pan, zoom = motion.screen_pan_zoom(camera)
    assert pan[0] == pytest.approx(7, abs=0.1)
    assert zoom[0] == pytest.approx(12, abs=0.5)
    assert motion.screen_motion(camera)[0] > 18  # the old combined measure would fail it
    assert motion.too_fast(camera, FPS) == []


def test_a_zoom_over_the_soft_limit_fails():
    camera = zooming_plan(0.0157)  # about 12 px/frame at the corners
    camera["limits"] = {**LIMITS, "zoomPx": 10}
    found = motion.too_fast(camera, FPS)
    assert [(item["shot"], item["what"]) for item in found] == [("fast", "zoom")]
    assert found[0]["labelled"] is False


def test_a_label_on_screen_holds_the_zoom_to_the_strict_limit():
    camera = zooming_plan(0.0157)  # about 12 px/frame: inside 16, over 9
    camera["limits"] = LIMITS
    assert motion.too_fast(camera, FPS) == []
    camera["labelFrames"] = [[40, 50]]
    found = motion.too_fast(camera, FPS)
    assert [(item["shot"], item["what"], item["labelled"]) for item in found] == [
        ("fast", "zoom", True)
    ]
    assert found[0]["limit_px"] == 9


def test_label_mask_covers_both_frames_of_a_pair():
    mask = motion.label_mask({"labelFrames": [[10, 12]]}, 20)
    assert list(np.flatnonzero(mask)) == [9, 10, 11]


def test_cli_fails_a_fast_camera_and_says_so(tmp_path, capsys):
    camera = plan([shot()], pose=lambda f: (f * 20 * METRES, 0.0, 5.0))
    camera["limits"] = LIMITS
    path = tmp_path / "plan.json"
    path.write_text(json.dumps(camera), encoding="utf-8")
    assert motion.main(["--plan", str(path), "--check"]) == 1
    assert "too fast in a (pan" in capsys.readouterr().err


def test_cli_check_exits_nonzero_and_names_the_shot(tmp_path, capsys):
    path = tmp_path / "plan.json"
    report = tmp_path / "report.json"
    path.write_text(
        json.dumps(plan([shot(name="freeze")], pose=lambda f: (0.0, 0.0, 5.0))), encoding="utf-8"
    )
    assert motion.main(["--plan", str(path), "--check", f"--report={report}"]) == 1
    assert "freeze" in capsys.readouterr().err
    assert json.loads(report.read_text(encoding="utf-8"))["gate"]["passed"] is False
