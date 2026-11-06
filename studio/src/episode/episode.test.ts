import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement, Fragment, type ReactNode } from "react";
import { createRequire } from "node:module";
import { componentRegistry } from "../components/registry";
import { MapAttribution } from "../components/MapAttribution";
import { CombinedAttributionScope } from "../map/AttributionContext";
import story from "../../../episodes/_sandbox/tts-test/storyboard.json";
import timing from "../../../episodes/_sandbox/tts-test/assembly.json";
import words from "../storyboard/__fixtures__/tts-test-words.json";
import plate from "../../public/plates/china-east-hs05.json";
import type { PlateMeta } from "../geo/plate";
import {
  compilePlan,
  creditsAt,
  geoLayerTypes,
  labelRanges,
  layerFrames,
  layerProps,
  naturalEarthLayers,
  textLayerTypes,
  transitionFrames,
  wordsSchema,
} from "./plan";
import { verifyEpisodeCamera } from "./camera";
import { pcmWavInfo } from "./wav";
import { calculateEpisodeMetadata } from "./metadata";
import { motion } from "../design/tokens";

// Test-only server helper from the existing React DOM runtime.
const renderToStaticMarkup = createRequire(import.meta.url)("react-dom/server")
  .renderToStaticMarkup as (node: ReactNode) => string;

