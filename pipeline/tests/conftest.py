"""Shared fixtures."""

import pytest

from vap import system


@pytest.fixture(autouse=True)
def plenty_of_memory(monkeypatch, request):
    """How busy this machine happens to be must not decide whether the tests pass.

    `vap.episode` refuses to render below `RENDER_MIN_FREE_GB`, which is right in production and
    meaningless here. test_system.py exercises the real reading, so it opts out.
    """
    if not request.module.__name__.endswith("test_system"):
        monkeypatch.setattr(system, "available_gb", lambda: 32.0)
