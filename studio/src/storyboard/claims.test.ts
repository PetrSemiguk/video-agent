import { describe, expect, test } from "vitest";
import { claimIssues, needsClaim } from "./claims";
import { storyboardSchema } from "./schema";

const layer = (
  type: string,
  props: Record<string, unknown>,
  claims?: string[],
) => ({
  id: "x",
  type,
  props,
  ...(claims ? { claims } : {}),
});
const facts = "| C01 | A claim. |\n| F12 | Another. |";
const issues = (one: ReturnType<typeof layer>) =>
  claimIssues({ shots: [{ layers: [one] }] }, facts);

describe("text on screen needs a claim", () => {
  test.each([
    ["BigDate", { year: 589 }],
    ["StatCounter", { value: 5, label: "linked" }],
    ["LowerThird", { title: "Grand Canal" }],
    ["KeyFact", { statement: "A fact", emphasis: "fact" }],
  ])("%s always does", (type, props) => {
    expect(needsClaim(layer(type, props))).toBe(true);
    expect(issues(layer(type, props))[0].message).toMatch(/needs a claim id/);
    expect(issues(layer(type, props, ["C01"]))).toEqual([]);
  });
  test("place names and navigation do not, unless they carry a number", () => {
    expect(
      needsClaim(layer("PlaceLabel", { text: "Beijing", kind: "city" })),
    ).toBe(false);
    expect(needsClaim(layer("SectionTag", { text: "The Water" }))).toBe(false);
    expect(
      needsClaim(
        layer("PlaceLabel", { text: "Above 4,000 m", kind: "region" }),
      ),
    ).toBe(true);
    expect(needsClaim(layer("SectionTag", { text: "About 560 CE" }))).toBe(
      true,
    );
  });
  test("a route needs one only with a label, and its geometry and credit do not count", () => {
    const geojson = { features: [{ properties: { length_km: 1363 } }] };
    expect(needsClaim(layer("RouteLine", { geojson, credit: "Route 2" }))).toBe(
      false,
    );
    expect(
      needsClaim(
        layer("RouteLine", {
          geojson,
          credit: "c",
          label: { text: "Yuan", lonLat: [1, 2] },
        }),
      ),
    ).toBe(true);
  });
  test("credits and footage are exempt", () => {
    expect(needsClaim(layer("MapAttribution", { text: "Imagery 2004" }))).toBe(
      false,
    );
  });
  test("a claim id must exist in facts.md as a whole word", () => {
    expect(issues(layer("BigDate", { year: 589 }, ["C99"]))[0].message).toMatch(
      /C99 .* not in facts/,
    );
    expect(issues(layer("BigDate", { year: 589 }, ["F1"])).length).toBe(1);
  });
  test("the schema accepts claim ids on any layer and refuses malformed ones", () => {
    const shot = (claims: unknown) => ({
      schemaVersion: 1,
      episode: { slug: "a", title: "A", language: "en", fps: 30 },
      plates: [{ id: "p", name: "n" }],
      audio: { src: "a.wav", words: "w.json" },
      shots: [
        {
          id: "s",
          plate: "p",
          start: { time: 0 },
          end: { time: 1 },
          camera: { preset: "drift", params: {} },
          layers: [{ id: "l", type: "BigDate", props: { year: 589 }, claims }],
        },
      ],
    });
    expect(storyboardSchema.safeParse(shot(["F06", "M04"])).success).toBe(true);
    expect(storyboardSchema.safeParse(shot(["bad id"])).success).toBe(false);
    expect(storyboardSchema.safeParse(shot([])).success).toBe(false);
  });
});
