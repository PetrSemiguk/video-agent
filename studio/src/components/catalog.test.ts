import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { renderComponentCatalog } from "./catalog";
import { componentRegistry } from "./registry";
import { titleCardSchema } from "./cards/TitleCard";
import { endCardSchema } from "./cards/EndCard";
import { bRollClipSchema } from "./media/BRollClip";
import {
  regionHighlightSchema,
  riverLineSchema,
  placeLabelSchema,
} from "./map/schemas";
import { brollAssets } from "../media/broll";
import { cards, motion } from "../design/tokens";
import { dipOpacity, sceneTransition, transitionSchema } from "../transitions";
import { showreelTransitions } from "../demo/Showreel";

test("catalog exactly matches every registered Zod schema and description", () => {
  const actual = readFileSync(path.resolve("../docs/components.md"), "utf8");
  for (const name of Object.keys(componentRegistry))
    expect(actual, name).toContain(`## ${name}\n`);
  expect(actual).toBe(renderComponentCatalog());
});
test("all public production component exports are registered", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : [path.join(dir, entry.name)],
    );
  const names = walk(path.resolve("src/components"))
    .filter(
      (file) =>
        file.endsWith(".tsx") && !/shared\.tsx$|GeoDebugOverlay/.test(file),
    )
    .flatMap((file) =>
      [
        ...readFileSync(file, "utf8").matchAll(
          /export const (\w+): React\.FC/g,
        ),
      ].map((match) => match[1]),
    );
  expect(names.sort()).toEqual(Object.keys(componentRegistry).sort());
});
test("card length limits and exact twenty-second end duration are enforced", () => {
  expect(
    titleCardSchema.safeParse({
      title: "W".repeat(cards.titleLimit),
      subtitle: "W".repeat(cards.subtitleLimit),
      kicker: "W".repeat(cards.kickerLimit),
    }).success,
  ).toBe(true);
  for (const field of ["title", "subtitle", "kicker"] as const) {
    const limit =
      field === "title"
        ? cards.titleLimit
        : field === "subtitle"
          ? cards.subtitleLimit
          : cards.kickerLimit;
    expect(
      titleCardSchema.safeParse({
        title: "Title",
        [field]: "W".repeat(limit + 1),
      }).success,
    ).toBe(false);
  }
  expect(
    endCardSchema.safeParse({
      title: "W".repeat(cards.endTitleLimit),
      subtitle: "W".repeat(cards.endSubtitleLimit),
    }).success,
  ).toBe(true);
  expect(
    endCardSchema.safeParse({ title: "W".repeat(cards.endTitleLimit + 1) })
      .success,
  ).toBe(false);
  expect(
    endCardSchema.safeParse({
      title: "Title",
      subtitle: "W".repeat(cards.endSubtitleLimit + 1),
    }).success,
  ).toBe(false);
  for (const durationInFrames of [cards.endDuration - 1, cards.endDuration + 1])
    expect(
      endCardSchema.safeParse({ title: "Title", durationInFrames }).success,
    ).toBe(false);
});
test("approved B-roll is bounded and cannot be replaced by a remote or arbitrary source", () => {
  const assetId = "pexels-earth-1851190";
  expect(
    bRollClipSchema.safeParse({
      assetId,
      trimBefore: 30,
      durationInFrames: 120,
    }).success,
  ).toBe(true);
  expect(
    bRollClipSchema.safeParse({
      assetId,
      trimBefore: 400,
      durationInFrames: 120,
    }).success,
  ).toBe(false);
  expect(
    bRollClipSchema.safeParse({ assetId, src: "https://example.com/video.mp4" })
      .success,
  ).toBe(false);
  expect(bRollClipSchema.safeParse({ assetId: "unlicensed" }).success).toBe(
    false,
  );
  const asset = brollAssets[assetId];
  expect(asset.provider).toBe("pexels");
  expect(asset.license).toBe("Pexels License");
  expect(asset.src).toMatch(/^broll\/[a-z0-9-]+\.mp4$/);
  expect(asset.originalSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(readFileSync(path.resolve("../docs/licenses.md"), "utf8")).toContain(
    "Pexels video 1851190",
  );
});
test("map runtime schemas accept actual processed data and reject malformed geometry/timings", () => {
  const load = (name: string) =>
    JSON.parse(
      readFileSync(
        path.resolve(`../data/processed/china-east-hs05/${name}`),
        "utf8",
      ),
    );
  const region = load("custom/heartland.geojson"),
    river = load("rivers/yellow.geojson");
  expect(
    regionHighlightSchema.safeParse({ geojson: region, color: "regionA" })
      .success,
  ).toBe(true);
  expect(riverLineSchema.safeParse({ geojson: river }).success).toBe(true);
  const broken = structuredClone(river);
  broken.features[0].properties.cumfrac[0] = 0.1;
  expect(riverLineSchema.safeParse({ geojson: broken }).success).toBe(false);
  expect(
    regionHighlightSchema.safeParse({ geojson: river, color: "regionA" })
      .success,
  ).toBe(false);
  expect(
    riverLineSchema.safeParse({ geojson: river, drawFrames: 0 }).success,
  ).toBe(false);
  expect(
    placeLabelSchema.safeParse({ lonLat: [200, 0], text: "City", kind: "city" })
      .success,
  ).toBe(false);
  expect(
    placeLabelSchema.safeParse({
      lonLat: [116, 39],
      text: "W".repeat(41),
      kind: "city",
    }).success,
  ).toBe(false);
});
test("showreel duration includes transition overlaps and final 20 seconds", () => {
  const sum = cards.showreel.scenes.reduce((a, b) => a + b, 0);
  const overlap = showreelTransitions.reduce(
    (a, t) => a + transitionSchema.parse(t).durationInFrames,
    0,
  );
  expect(sum - overlap).toBe(cards.showreel.content);
  expect(cards.showreel.content + cards.endDuration).toBe(
    cards.showreel.duration,
  );
  expect(cards.endDuration / motion.fps).toBe(20);
  for (const [i, t] of showreelTransitions.entries()) {
    const d = sceneTransition(t).timing.getDurationInFrames({
      fps: motion.fps,
    });
    expect(d).toBeLessThan(cards.showreel.scenes[i]);
    expect(d).toBeLessThan(cards.showreel.scenes[i + 1]);
  }
});
test("dip is dark at midpoint and restores endpoints", () => {
  expect(dipOpacity("exiting", 0)).toBe(1);
  expect(dipOpacity("entering", 0)).toBe(0);
  expect(dipOpacity("exiting", 0.5)).toBe(0);
  expect(dipOpacity("entering", 0.5)).toBe(0);
  expect(dipOpacity("entering", 1)).toBe(1);
  expect(dipOpacity("exiting", 1)).toBe(0);
});
test("end-screen reservations remain separate, safe and outside text", () => {
  const { video, subscribe } = cards.endZones;
  expect(cards.endWidth + cards.showreel.width * 0.05).toBeLessThan(video.x);
  expect(video.y + video.height).toBeLessThan(subscribe.y);
  for (const zone of [video, subscribe]) {
    expect(zone.x + zone.width).toBeLessThan(cards.showreel.width * 0.95);
    expect(zone.y + zone.height).toBeLessThan(cards.showreel.height * 0.88);
  }
});
