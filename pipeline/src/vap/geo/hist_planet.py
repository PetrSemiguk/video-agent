"""Authorized OHM snapshot download and bounded local historical extraction."""

from __future__ import annotations

import argparse
import hashlib
import json
import time

import httpx

from .http import client as http_client
from .paths import RAW_DIR, REPO_ROOT

KEY = "planet/planet-261102_0000.osm.pbf"
URL = f"https://planet.openhistoricalmap.org/{KEY}"
EXPECTED_SIZE = 1_310_645_505
PBF = RAW_DIR / "historical" / KEY.rsplit("/", 1)[1]


def download():
    """One authorized object; atomic final file, known size and SHA-256 manifest."""
    manifest = PBF.with_suffix(".manifest.json")
    if PBF.exists():
        if PBF.stat().st_size != EXPECTED_SIZE:
            raise ValueError("existing PBF size mismatch")
        if not manifest.exists():
            raise ValueError("existing PBF has no download manifest")
        print(f"Using {PBF} ({EXPECTED_SIZE} bytes)", flush=True)
        return
    PBF.parent.mkdir(parents=True, exist_ok=True)
    partial = PBF.with_suffix(".pbf.partial")
    digest, total, mark = hashlib.sha256(), 0, time.monotonic()
    with http_client(httpx.Timeout(120, connect=20)) as session, session.stream("GET", URL) as r:
        if r.status_code != 200:
            evidence = REPO_ROOT / "docs/reports/1.6/planet-download.json"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text(
                json.dumps(
                    {
                        "url": URL,
                        "authorized_bytes": EXPECTED_SIZE,
                        "method": "GET",
                        "status": r.status_code,
                        "server": r.headers.get("server"),
                        "content_type": r.headers.get("content-type"),
                        "outcome": "No PBF payload downloaded; access denied; no bypass attempted",
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        r.raise_for_status()
        if int(r.headers.get("content-length", 0)) != EXPECTED_SIZE:
            raise ValueError("snapshot content-length changed; reassess before downloading")
        with partial.open("wb") as out:
            for chunk in r.iter_bytes(1024 * 1024):
                total += len(chunk)
                if total > EXPECTED_SIZE:
                    raise ValueError("snapshot exceeded authorized size")
                out.write(chunk)
                digest.update(chunk)
                if time.monotonic() - mark > 10:
                    print(
                        f"OHM planet: {total / 1e6:.0f} / {EXPECTED_SIZE / 1e6:.0f} MB", flush=True
                    )
                    mark = time.monotonic()
        if total != EXPECTED_SIZE:
            raise ValueError(f"incomplete snapshot: {total} bytes")
        partial.replace(PBF)
        manifest.write_text(
            json.dumps(
                {
                    "url": URL,
                    "bytes": total,
                    "sha256": digest.hexdigest(),
                    "etag": r.headers.get("etag"),
                    "last_modified": r.headers.get("last-modified"),
                    "license": "OHM CC0 default, individual element exceptions",
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    print(f"Downloaded {PBF}; sha256={digest.hexdigest()}", flush=True)


def inventory():
    import osmium

    from .hist_backends import political

    records = []
    start = time.monotonic()
    for r in osmium.FileProcessor(str(PBF), osmium.osm.RELATION):
        tags = dict(r.tags)
        if political(tags):
            records.append(
                {
                    "id": r.id,
                    "tags": tags,
                    "members": [{"type": m.type, "ref": m.ref, "role": m.role} for m in r.members],
                }
            )
    out = PBF.parent / "planet-boundary-relations.json"
    out.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print(
        f"{len(records)} political/admin2 relations in {time.monotonic() - start:.1f}s", flush=True
    )
    for date in ("1914-07-01", "1815", "1644"):
        from .hist import active

        found = []
        for r in records:
            try:
                if active(r["tags"], date):
                    found.append(
                        {
                            "id": r["id"],
                            "name": r["tags"].get("name:en") or r["tags"].get("name"),
                            "start": r["tags"].get("start_date"),
                            "end": r["tags"].get("end_date"),
                            "license": r["tags"].get("license"),
                        }
                    )
            except (ValueError, KeyError):
                pass
        print(json.dumps({"date": date, "global_active": found}, ensure_ascii=True), flush=True)


def access():
    """HEAD only on the official published host and its S3 object address."""
    results = []
    for url in (URL, f"https://s3.amazonaws.com/planet.openhistoricalmap.org/{KEY}"):
        try:
            with http_client(30) as session:
                r = session.head(url)
            results.append(
                {
                    "url": str(r.url),
                    "method": "HEAD",
                    "status": r.status_code,
                    "content_length": r.headers.get("content-length"),
                    "etag": r.headers.get("etag"),
                    "last_modified": r.headers.get("last-modified"),
                }
            )
        except httpx.HTTPError as exc:
            results.append({"url": url, "error": str(exc)})
    evidence = REPO_ROOT / "docs/reports/1.6/planet-head.json"
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2), flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", choices=["download", "inventory", "access"])
    args = ap.parse_args()
    try:
        {"download": download, "inventory": inventory, "access": access}[args.command]()
    except (ValueError, httpx.HTTPError) as exc:
        ap.exit(1, f"OHM planet ERROR: {exc}\n")


if __name__ == "__main__":
    main()
