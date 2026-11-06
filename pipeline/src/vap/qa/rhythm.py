"""Editing rhythm of an episode: shots and hard cuts per minute, scales, kinds, graphics, sections.

uv run python -m vap.qa.rhythm <slug> [--plan <camera-plan.json>]

Needs the camera plan that `render:episode` writes in the preview stage. Writes
studio/out/episodes/<slug>/rhythm.json. It reports and warns, and never fails a build: these ranges
guide editing, see "Rhythm" in docs/visual-grammar.md.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
# Visible cuts only: a change of plate, a transition, or a break in the camera's motion.
HARD_CUTS_PER_MINUTE = (1.0, 3.0)
# A change of the camera's step across a shot boundary that reads as a break, screen px per frame.
CAMERA_BREAK_PX = 3.0
MAX_GRAPHIC_SHARE = 0.2
PAUSE_RANGE = (0.6, 1.5)
# "Wide" is relative to the episode's plates: within this share of the widest safe frame the
# shot's own plate can show at that latitude. An absolute ground width would call a one-country
# plate narrow however far the camera pulls back.
WIDE_SHARE = 0.9
# Ground width of the frame at the end of a shot, km. Reference only, for plans without plates.
WIDE_KM = 4500.0
REGIONAL_KM = 1500.0
# Widest frame over narrowest, across the episode. Below this it was shot at one scale.
MIN_SCALE_SPREAD = 2.0
GRAPHIC_LAYERS = {"BarCompare", "TimelineBar", "NumberedList", "RecapCards", "KeyFact"}
MAP_LAYERS = {"RegionHighlight", "RiverLine", "RouteLine", "HistoricalLayer", "PlaceLabel"}
SENTENCE_END = re.compile(r"[.?!;:][\"')\]]*$")
EARTH_M = 2 * math.pi * 6378137.0


def frame_width_km(pose: list[float], width: int) -> float:
    """Ground width of the frame, from a plan pose [x, y, zoom] in Web Mercator metres."""
    x, y, zoom = pose
    lat = 2 * math.atan(math.exp(y / 6378137.0)) - math.pi / 2
    return width * EARTH_M / (512 * 2**zoom) * math.cos(lat) / 1000


def scale_of(km: float, wide_from_km: float | None = None) -> str:
    """Wide relative to the plate when the plan says what it can show, else by ground width."""
    if km >= (WIDE_KM if wide_from_km is None else wide_from_km):
        return "wide"
    return "regional" if km >= REGIONAL_KM else "detail"


def wide_from(plan: dict, pose: list[float], plate: str | None) -> float | None:
    """Frame width, in km, from which a shot on this plate counts as wide at this latitude."""
    plates = plan.get("plates") or {}
    widest = (plates.get(plate) or {}).get("widestSafeZoom")
    if widest is None:
        return None
    x, y, _ = pose
    return WIDE_SHARE * frame_width_km([x, y, widest], plan["width"])


def kind_of(shot: dict | None) -> str:
    """broll and graphic are shots without a map subject. A generated gap shot is map."""
    layers = {layer["type"] for layer in (shot or {}).get("layers", [])}
    if "BRollClip" in layers:
        return "broll"
    if layers & GRAPHIC_LAYERS and not layers & MAP_LAYERS:
        return "graphic"
    return "map"


def script_sections(text: str) -> list[dict]:
    """Each `## Section`, with the number of spoken tokens before it, and its [pause] marks."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    sections: list[dict] = []
    spoken = 0
    for line in text.splitlines():
        heading = re.match(r"^##\s+(.+)$", line)
        if heading:
            sections.append({"name": heading[1].strip(), "first_word": spoken, "pauses": []})
            continue
        if line.startswith("#"):
            continue
        pauses = [float(p) for p in re.findall(r"\[pause\s+(\d+(?:\.\d+)?)\]", line)]
        if sections:
            sections[-1]["pauses"].extend(pauses)
        spoken += len(re.sub(r"\[pause[^\]]*\]", " ", line).split())
    return sections


