import { describe, expect, it } from "vitest";
import {
  distanceKm,
  grammarIssues,
  highlightIssues,
  insideRing,
  labelReachIssues,
  LABEL_REACH_KM,
  MIN_HIGHLIGHT_SHARE,
  onScreenText,
  reachKm,
  serviceNoteIssues,
  subjectIssues,
} from "./grammar";

const NILE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [32.9, 24],
          [31.2, 30],
          [30.4, 31.4],
        ],
      },
    },
  ],
};
const BOX = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [30, 25],
        [34, 25],
        [34, 29],
        [30, 29],
        [30, 25],
      ],
    ],
  },
};
const river = { id: "nile", type: "RiverLine", props: { geojson: NILE } };
const area = {
  id: "mask",
  type: "RegionHighlight",
  props: { geojson: BOX, color: "regionA", dimOutside: true },
};
const label = (id: string, lonLat: [number, number], extra = {}) => ({
  id,
  type: "PlaceLabel",
  props: { lonLat, text: id, kind: "region", ...extra },
});
const shot = (id: string, layers: unknown[], extra = {}) => ({
  id,
  layers: layers as never[],
  subject: [30, 25, 34, 29] as [number, number, number, number],
  ...extra,
});

describe("geometry", () => {
  it("measures a degree of latitude at about 111 km", () => {
    expect(distanceKm([30, 25], [30, 26])).toBeCloseTo(111.2, 0);
    expect(distanceKm([30, 25], [30, 25])).toBe(0);
  });
  it("counts a point on an area as standing on it", () => {
    const ring = BOX.geometry.coordinates[0] as [number, number][];
    expect(insideRing([32, 27], ring)).toBe(true);
    expect(insideRing([40, 27], ring)).toBe(false);
    expect(reachKm([32, 27], [area])).toBe(0);
  });
  it("measures a label to the nearest drawn thing, not to a bounding box", () => {
    // On the river's own course.
    expect(reachKm([32.9, 24], [river])).toBe(0);
    // Inside the river's bounding box but far from the water.
    expect(reachKm([34.5, 27], [river])).toBeGreaterThan(200);
    expect(reachKm([0, 0], [])).toBe(Infinity);
  });
});

describe("labels belong on what they name", () => {
  it("passes a label on its subject and fails one adrift", () => {
    expect(labelReachIssues({ shots: [shot("a", [river, label("nile-name", [32.9, 24])])] })).toEqual([]);
    const adrift = labelReachIssues({
      shots: [shot("a", [river, label("delta", [29.5, 30.35])])],
    });
    expect(adrift).toHaveLength(1);
    expect(adrift[0].message).toMatch(/delta sits \d+ km/);
    expect(adrift[0].message).toContain(String(LABEL_REACH_KM));
  });
  it("accepts a leader to the subject, and open ground declared as such", () => {
    expect(
      labelReachIssues({
        shots: [
          shot("a", [river, label("delta", [29.5, 30.35], { leader: [30.4, 31.4] })]),
        ],
      }),
    ).toEqual([]);
    expect(
      labelReachIssues({
        shots: [shot("a", [river, label("desert", [27.5, 25.2], { openGround: true })])],
      }),
    ).toEqual([]);
  });
});

describe("working notes never reach the screen", () => {
  it("rejects an editorial aside and keeps honest disclosure", () => {
    const issues = serviceNoteIssues({
      shots: [shot("a", [label("water", [32, 27], { text: "Water (our reading)" })])],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("our reading");
    for (const text of [
      "Ethiopian highlands (approximate)",
      "Floods ended (one account)",
      "Sediment retained (older study)",
      "Almost no rain (FAO estimate)",
    ])
      expect(
        serviceNoteIssues({ shots: [shot("a", [label("x", [32, 27], { text })])] }),
      ).toEqual([]);
  });
  it("does not read geometry or styling as screen text", () => {
    expect(onScreenText({ geojson: NILE, kind: "region", text: "Delta" })).toEqual(["Delta"]);
  });
});

describe("a share or an area has to be shown", () => {
  const card = (text: string) => ({
    id: "card",
    type: "KeyFact",
    props: { statement: text, emphasis: "4%" },
  });
  const filler = Array.from({ length: 3 }, (_, i) => shot(`f${i}`, [area]));
  it("fails a percentage stated over an unmarked map", () => {
    const issues = highlightIssues({
      shots: [shot("shares", [river, card("About 4% of the land")]), ...filler],
    });
    expect(issues.some((i) => i.message.includes("shares"))).toBe(true);
  });
  it("passes once the ground is marked with dimOutside", () => {
    expect(
      highlightIssues({
        shots: [shot("shares", [area, card("About 4% of the land")]), ...filler],
      }),
    ).toEqual([]);
  });
  it("a highlight without dimOutside does not count for the claim", () => {
    const faint = { ...area, props: { ...area.props, dimOutside: false } };
    expect(
      highlightIssues({
        shots: [shot("shares", [faint, card("About 4% of the land")]), ...filler],
      }).some((i) => i.message.includes("shares")),
    ).toBe(true);
  });
  it("fails an episode that never marks an area", () => {
    const issues = highlightIssues({
      shots: Array.from({ length: 8 }, (_, i) => shot(`s${i}`, [river])),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain(
      `${Math.round(MIN_HIGHLIGHT_SHARE * 100)}%`,
    );
  });
});

describe("every shot says what it is about", () => {
  it("fails a shot with no subject", () => {
    const issues = subjectIssues({ shots: [{ id: "open", layers: [] }] });
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("$.shots[0].subject");
  });
  it("collects every rule in one pass", () => {
    const issues = grammarIssues({
      shots: [{ id: "open", layers: [label("water", [29.5, 30.35], { text: "Water (our reading)" })] }],
    });
    expect(issues.map((i) => i.path)).toContain("$.shots[0].subject");
    expect(issues.some((i) => i.message.includes("our reading"))).toBe(true);
  });
});
