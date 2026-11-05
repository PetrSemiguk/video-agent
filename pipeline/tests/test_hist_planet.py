"""The large download must fail closed before writing an unauthorized response."""

import hashlib
import json

import httpx
import pytest

from vap.geo import hist_planet as p


def configure(monkeypatch, tmp_path, status, payload, size=None):
    monkeypatch.setattr(p, "PBF", tmp_path / "snapshot.osm.pbf")
    monkeypatch.setattr(p, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(p, "EXPECTED_SIZE", 4)
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            status, content=payload, headers={"content-length": str(size or len(payload))}
        )
    )
    client = httpx.Client(transport=transport)
    monkeypatch.setattr(p.httpx, "stream", client.stream)


def test_forbidden_download_writes_evidence_not_pbf(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path, 403, b"denied")
    with pytest.raises(httpx.HTTPStatusError):
        p.download()
    assert not p.PBF.exists()
    evidence = json.loads(
        (tmp_path / "docs/reports/1.6/planet-download.json").read_text(encoding="utf-8")
    )
    assert evidence["status"] == 403


def test_size_change_rejected_before_write(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path, 200, b"large payload")
    with pytest.raises(ValueError, match="content-length changed"):
        p.download()
    assert not p.PBF.exists()


def test_complete_download_hash_and_atomic_final_file(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path, 200, b"test")
    p.download()
    manifest = json.loads(p.PBF.with_suffix(".manifest.json").read_text(encoding="utf-8"))
    assert p.PBF.read_bytes() == b"test"
    assert manifest["sha256"] == hashlib.sha256(b"test").hexdigest()
    assert not p.PBF.with_suffix(".pbf.partial").exists()
