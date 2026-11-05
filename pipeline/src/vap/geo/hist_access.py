"""Small documented OHM API connectivity checks; no planet downloads.

uv run python -m vap.geo.hist_access
"""

import argparse
import json
import xml.etree.ElementTree as ET

import httpx

from .http import client as http_client
from .paths import REPO_ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--planet-only", action="store_true")
    parser.add_argument("--prefix", default="")
    args = parser.parse_args()
    results = []
    checks = [
        ("rest_capabilities", "GET", "https://www.openhistoricalmap.org/api/0.6/capabilities", {}),
        (
            "rest_small_bbox",
            "GET",
            "https://www.openhistoricalmap.org/api/0.6/map",
            {"bbox": "2.34,48.85,2.35,48.86"},
        ),
        (
            "rest_relation_full",
            "GET",
            "https://www.openhistoricalmap.org/api/0.6/relation/2749168/full",
            {},
        ),
        # Public S3 ListObjectsV2 metadata, not an object download. Bucket is linked
        # from the official OHM reuse/planet documentation. Never fetch a listed object.
        (
            "planet_metadata",
            "GET",
            "https://s3.amazonaws.com/planet.openhistoricalmap.org/",
            {"list-type": "2", "max-keys": "100", "delimiter": "/", "prefix": args.prefix},
        ),
    ]
    if args.planet_only:
        checks = checks[-1:]
    with http_client(httpx.Timeout(25, connect=10)) as client:
        for name, method, url, params in checks:
            item = {"check": name, "url": url, "method": method, "params": params}
            try:
                kwargs = {"data" if method == "POST" else "params": params}
                with client.stream(method, url, **kwargs) as r:
                    item["status"] = r.status_code
                    item["content_type"] = r.headers.get("content-type")
                    body = bytearray()
                    for chunk in r.iter_bytes():
                        body.extend(chunk)
                        if len(body) > 64_000:
                            break
                    if r.status_code == 200 and name == "planet_metadata":
                        root = ET.fromstring(body)
                        ns = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
                        item["objects"] = [
                            {
                                "key": c.findtext("s:Key", namespaces=ns),
                                "bytes": c.findtext("s:Size", namespaces=ns),
                            }
                            for c in root.findall("s:Contents", ns)
                        ]
                        item["listing_truncated"] = root.findtext("s:IsTruncated", namespaces=ns)
                        item["prefixes"] = [
                            p.findtext("s:Prefix", namespaces=ns)
                            for p in root.findall("s:CommonPrefixes", ns)
                        ]
                    elif r.status_code == 200:
                        item["response_preview"] = body.decode(errors="replace")[:1000]
                    else:
                        item["error"] = f"HTTP {r.status_code}; no challenge bypass attempted"
            except (httpx.HTTPError, ET.ParseError) as exc:
                item["error"] = str(exc)
            results.append(item)
            print(json.dumps(item), flush=True)
    out = (
        REPO_ROOT
        / "docs"
        / "reports"
        / "1.6"
        / (
            ("planet-" + args.prefix.replace("/", "-") + "check.json")
            if args.planet_only
            else "access-check.json"
        )
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
