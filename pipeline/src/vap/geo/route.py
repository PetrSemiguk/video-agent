"""A custom route (canal, campaign, trade path) from a spec of sourced nodes.

uv run python -m vap.geo.route --plate china-east-hs05 --spec <routes/specs/slug.yaml>

Spec: `slug`, `name_en`, `era`, `branches` (each `id` + `nodes`), `sources` (id -> URL + what it
supports) and `simplifications` (what could not be confirmed and is drawn straight). A node is
`{name, lonlat, sources: [id, ...], label: bool}`; `follow: <river slug>` on a node makes the leg
*to* that node follow data/processed/<plate>/rivers/<slug>.geojson instead of a straight line.

Output: data/processed/<plate>/routes/<slug>.geojson, one LineString per branch with `cumfrac`,
`length_km`, `nodes` (with their length fraction) and `approximate: true`, plus <slug>.sources.md.
Nodes are places a source names. Between nodes a line is a schematic link, never a surveyed course.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import shapely
import shapely.ops
import yaml
from shapely.geometry import LineString, Point, shape

from .extract import DECIMALS, PROCESSED_DIR, mirror_to_public

MAX_FOLLOW_GAP_DEG = 0.25  # a node of a followed leg must lie this close to the river


def geodesic_km(coords: np.ndarray) -> np.ndarray:
    lon, lat = np.radians(coords[:, 0]), np.radians(coords[:, 1])
    dlon, dlat = np.diff(lon), np.diff(lat)
    a = np.sin(dlat / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(dlon / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))


def follow_river(river: LineString, start: list[float], end: list[float]) -> list[list[float]]:
    """Vertices of the river between its closest points to two nodes, in travel order."""
    for name, point in (("start", start), ("end", end)):
        gap = river.distance(Point(point))
        if gap > MAX_FOLLOW_GAP_DEG:
            raise ValueError(f"{name} node {point} is {gap:.2f} deg from the followed river")
    a, b = river.project(Point(start)), river.project(Point(end))
    reach = shapely.ops.substring(river, min(a, b), max(a, b))
    coords = [list(c) for c in reach.coords]
    return coords[::-1] if a > b else coords


def build_branch(branch: dict, rivers: dict[str, LineString], known_sources: set[str]) -> dict:
    nodes = branch["nodes"]
    if len(nodes) < 2:
        raise ValueError(f"Branch {branch['id']} needs at least two nodes")
    coords: list[list[float]] = [list(map(float, nodes[0]["lonlat"]))]
    ends = [0]
    for node in nodes[1:]:
        target = list(map(float, node["lonlat"]))
        if node.get("follow"):
            coords.extend(follow_river(rivers[node["follow"]], coords[-1], target))
        coords.append(target)
        ends.append(len(coords) - 1)
    for node in nodes:
        unknown = set(node.get("sources", [])) - known_sources
        if not node.get("sources") or unknown:
            raise ValueError(f"Node {node['name']} needs known sources (unknown: {unknown})")
    # Rivers can repeat a node's coordinate; zero-length segments would break cumfrac.
    keep = [0] + [i for i in range(1, len(coords)) if coords[i] != coords[i - 1]]
    index = {old: new for new, old in enumerate(keep)}
    array = np.asarray([coords[i] for i in keep])
    cum = np.concatenate([[0.0], np.cumsum(geodesic_km(array))])

    def position(end: int) -> int:
        while end not in index:
            end -= 1
        return index[end]

    props = {
        "id": branch["id"],
        "length_km": round(float(cum[-1]), 1),
        "approximate": True,
        "cumfrac": [round(float(v), 5) for v in cum / cum[-1]],
        "nodes": [
            {
                "name": node["name"],
                "lonlat": list(map(float, node["lonlat"])),
                "fraction": round(float(cum[position(end)] / cum[-1]), 5),
                "label": bool(node.get("label", False)),
            }
            for node, end in zip(nodes, ends, strict=True)
        ],
    }
    props["cumfrac"][-1] = 1.0
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [round(float(x), DECIMALS), round(float(y), DECIMALS)] for x, y in array
            ],
        },
    }


def sources_markdown(spec: dict, features: list[dict]) -> str:
    lines = [
        f"# {spec['name_en']}: sources",
        "",
        f"Era: {spec['era']}. Status: approximate. Nodes are places the sources name; between",
        "nodes the line is a schematic link, not a surveyed course.",
        "",
        "## Sources",
        "",
    ]
    for key, source in spec["sources"].items():
        lines.append(f"- `{key}`: {source['url']}. {source['supports']}")
    for feature, branch in zip(features, spec["branches"], strict=True):
        length = feature["properties"]["length_km"]
        lines += ["", f"## Branch {branch['id']} ({length:.0f} km as drawn)", ""]
        lines += ["| Node | lon, lat | Sources | Leg to this node |", "|---|---|---|---|"]
        for node in branch["nodes"]:
            lon, lat = node["lonlat"]
            leg = f"follows NE river `{node['follow']}`" if node.get("follow") else "straight"
            refs = ", ".join(node["sources"])
            lines.append(f"| {node['name']} | {lon}, {lat} | {refs} | {leg} |")
    lines += ["", "## Simplified or unconfirmed", ""]
    lines += [f"- {item}" for item in spec["simplifications"]]
    return "\n".join(lines) + "\n"


def compile_route(plate: str, spec: dict) -> tuple[dict, str]:
    known = set(spec["sources"])
    follows = {
        node["follow"]
        for branch in spec["branches"]
        for node in branch["nodes"]
        if "follow" in node
    }
    rivers = {}
    for slug in follows:
        path = PROCESSED_DIR / plate / "rivers" / f"{slug}.geojson"
        data = json.loads(path.read_text(encoding="utf-8"))
        rivers[slug] = shape(data["features"][0]["geometry"])
    features = [build_branch(branch, rivers, known) for branch in spec["branches"]]
    collection = {
        "type": "FeatureCollection",
        "slug": spec["slug"],
        "name_en": spec["name_en"],
        "era": spec["era"],
        "approximate": True,
        "features": features,
    }
    if not math.isfinite(sum(f["properties"]["length_km"] for f in features)):
        raise ValueError("Route has no finite length")
    return collection, sources_markdown(spec, features)


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(
        prog="python -m vap.geo.route",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--plate", required=True)
    ap.add_argument("--spec", required=True, type=Path)
    args = ap.parse_args(argv)
    spec = yaml.safe_load(args.spec.read_text(encoding="utf-8"))
    collection, sources = compile_route(args.plate, spec)
    out = PROCESSED_DIR / args.plate / "routes" / f"{spec['slug']}.geojson"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    out.with_suffix(".sources.md").write_text(sources, encoding="utf-8", newline="\n")
    lengths = ", ".join(
        f"{f['properties']['id']} {f['properties']['length_km']:.0f} km"
        for f in collection["features"]
    )
    print(f"{spec['slug']}: {lengths} -> {out}")
    mirror_to_public(args.plate)
    return 0


if __name__ == "__main__":
    sys.exit(main())
