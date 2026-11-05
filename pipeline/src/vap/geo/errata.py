"""Known factual errors of historical layers, and the check that stops a build using them.

`<layer>.errata.json` sits next to the layer: a list of
{"feature": ..., "problem": ..., "correct": ..., "source": url, "severity": "blocker"|"warning"}.
A shot may use a layer with a blocker only with `errataOverride: {"reason": ...}` on the layer;
studio/scripts/storyboard.cjs applies the same rule to storyboard validation.
"""

from __future__ import annotations

import json
from pathlib import Path

REQUIRED = {"feature", "problem", "correct", "source", "severity"}
SEVERITIES = {"blocker", "warning"}
LAYER_TYPE = "HistoricalLayer"


def validate(entries: list) -> None:
    if not isinstance(entries, list):
        raise ValueError("errata must be a list")
    for entry in entries:
        missing = REQUIRED - entry.keys()
        if missing:
            raise ValueError(f"errata entry misses {sorted(missing)}: {entry}")
        if entry["severity"] not in SEVERITIES:
            raise ValueError(f"unknown errata severity: {entry['severity']}")
        if not str(entry["source"]).startswith("http"):
            raise ValueError(f"errata source must be a URL: {entry['source']}")


def load(root: Path, plate: str, slug: str) -> list[dict]:
    path = root / "data/processed" / plate / "historical" / f"{slug}.errata.json"
    if not path.is_file():
        return []
    entries = json.loads(path.read_text(encoding="utf-8"))
    validate(entries)
    return entries


def used_layers(story: dict):
    """Yield (shot, layer, plate name) for every historical layer of a storyboard."""
    plates = {plate["id"]: plate["name"] for plate in story.get("plates", [])}
    for shot in story.get("shots", []):
        for layer in shot.get("layers", []):
            if layer.get("type") == LAYER_TYPE:
                yield shot, layer, plates.get(shot.get("plate"))


def blocking_issues(story: dict, root: Path) -> list[str]:
    """One message per shot that uses a layer with a blocker and has no override with a reason."""
    issues = []
    for shot, layer, plate in used_layers(story):
        props = layer.get("props", {})
        blockers = [e for e in load(root, plate, props["slug"]) if e["severity"] == "blocker"]
        if blockers and not props.get("errataOverride", {}).get("reason", "").strip():
            what = "; ".join(e["feature"] for e in blockers)
            issues.append(
                f"shot {shot['id']}: layer {props['slug']} has errata blockers ({what}); "
                "fix the layer or set errataOverride with a reason"
            )
    return issues
