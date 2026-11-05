"""The label lead check of the episode audit."""

from vap.qa.episode_audit import lead_is_valid

CONFIG = {"labelLeadFrames": 3}
STARTS = {"open": 0, "next": 100}


def lead(shot, start, frames):
    return {"shot": shot, "from": start, "leadFrames": frames}


def test_full_lead_passes_anywhere():
    assert lead_is_valid(lead("next", 150, 3), STARTS, CONFIG)


def test_shorter_lead_passes_only_at_the_first_frame_of_the_shot():
    assert lead_is_valid(lead("open", 0, 0), STARTS, CONFIG)
    assert lead_is_valid(lead("next", 100, 1), STARTS, CONFIG)
    assert not lead_is_valid(lead("next", 150, 1), STARTS, CONFIG)


def test_longer_lead_fails():
    assert not lead_is_valid(lead("next", 100, 4), STARTS, CONFIG)
