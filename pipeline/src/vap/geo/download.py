"""Cached HTTP downloads (atomic: write to .part, then rename)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

USER_AGENT = "video-agent/0.1 (geo plate generator)"


def download(client: httpx.Client, url: str, dest: Path) -> bool:
    """Download url to dest unless it already exists. Returns True if fetched.

    A 404 is recorded as an empty file so missing tiles are not requested again.
    """
    if dest.exists():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with client.stream("GET", url) as resp:
        if resp.status_code == 404:
            dest.write_bytes(b"")
            return True
        resp.raise_for_status()
        with tmp.open("wb") as fh:
            for chunk in resp.iter_bytes(1 << 20):
                fh.write(chunk)
    tmp.replace(dest)
    return True


def download_many(jobs: list[tuple[str, Path]], workers: int = 8) -> int:
    """Download (url, dest) pairs concurrently; returns how many were fetched."""
    todo = [(url, dest) for url, dest in jobs if not dest.exists()]
    if not todo:
        return 0
    timeout = httpx.Timeout(60.0, read=600.0)
    headers = {"User-Agent": USER_AGENT}
    with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
        with ThreadPoolExecutor(workers) as pool:
            return sum(pool.map(lambda job: download(client, *job), todo))