const wav = (seconds = 2) => {
  const result = new ArrayBuffer(44 + seconds * 24000 * 2),
    view = new DataView(result);
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, result.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, result.byteLength - 44, true);
  return result;
};
afterEach(() => vi.unstubAllGlobals());
describe("Episode assembly", () => {
  it("combines both visible plate credits through an overlap, without duplicate source strings", () => {
    const plan = compilePlan(story, timing, 743);
    plan.storyboard.plates.push({ id: "second", name: "second" });
    plan.storyboard.shots[1].plate = "second";
    const metas = {
      china: plate as unknown as PlateMeta,
      second: {
        ...plate,
        attribution: {
          ...plate.attribution,
          on_screen: "Second licensed source",
        },
      } as unknown as PlateMeta,
    };
    const text = creditsAt(plan.storyboard, plan.assembly, metas, 113);
    expect(text).toContain("Second licensed source");
    expect(text).toContain(plate.attribution.on_screen);
    expect(creditsAt(plan.storyboard, plan.assembly, metas, 150)).toBe(
      "Second licensed source",
    );
  });
  it("keeps ordinary inline credits, but emits one combined overlay outside scene transitions", () => {
    const inline = createElement(MapAttribution, { text: "Source credit" });
    expect(renderToStaticMarkup(inline)).toContain("Source credit");
    const markup = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(CombinedAttributionScope, { children: [inline, inline] }),
        inline,
      ),
    );
    expect(markup.match(/Source credit/g)).toHaveLength(1);
  });
  it("accepts the supplied frame plan and enforces actual component durations", () => {
    const plan = compilePlan(story, timing, 743);
    const props = layerProps(plan.storyboard.shots[0].layers[0], 101);
    expect(props).toHaveProperty("durationInFrames", 101);
    expect(wordsSchema.parse(words).words).toHaveLength(78);
  });
  it("holds map layers through the outgoing transition, and nothing else", () => {
    const layer = (type: string) =>
      ({ type }) as Parameters<typeof layerFrames>[0];
    const toEnd = { from: 20, durationInFrames: 80 };
    const earlier = { from: 20, durationInFrames: 50 };
    for (const type of geoLayerTypes)
      expect(layerFrames(layer(type), toEnd, 100, 14)).toBe(94);
    expect(layerFrames(layer("RiverLine"), earlier, 100, 14)).toBe(50);
    expect(layerFrames(layer("PlaceLabel"), toEnd, 100, 14)).toBe(80);
    expect(layerFrames(layer("RiverLine"), toEnd, 100, 0)).toBe(80);
  });
  it("classifies every registered component as map, text or deliberately neither", () => {
    // MapAttribution is on every map frame and secondary; BRollClip carries no text of ours.
    const neither = new Set(["BRollClip", "MapAttribution"]);
    for (const type of Object.keys(componentRegistry))
      expect(
        [geoLayerTypes, textLayerTypes, neither].filter((set) => set.has(type))
          .length,
        `${type} is map, text or listed as neither`,
      ).toBe(1);
  });
  it("lists the frames where a text layer is on screen, merged", () => {
    const plan = compilePlan(story, timing, 743);
    const ranges = labelRanges(plan.storyboard, plan.assembly);
    expect(ranges.length).toBeGreaterThan(0);
    ranges.forEach(([a, b], i) => {
      expect(b).toBeGreaterThan(a);
      if (i) expect(a).toBeGreaterThan(ranges[i - 1][1]);
    });
    const bare = structuredClone(plan.storyboard);
    bare.shots.forEach(
      (shot) =>
        (shot.layers = shot.layers.filter((l) => !textLayerTypes.has(l.type))),
    );
    expect(labelRanges(bare, plan.assembly)).toEqual([]);
  });
  it("preserves absolute starts despite outgoing transition overlaps", () => {
    const plan = compilePlan(story, timing, 743);
    let cursor = 0;
    const starts = plan.storyboard.shots.map((shot, i) => {
      const start = cursor,
        overlap = transitionFrames(shot);
      cursor += plan.assembly.shots[i].durationInFrames + overlap;
      cursor -= overlap;
      return start;
    });
    expect(starts).toEqual([0, 101, 239, 358, 469, 581]);
    expect(cursor).toBe(743);
  });
  it("requires explicit complete, in-order, contained windows and audio coverage", () => {
    expect(() => compilePlan(story, timing, 744)).toThrow("measured WAV");
    const gap = structuredClone(timing);
    gap.shots[1].from++;
    expect(() => compilePlan(story, gap, 743)).toThrow("contiguous");
    const layer = structuredClone(timing);
    layer.shots[0].layers[0].durationInFrames = 102;
    expect(() => compilePlan(story, layer, 743)).toThrow("out-of-shot");
    const short = structuredClone(timing);
    short.shots[0].layers[0].durationInFrames = 10;
    expect(() => compilePlan(story, short, 743)).toThrow();
  });
  it("rejects incomplete, unordered or out-of-audio word data", () => {
    expect(wordsSchema.safeParse({ ...words, complete: false }).success).toBe(
      false,
    );
    const invalid = structuredClone(words);
    invalid.words[1].start = 0;
    expect(wordsSchema.safeParse(invalid).success).toBe(false);
  });
  it("routes geographic SVG layers separately from screen labels", () => {
    expect([...geoLayerTypes]).toEqual([
      "RegionHighlight",
      "RiverLine",
      "RouteLine",
      "HistoricalLayer",
      "ArrowAdvance",
      "ArrowRetreat",
    ]);
    expect(geoLayerTypes.has("PlaceLabel")).toBe(false);
    // An advance or retreat arrow is a course of our own, so it adds no Natural Earth credit.
    expect(naturalEarthLayers.has("ArrowAdvance")).toBe(false);
    expect(naturalEarthLayers.has("ArrowRetreat")).toBe(false);
    expect([...naturalEarthLayers].every((t) => geoLayerTypes.has(t))).toBe(
      true,
    );
  });
  it("checks all sample camera frames and overlapping old/new plates", () => {
    const plan = compilePlan(story, timing, 743);
    const metas = {
      china: plate as unknown as PlateMeta,
      second: { ...plate, name: "second" } as unknown as PlateMeta,
    };
    const report = verifyEpisodeCamera(
      plan.storyboard,
      plan.assembly,
      metas,
      1920,
      1080,
    );
    expect(
      report.every((r) =>
        r.reports.every((p) => p.minMargin >= 2 && p.maxMag <= 1),
      ),
    ).toBe(true);
    plan.storyboard.plates.push({ id: "second", name: "second" });
    plan.storyboard.shots[1].plate = "second";
    expect(
      verifyEpisodeCamera(plan.storyboard, plan.assembly, metas, 1920, 1080)[0]
        .reports,
    ).toHaveLength(2);
  });
  it("matches the sample WAV contract using bytes independent of ignored local media", () => {
    expect(pcmWavInfo(wav())).toEqual({
      sampleRate: 24000,
      samples: 48000,
      duration: 2,
    });
    expect(() => pcmWavInfo(wav().slice(0, 30))).toThrow("Truncated");
    const invalid = wav();
    new DataView(invalid).setUint16(22, 2, true);
    expect(() => pcmWavInfo(invalid)).toThrow();
  });
  it("calculateMetadata derives duration from WAV and binds the exact alignment hash", async () => {
    const bytes = wav();
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const singleStory = structuredClone(story);
    singleStory.shots = singleStory.shots.slice(0, 1);
    delete singleStory.shots[0].transition;
    const inputProps = {
      storyboard: singleStory,
      words: {
        complete: true,
        duration: 2,
        audio_sha256: hash,
        words: [
          { index: 0, text: "China", start: 0, end: 1, status: "matched" },
        ],
      },
      timing: {
        shots: [
          {
            id: "opening",
            from: 0,
            durationInFrames: 60,
            layers: [{ id: "title", from: 0, durationInFrames: 60 }],
          },
        ],
      },
      audioSrc: "episodes/test/voice.wav",
    };
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(url.includes(".wav") ? bytes : JSON.stringify(plate)),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await calculateEpisodeMetadata({
      props: inputProps,
      defaultProps: inputProps,
      abortSignal: new AbortController().signal,
      compositionId: "Episode",
      isRendering: true,
    });
    expect(result.durationInFrames).toBe(2 * motion.fps);
    inputProps.words.audio_sha256 = "0".repeat(64);
    await expect(
      calculateEpisodeMetadata({
        props: inputProps,
        defaultProps: inputProps,
        abortSignal: new AbortController().signal,
        compositionId: "Episode",
        isRendering: true,
      }),
    ).rejects.toThrow("mismatch");
  });
  it("keeps the authored storyboard unchanged by runtime scheduling", () => {
    expect(
      JSON.parse(
        readFileSync("../episodes/_sandbox/tts-test/storyboard.json", "utf8"),
      ),
    ).toEqual(story);
    expect(
      compilePlan(story, timing, 743).storyboard.shots[0].layers[0].props,
    ).toHaveProperty("durationInFrames");
    expect(story.shots[0].layers[0].props).not.toHaveProperty(
      "durationInFrames",
    );
  });
});
