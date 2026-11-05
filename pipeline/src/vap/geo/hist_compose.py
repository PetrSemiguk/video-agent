"""Compile a map of historical states from a YAML spec: see docs/maps.md.

Each state is a union of parts minus other parts. A part is one of
  {ne_admin0: <id>}, {ne_admin1: <id>}, {layer: <slug>, feature: <id>},
  {polygon: [[lon, lat], ...]}.
States must not overlap: that is a compile error naming the pair, to be fixed in the spec.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import shapely
import yaml
from shapely.geometry import Polygon, shape
from shapely.strtree import STRtree

from . import hist_attribution
from .extract import PROCESSED_DIR, TOLERANCE_PX, _clean_polygonal, _to_merc
from .hist import (
    MIN_OVERLAP_KM2,
    _load_land,
    area_km2,
    build_features,
    coast_report,
    iso,
    save_layer,
)
from .paths import PLATES_DIR
from .vectors import features

CONFIDENCE = {"high", "medium", "low"}
COLOR_ROLES = {"regionA", "regionB", "conflict", "neutral"}
NE_LAYERS = {"ne_admin0": "countries", "ne_admin1": "admin1"}


class ComposeError(ValueError):
    pass


class Parts:
    """Resolves spec parts to Mercator geometry and remembers which layers were used."""

    def __init__(self, plate: str):
        self.plate = plate
        self.layers: dict[str, dict] = {}
        self.ne: dict[str, dict] = {}
        self.licenses: dict[str, str] = {}

    def _layer(self, slug: str) -> dict:
        if slug not in self.layers:
            path = PROCESSED_DIR / self.plate / "historical" / f"{slug}.geojson"
            if not path.is_file():
                raise ComposeError(f"unknown layer: {slug}")
            collection = json.loads(path.read_text(encoding="utf-8"))
            self.layers[slug] = {f["properties"]["id"]: f for f in collection["features"]}
        return self.layers[slug]

    def _natural_earth(self, kind: str, wanted: str):
        layer = NE_LAYERS[kind]
        if layer not in self.ne:
            self.ne[layer] = {src.props["id"]: src.geometry for src in features(layer, "10m")}
        if wanted not in self.ne[layer]:
            raise ComposeError(f"unknown Natural Earth {layer} id: {wanted}")
        return shape(self.ne[layer][wanted])

    def resolve(self, part: dict):
        kinds = {"ne_admin0", "ne_admin1", "layer", "polygon"} & part.keys()
        if len(kinds) != 1:
            raise ComposeError(f"a part needs exactly one kind: {part}")
        kind = kinds.pop()
        if kind == "polygon":
            geom = Polygon(part["polygon"])
            if not geom.is_valid:
                raise ComposeError(f"invalid custom polygon: {part['polygon'][:3]}...")
        elif kind == "layer":
            found = self._layer(part["layer"]).get(part.get("feature"))
            if found is None:
                raise ComposeError(f"layer {part['layer']} has no feature {part.get('feature')}")
            self.licenses[part["layer"]] = found["properties"]["license"]
            geom = shape(found["geometry"])
        else:
            geom = self._natural_earth(kind, part[kind])
        return _clean_polygonal(shapely.make_valid(shapely.transform(geom, _to_merc)))

    def state(self, spec: dict):
        union = [self.resolve(part) for part in spec["geometry"]["union"]]
        minus = [self.resolve(part) for part in spec["geometry"].get("minus", [])]
        geom = shapely.union_all(union)
        return _clean_polygonal(geom.difference(shapely.union_all(minus)) if minus else geom)


def check_state(spec: dict) -> None:
    name = spec.get("name_en")
    for field in ("name_en", "valid_from", "valid_to", "sources", "confidence", "geometry"):
        if field not in spec:
            raise ComposeError(f"state {name}: missing {field}")
    if not spec["geometry"].get("union"):
        raise ComposeError(f"state {name}: geometry needs a union")
    if spec["confidence"] not in CONFIDENCE:
        raise ComposeError(f"state {name}: confidence must be one of {sorted(CONFIDENCE)}")
    if not spec["sources"] or not all(str(s).startswith("http") for s in spec["sources"]):
        raise ComposeError(f"state {name}: sources must be a nonempty list of URLs")
    role = spec.get("color")
    if role is not None and role not in COLOR_ROLES:
        raise ComposeError(f"state {name}: color must be one of {sorted(COLOR_ROLES)}")


def check_overlaps(names: list[str], geoms: list) -> None:
    tree = STRtree(geoms)
    for i, j in zip(*tree.query(geoms, predicate="intersects"), strict=True):
        if i < j:
            common = _clean_polygonal(geoms[i].intersection(geoms[j]))
            area = 0.0 if common.is_empty else area_km2(common)
            if area >= MIN_OVERLAP_KM2:
                raise ComposeError(
                    f"{names[i]} and {names[j]} overlap by {area:.0f} km²; "
                    "subtract one from the other in the spec"
                )


def as_coverage(geoms: list) -> list:
    """Node all borders, then give each face to its state: neighbours share exact edges."""
    linework = shapely.union_all([g.boundary for g in geoms])
    faces = list(shapely.get_parts(shapely.polygonize(list(shapely.get_parts(linework)))))
    points = [face.representative_point() for face in faces]
    owned: list[list] = [[] for _ in geoms]
    for face, point in zip(faces, points, strict=True):
        for index, geom in enumerate(geoms):
            if geom.covers(point):
                owned[index].append(face)
                break
    return [shapely.union_all(parts) if parts else Polygon() for parts in owned]


def compose(plate: str, spec_path: Path) -> dict:
    spec = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
    slug = spec.get("slug") or spec_path.stem
    states = spec.get("states")
    if not states:
        raise ComposeError("spec has no states")
    for state in states:
        check_state(state)
    meta = json.loads((PLATES_DIR / f"{plate}.json").read_text(encoding="utf-8"))
    tolerance = meta["pixel_size_m"] * TOLERANCE_PX
    land = _load_land(meta)
    simple_land = _clean_polygonal(shapely.simplify(land, tolerance))
    parts = Parts(plate)
    names = [state["name_en"] for state in states]
    if len(set(names)) != len(names):
        raise ComposeError(f"duplicate state names: {names}")
    clipped = [_clean_polygonal(parts.state(state).intersection(simple_land)) for state in states]
    for name, geom in zip(names, clipped, strict=True):
        if geom.is_empty:
            raise ComposeError(f"state {name} has no land on plate {plate}")
    check_overlaps(names, clipped)
    covered = as_coverage(clipped)
    arr = np.array(covered, dtype=object)
    coverage_valid = bool(shapely.coverage_is_valid(arr))
    if not coverage_valid:
        raise ComposeError("borders did not form a valid coverage; check the spec's polygons")
    simplified = list(shapely.coverage_simplify(arr, tolerance, simplify_boundary=False))
    licensed = "CC-BY-4.0" if "CC-BY-4.0" in parts.licenses.values() else "CC0-1.0"
    props = []
    for state in states:
        kebab = re.sub(r"[^a-z0-9]+", "-", state["name_en"].casefold()).strip("-")
        props.append(
            {
                "id": f"custom-{slug}-{kebab}",
                "name_en": state["name_en"],
                "valid_from": iso(str(state["valid_from"])),
                "valid_to": iso(str(state["valid_to"])),
                "source": "custom",
                "source_ref": state["sources"][0],
                "sources": state["sources"],
                "license": licensed,
                "confidence": state["confidence"],
                "approximate": state.get("approximate", True),
                "notes": state.get("notes", ""),
                **({"color_role": state["color"]} if state.get("color") else {}),
            }
        )
    features_out, conflicts = build_features(props, simplified, meta)
    collection = {"type": "FeatureCollection", "features": features_out}
    lines, keys = [], set()
    for layer in sorted(parts.licenses):
        report = PROCESSED_DIR / plate / "historical" / f"{layer}.report.json"
        lines += json.loads(report.read_text(encoding="utf-8"))["attribution"]["lines"]
    lines = list(dict.fromkeys(lines))
    for key, (_, text, _) in hist_attribution.SOURCES.items():
        if text in lines:
            keys.add(key)
    lines += [f"{state['name_en']}: {', '.join(state['sources'])}" for state in states]
    credit = hist_attribution.short_credit(hist_attribution.CUSTOM_CREDIT, keys)
    qa = coast_report(simplified, land, meta) | {
        "features": len(features_out),
        "coverage_valid": coverage_valid,
        "simplify": "coverage_simplify",
        "overlaps": [],
        "overlap_kinds": {},
        "palette_conflicts": conflicts,
        "confidence": dict(Counter(state["confidence"] for state in states)),
    }
    report = {
        "plate": plate,
        "slug": slug,
        "source": "custom",
        "spec": spec_path.name,
        "layers_used": sorted(parts.licenses),
        "qa": qa,
        "attribution": {"credit": credit, "lines": lines},
    }
    text = save_layer(collection, report, plate, slug, credit, lines)
    (PROCESSED_DIR / plate / "historical" / f"{slug}.sources.md").write_text(
        "".join(
            f"# {state['name_en']}\n\nConfidence: {state['confidence']}\n\n"
            + "".join(f"- {source}\n" for source in state["sources"])
            + "\n"
            for state in states
        ),
        encoding="utf-8",
    )
    return report | {"bytes": len(text.encode("utf-8"))}
