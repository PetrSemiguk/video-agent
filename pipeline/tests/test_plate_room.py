"""A plate is designed around its subject with room, not drawn to its borders."""

from vap.geo.mercator import fit_extent
from vap.geo.plate import SUBJECT_BAND, subject_room

EGYPT = (24.7, 21.8, 36.9, 31.7)


def test_a_plate_drawn_to_the_subjects_borders_has_no_room():
    """The old egypt plate: lat 10-33 for a country reaching 31.7."""
    room = subject_room(fit_extent((9, 10, 53, 33), 6950, 3909), EGYPT)
    assert room["contains_subject"]
    assert not room["has_room"]
    # The subject sits well north of the plate's middle third.
    assert room["centre_offset_share"][1] > SUBJECT_BAND / 2


def test_a_plate_with_room_passes_and_keeps_the_subject():
    room = subject_room(fit_extent((7, 14, 55, 38), 6950, 3909), EGYPT)
    assert room["has_room"]
    assert max(room["centre_offset_share"]) <= SUBJECT_BAND / 2


def test_the_suggested_bbox_is_itself_a_plate_with_room():
    """Whatever the input, the advice it prints must satisfy the rule."""
    bad = fit_extent((9, 10, 53, 33), 6950, 3909)
    suggested = subject_room(bad, EGYPT)["suggested_bbox"]
    fixed = subject_room(fit_extent(tuple(suggested), 6950, 3909), EGYPT)
    assert fixed["has_room"]


def test_a_subject_off_the_plate_is_reported():
    room = subject_room(fit_extent((100, 10, 140, 40), 3840, 2160), EGYPT)
    assert not room["contains_subject"]
    assert not room["has_room"]
