// Visual-grammar rules the validator enforces on a storyboard, beyond the per-layer schemas.
// Pure: it reads the authored JSON and nothing else, so the tests can state each rule directly.
// The rules themselves are written out in docs/visual-grammar.md.

/** Layers that mark an area, as against a line or a label. */
export const HIGHLIGHT_TYPES = new Set(["RegionHighlight", "HistoricalLayer"]);
/** Layers whose geometry a label may stand on. */
const DRAWN_TYPES = new Set([
  "RegionHighlight",
  "RiverLine",
  "RouteLine",
  "ArrowAdvance",
  "ArrowRetreat",
]);
/**
 * On-screen text that states a share or an area. Such a shot must show the area it is about:
 * a number over an unmarked map leaves the viewer to guess which ground it means.
 */
const AREA_TEXT =
  /\d\s*%|\bpercent\b|\bshares?\b|\bof the (land|country|people)\b|km²|per km|square (kilomet|mile)/i;
/**
 * Working notes that must never reach the screen. Honest disclosures are not notes and stay
 * required: "approximate", "estimate", "one account", "older study", "(FAO)" and the like.
 */
const SERVICE_NOTES =
  /\b(our reading|ours|TODO|TBD|FIXME|WIP|XXX|placeholder|lorem|tbc)\b/i;
/** Keys whose string values are not on-screen text. */
const NOT_TEXT = new Set([
  "geojson",
  "line",
  "path",
  "slug",
  "kind",
  "anchor",
  "color",
  "style",
  "placement",
  "credit",
  "only",
  "nodeAnchors",
  "errataOverride",
]);
/** How far from what it names a label may sit, in km, before it needs a leader. */
export const LABEL_REACH_KM = 40;
/** Share of an episode's shots that must mark an area. Below this the map is only ever lines. */
export const MIN_HIGHLIGHT_SHARE = 0.25;

type Layer = {
  id: string;
  type: string;
  props: Record<string, unknown>;
};
type Shot = { id: string; layers: Layer[]; subject?: unknown };
type Story = { shots: Shot[] };
export type Issue = { path: string; message: string };

export const onScreenText = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(onScreenText);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) =>
      NOT_TEXT.has(key) ? [] : onScreenText(item),
    );
  return [];
};

const EARTH_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;
/** Great-circle distance in km. */
export const distanceKm = (
  a: [number, number],
  b: [number, number],
): number => {
  const [dLon, dLat] = [toRad(b[0] - a[0]), toRad(b[1] - a[1])];
  const lat = toRad((a[1] + b[1]) / 2);
  return EARTH_KM * Math.hypot(dLon * Math.cos(lat), dLat);
};

/**
 * Every lon/lat a layer draws. It walks the GeoJSON structure rather than every array it can
 * find: `properties.cumfrac` is also an array of numbers, and must not be read as a position.
 * A bare array of pairs, as `ArrowAdvance.path` carries, is taken as it is.
 */
const coordinates = (value: unknown): [number, number][] => {
  const out: [number, number][] = [];
  const positions = (node: unknown): void => {
    if (Array.isArray(node) && typeof node[0] === "number")
      out.push([node[0], node[1] as number]);
    else if (Array.isArray(node)) node.forEach(positions);
  };
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.features)) record.features.forEach(visit);
    else if (record.geometry) visit(record.geometry);
    else if (record.coordinates !== undefined) positions(record.coordinates);
  };
  if (Array.isArray(value)) positions(value);
  else visit(value);
  return out;
};

/** Rings of every Polygon/MultiPolygon in a GeoJSON value. */
const rings = (value: unknown): [number, number][][] => {
  const out: [number, number][][] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.features)) record.features.forEach(visit);
    else if (record.geometry) visit(record.geometry);
    else if (record.type === "Polygon")
      (record.coordinates as [number, number][][]).forEach((ring) =>
        out.push(ring),
      );
    else if (record.type === "MultiPolygon")
      (record.coordinates as [number, number][][][]).forEach((polygon) =>
        polygon.forEach((ring) => out.push(ring)),
      );
  };
  visit(value);
  return out;
};

/** Ray casting; a point on an area counts as standing on it. */
export const insideRing = (
  point: [number, number],
  ring: [number, number][],
): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
};

/**
 * Geometry a layer draws. `HistoricalLayer` keeps its polygons in a file under the plate, so the
 * caller passes a resolver; without one that layer is simply invisible to the reach rule.
 */
