import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { cameraSchema } from "../../storyboard/schema";
import { infoLayer, routeLine } from "../../design/tokens";
import { statCounterSchema } from "../info/StatCounter";
import { arrowFractions, branchProgress, routeLineSchema } from "./RouteLine";
import { historicalLayerSchema, riverLineSchema } from "./schemas";

const line = (cumfrac: number[], coordinates: [number, number][]) => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { cumfrac },
      geometry: { type: "LineString", coordinates },
    },
  ],
});
const route = line(
  [0, 1],
  [
    [100, 30],
    [101, 31],
  ],
);

describe("RouteLine", () => {
  test("branches draw one after another, each by its share of the length", () => {
    expect(branchProgress([300, 100], 0)).toEqual([0, 0]);
    expect(branchProgress([300, 100], 0.375)).toEqual([0.5, 0]);
    expect(branchProgress([300, 100], 0.75)).toEqual([1, 0]);
    expect(branchProgress([300, 100], 0.875)).toEqual([1, 0.5]);
    expect(branchProgress([300, 100], 1)).toEqual([1, 1]);
  });
  test("arrows are evenly spaced, and a short route still gets one", () => {
    expect(arrowFractions(10)).toEqual([0.5]);
    const many = arrowFractions(routeLine.arrowEveryKm * 4);
    expect(many).toEqual([0.125, 0.375, 0.625, 0.875]);
  });
  test("needs a credit and valid cumfrac, and defaults to a solid line", () => {
    const ok = routeLineSchema.parse({ geojson: route, credit: "Route: ours" });
    expect(ok.style).toBe("solid");
    expect(routeLineSchema.safeParse({ geojson: route }).success).toBe(false);
    for (const cumfrac of [
      [0, 0.5],
      [0.2, 1],
      [0, 0.5, 1],
    ])
      expect(
        routeLineSchema.safeParse({
          geojson: line(cumfrac, route.features[0].geometry.coordinates),
          credit: "c",
        }).success,
      ).toBe(false);
    expect(
      routeLineSchema.safeParse({
        geojson: route,
        credit: "c",
        style: "dotted",
      }).success,
    ).toBe(false);
  });
  test("accepts the committed canal routes, Y-shaped Sui included", () => {
    for (const slug of ["grand-canal-sui", "grand-canal-yuan"]) {
      const geojson = JSON.parse(
        readFileSync(
          `../data/processed/china-east-hs05/routes/${slug}.geojson`,
          "utf8",
        ),
      );
      expect(
        routeLineSchema.safeParse({ geojson, credit: "c" }).success,
        slug,
      ).toBe(true);
    }
  });
});

describe("other map and card contracts of the visual grammar", () => {
  test("hold may give a reason, and other params stay rejected", () => {
    for (const params of [{}, { reason: "The date is read" }])
      expect(cameraSchema.safeParse({ preset: "hold", params }).success).toBe(
        true,
      );
    expect(
      cameraSchema.safeParse({ preset: "hold", params: { reason: "" } })
        .success,
    ).toBe(false);
  });
  test("a river can start partly drawn, never fully", () => {
    const geojson = line(
      [0, 1],
      [
        [100, 30],
        [101, 31],
      ],
    );
    expect(riverLineSchema.parse({ geojson }).fromFraction).toBe(0);
    expect(
      riverLineSchema.safeParse({ geojson, fromFraction: 1 }).success,
    ).toBe(false);
  });
  test("a historical layer can show chosen features in one color and fade out", () => {
    const parsed = historicalLayerSchema.parse({
      slug: "china-592-cliopatria",
      credit: "c",
      only: ["cliopatria-sui-dynasty-592"],
      color: "regionA",
      exitAt: 10,
    });
    expect(parsed.exitFrames).toBeGreaterThan(0);
    expect(
      historicalLayerSchema.safeParse({ slug: "a", credit: "c", only: [] })
        .success,
    ).toBe(false);
  });
  test("a stat takes a unit, a meaning and a date on its own line", () => {
    const stat = statCounterSchema.parse({
      value: 5,
      unit: "river systems",
      label: "linked by the Grand Canal",
      date: "By the 13th century",
    });
    expect(stat.unit).toBe("river systems");
    expect(
      statCounterSchema.safeParse({
        value: 5,
        label: "x",
        unit: "W".repeat(infoLayer.limits.statUnit + 1),
      }).success,
    ).toBe(false);
    expect(
      statCounterSchema.safeParse({
        value: 5,
        label: "x",
        date: "W".repeat(infoLayer.limits.statDate + 1),
      }).success,
    ).toBe(false);
  });
});