def camera_break(plan: dict, frame: int) -> float:
    """Change of the camera's step across a boundary frame, in screen px per frame."""
    frames = plan["frames"]
    if not 2 <= frame < len(frames):
        return 0.0
    a, b, c = frames[frame - 2], frames[frame - 1], frames[frame]
    metres = EARTH_M / (512 * 2 ** b[2])
    return math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1]) / metres


def three_in_a_row(values: list[str]) -> list[list[int]]:
    """Index runs of at least 3 equal neighbours."""
    runs, start = [], 0
    for i in range(1, len(values) + 1):
        if i == len(values) or values[i] != values[start]:
            if i - start >= 3:
                runs.append(list(range(start, i)))
            start = i
    return runs


def analyze(plan: dict, story: dict, words: dict, script: str | None = None) -> dict:
    fps = plan["fps"]
    total = len(plan["frames"])
    by_id = {shot["id"]: shot for shot in story["shots"]}
    rows = []
    for shot in plan["shots"]:
        authored = by_id.get(shot["id"])
        end = plan["frames"][min(shot["from"] + shot["frames"] - 1, total - 1)]
        km = frame_width_km(end, plan["width"])
        transition = ((authored or {}).get("transition") or {}).get("kind", "cut")
        # The plan knows the plate of generated gap shots too; the storyboard only of authored ones.
        plate = shot.get("plate") or (authored or {}).get("plate")
        bar = wide_from(plan, end, plate)
        rows.append(
            {
                "id": shot["id"],
                "from": shot["from"],
                "frames": shot["frames"],
                "seconds": round(shot["frames"] / fps, 2),
                "frame_width_km": round(km),
                "wide_from_km": round(bar) if bar else None,
                "scale": scale_of(km, bar),
                "kind": kind_of(authored),
                "transition": transition,
                "plate": plate,
            }
        )
    minutes = total / fps / 60
    boundaries = rows[1:]
    per_minute = [0] * (int(minutes) + 1)
    hard_cuts = []
    off_sentence = []
    spans = words["words"]
    for previous, row in zip(rows, rows[1:], strict=False):
        at = row["from"] / fps
        reasons = []
        if previous["plate"] and row["plate"] and previous["plate"] != row["plate"]:
            reasons.append("plate")
        if previous["transition"] != "cut":
            reasons.append(previous["transition"])
        jump = camera_break(plan, row["from"])
        if jump > CAMERA_BREAK_PX:
            reasons.append(f"camera {jump:.1f}")
        row["hard_cut"] = reasons
        if reasons:
            hard_cuts.append({"shot": row["id"], "at_s": round(at, 2), "why": reasons})
            per_minute[int(at // 60)] += 1
        before = [w for w in spans if w["end"] <= at + 0.1]
        if before and not SENTENCE_END.search(before[-1]["text"]):
            off_sentence.append({"shot": row["id"], "after_word": before[-1]["text"]})
    frames_of = {"map": 0, "graphic": 0, "broll": 0}
    for row in rows:
        frames_of[row["kind"]] += row["frames"]
    non_map_share = (frames_of["graphic"] + frames_of["broll"]) / total
    average = len(hard_cuts) / minutes if minutes else 0.0
    scales = [r["scale"] if r["kind"] == "map" else r["kind"] for r in rows]
    runs = [[rows[i]["id"] for i in run] for run in three_in_a_row(scales)]

    warnings = []
    if average > HARD_CUTS_PER_MINUTE[1]:
        warnings.append(
            f"VIOLATION: {average:.1f} hard cuts per minute, at most {HARD_CUTS_PER_MINUTE[1]:.0f}"
        )
    elif average < HARD_CUTS_PER_MINUTE[0] and minutes >= 2:
        warnings.append(f"{average:.1f} hard cuts per minute, at least about 1 expected")
    if off_sentence:
        warnings.append(
            "shot change not at a sentence end: " + ", ".join(item["shot"] for item in off_sentence)
        )
    if non_map_share > MAX_GRAPHIC_SHARE:
        warnings.append(f"graphic-only share {non_map_share:.0%}, at most {MAX_GRAPHIC_SHARE:.0%}")
    widths = [r["frame_width_km"] for r in rows if r["kind"] == "map" and r["frame_width_km"]]
    spread = max(widths) / min(widths) if widths else 0.0
    if widths and spread < MIN_SCALE_SPREAD:
        warnings.append(
            f"scale spread {spread:.1f}x, at least {MIN_SCALE_SPREAD:.0f}x expected: the episode "
            f"stays between {min(widths)} and {max(widths)} km wide"
        )
    warnings += [f"3 or more shots in a row at one scale or kind: {', '.join(r)}" for r in runs]

    sections = []
    found = script_sections(script) if script else []
    starts = []
    for section in found:
        first = section["first_word"]
        index = None
        if first < len(spans):
            at = spans[first]["start"]
            for i, row in enumerate(rows):
                if row["from"] / fps <= at + 0.5:
                    index = i
        starts.append(index)
    for position, section in enumerate(found):
        index = starts[position]
        row = rows[index] if index is not None else None
        authored = by_id.get(row["id"]) if row else None
        tag = bool(authored) and any(
            layer["type"] == "SectionTag" for layer in authored.get("layers", [])
        )
        changed = index is not None and (index == 0 or rows[index - 1]["scale"] != row["scale"])
        out_of_range = [p for p in section["pauses"] if not PAUSE_RANGE[0] <= p <= PAUSE_RANGE[1]]
        # Every section needs one view that puts its subject in its place: a wide shot.
        following = next((s for s in starts[position + 1 :] if s is not None), len(rows))
        span = rows[index:following] if index is not None else []
        wide = [r["id"] for r in span if r["kind"] == "map" and r["scale"] == "wide"]
        sections.append(
            {
                "name": section["name"],
                "shot": row["id"] if row else None,
                "section_tag": tag,
                "scale_change": changed,
                "wide_shots": wide,
                "pauses": section["pauses"],
            }
        )
        if not tag:
            warnings.append(f'section "{section["name"]}" opens with no SectionTag')
        if not changed:
            warnings.append(f'section "{section["name"]}" opens with no change of scale')
        if span and not wide:
            warnings.append(f'section "{section["name"]}" has no wide shot')
        if len(section["pauses"]) > 1:
            warnings.append(f'section "{section["name"]}" has {len(section["pauses"])} pauses')
        if out_of_range:
            warnings.append(f'section "{section["name"]}": pause outside 0.6-1.5 s')
    if script is not None and not sections and minutes >= 2:
        warnings.append("script has no ## sections")

    return {
        "seconds": round(total / fps, 2),
        "shots": len(rows),
        "shots_per_minute": round(len(boundaries) / minutes, 2) if minutes else 0.0,
        "hard_cuts": hard_cuts,
        "hard_cuts_per_minute": round(average, 2),
        "hard_cuts_by_minute": per_minute,
        "seconds_by_kind": {k: round(v / fps, 1) for k, v in frames_of.items()},
        "graphic_share": round(non_map_share, 3),
        "shots_by_scale": {s: scales.count(s) for s in ("wide", "regional", "detail")},
        "scale_spread": round(spread, 2),
        "frame_width_km": {"min": min(widths), "max": max(widths)} if widths else {},
        "sections": sections,
        "table": rows,
        "warnings": warnings,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m vap.qa.rhythm", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)  # fmt: skip
    ap.add_argument("slug")
    ap.add_argument("--plan", type=Path, default=None)
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    out = ROOT / "studio/out"
    plan_path = args.plan or out / f"{args.slug}-camera-plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    story = json.loads(
        (ROOT / "episodes" / args.slug / "storyboard.json").read_text(encoding="utf-8")
    )
    words_path = ROOT / story["audio"]["words"]
    words = json.loads(words_path.read_text(encoding="utf-8-sig"))
    script_path = words_path.parents[1] / "script.md"
    script = script_path.read_text(encoding="utf-8") if script_path.is_file() else None
    report = analyze(plan, story, words, script)
    target = out / "episodes" / args.slug / "rhythm.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"Rhythm: {report['shots_per_minute']} shots/min, "
        f"{report['hard_cuts_per_minute']} hard cuts/min, graphic share "
        f"{report['graphic_share']:.0%}, by scale {report['shots_by_scale']}; {target}"
    )
    for warning in report["warnings"]:
        print(f"Rhythm warning: {warning}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