export type GeometryOf = (layer: Layer) => unknown;

/** Distance from a label to the nearest thing its shot draws, 0 when it stands on an area. */
export const reachKm = (
  point: [number, number],
  layers: Layer[],
  geometryOf?: GeometryOf,
): number => {
  let best = Infinity;
  for (const layer of layers) {
    const resolved = geometryOf?.(layer);
    if (!DRAWN_TYPES.has(layer.type) && resolved === undefined) continue;
    const geometry = resolved ?? layer.props.geojson ?? layer.props.path;
    if (geometry === undefined) continue;
    for (const ring of rings(geometry)) if (insideRing(point, ring)) return 0;
    for (const vertex of coordinates(geometry))
      best = Math.min(best, distanceKm(point, vertex));
  }
  return best;
};

/** Every shot says what it is about, so the camera check can frame it. */
export const subjectIssues = (story: Story): Issue[] =>
  story.shots.flatMap((shot, s) =>
    shot.subject === undefined
      ? [
          {
            path: `$.shots[${s}].subject`,
            message: `Shot ${shot.id} does not say what it is about; give it subject bounds so the framing can be checked`,
          },
        ]
      : [],
  );

/** A working note on screen is never acceptable, whatever else the layer gets right. */
export const serviceNoteIssues = (story: Story): Issue[] => {
  const issues: Issue[] = [];
  story.shots.forEach((shot, s) =>
    shot.layers.forEach((layer, l) => {
      for (const text of onScreenText(layer.props)) {
        const found = SERVICE_NOTES.exec(text);
        if (found)
          issues.push({
            path: `$.shots[${s}].layers[${l}].props`,
            message: `Layer ${layer.id} puts the working note "${found[0]}" on screen; say what the map shows instead`,
          });
      }
    }),
  );
  return issues;
};

/** A label belongs on the thing it names, or points at it. */
export const labelReachIssues = (
  story: Story,
  geometryOf?: GeometryOf,
): Issue[] => {
  const issues: Issue[] = [];
  story.shots.forEach((shot, s) =>
    shot.layers.forEach((layer, l) => {
      if (layer.type !== "PlaceLabel" || layer.props.openGround) return;
      const anchor = (layer.props.leader ?? layer.props.lonLat) as
        | [number, number]
        | undefined;
      if (!anchor) return;
      const km = reachKm(anchor, shot.layers, geometryOf);
      if (km > LABEL_REACH_KM)
        issues.push({
          path: `$.shots[${s}].layers[${l}].props.lonLat`,
          message: `Label ${layer.id} sits ${Math.round(km)} km from anything this shot draws (limit ${LABEL_REACH_KM} km); move it onto its subject, give it a leader, or mark it openGround`,
        });
    }),
  );
  return issues;
};

/** A share or an area on screen has to be shown on the map, not only stated. */
export const highlightIssues = (story: Story): Issue[] => {
  const issues: Issue[] = [];
  let withHighlight = 0;
  story.shots.forEach((shot, s) => {
    const highlights = shot.layers.filter((l) => HIGHLIGHT_TYPES.has(l.type));
    if (highlights.length) withHighlight++;
    const states = shot.layers.filter((l) =>
      onScreenText(l.props).some((text) => AREA_TEXT.test(text)),
    );
    if (!states.length) return;
    if (!highlights.some((l) => l.props.dimOutside === true))
      issues.push({
        path: `$.shots[${s}].layers`,
        message: `Shot ${shot.id} states a share or an area (${states
          .map((l) => l.id)
          .join(", ")}) with no area marked on the map; add a highlight with dimOutside so the viewer sees which ground it means`,
      });
  });
  const share = story.shots.length ? withHighlight / story.shots.length : 1;
  if (share < MIN_HIGHLIGHT_SHARE)
    issues.push({
      path: "$.shots",
      message: `Only ${withHighlight} of ${story.shots.length} shots mark an area (${Math.round(
        share * 100,
      )}%, at least ${Math.round(MIN_HIGHLIGHT_SHARE * 100)}% expected); a map of lines and labels alone shows no ground`,
    });
  return issues;
};

export const grammarIssues = (
  story: Story,
  geometryOf?: GeometryOf,
): Issue[] => [
  ...subjectIssues(story),
  ...serviceNoteIssues(story),
  ...labelReachIssues(story, geometryOf),
  ...highlightIssues(story),
];
