"""Memory check before a heavy render."""

import pytest

from vap import system


def test_available_memory_is_a_positive_number_on_this_machine():
    available = system.available_gb()
    assert available is None or available > 0


@pytest.mark.parametrize(
    ("available", "workers"),
    [
        (None, 1),  # unknown: assume the worst
        (6.0, 1),
        (8.4, 1),
        (8.5, 2),
        (40.0, 2),  # never above the cap for this machine
    ],
)
def test_workers_follow_the_free_memory(available, workers):
    assert system.render_concurrency(available) == workers


def test_too_little_memory_stops_the_render_with_the_numbers(monkeypatch):
    monkeypatch.setattr(system, "available_gb", lambda: 4.8)
    with pytest.raises(ValueError, match=r"4\.8 GB is available"):
        system.check_render_memory()


def test_enough_memory_reports_the_workers(monkeypatch):
    monkeypatch.setattr(system, "available_gb", lambda: 9.0)
    workers, note = system.check_render_memory()
    assert workers == 2
    assert "9.0 GB available" in note


def test_unknown_memory_falls_back_to_one_worker(monkeypatch):
    monkeypatch.setattr(system, "available_gb", lambda: None)
    assert system.check_render_memory() == (1, "memory unknown, using 1 render worker")
