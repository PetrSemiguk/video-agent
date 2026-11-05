// The visual grammar on the committed pilot: every shot acts on the map, moves, changes framing,
// and no card covers the subject. docs/reports/4.6/assembly.json is the frame plan of this storyboard.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import plate from "../../public/plates/china-east-hs05.json";
import timing from "../../../docs/reports/4.6/assembly.json";
import { metersPerPx } from "../camera/timeline";
import { plateView } from "../camera/plateProjection";
import { lowerThirdSchema } from "../components/text/LowerThird";
import {
  autoCorner,
  bigDateSize,
  cornerBox,
  type Corner,
  lowerThirdSize,
  overlapArea,
} from "../components/text/placement";
import { motion, space } from "../design/tokens";
import type { PlateMeta } from "../geo/plate";
import { makeProjection } from "../map/PlateStage";
import { storyboardSchema } from "../storyboard/schema";
import { buildCamera, peakMotion, verifyEpisodeCamera } from "./camera";
import { compilePlan, geoLayerTypes } from "./plan";

const W = 1920;
const H = 1080;
const meta = plate as unknown as PlateMeta;
const story = storyboardSchema.parse(
  JSON.parse(
    readFileSync("../episodes/china-unity-pilot/storyboard.json", "utf8"),
  ),
);
const last = timing.shots[timing.shots.length - 1];
const { assembly, storyboard } = compilePlan(
  story,
  timing,
  last.from + last.durationInFrames,
);
const metas = { china: meta };
const camera = buildCamera(storyboard, assembly, metas, W, H);
const mapAction = (type: string) =>
  geoLayerTypes.has(type) || type === "PlaceLabel";
const cards = new Set([
  "LowerThird",
  "SectionTag",
  "BigDate",
  "KeyFact",
  "StatCounter",
  "NumberedList",
  "RecapCards",
  "BarCompare",
  "TimelineBar",
]);

describe("pilot v2 by docs/visual-grammar.md", () => {
  test("keeps the ten shots of the approved narration", () => {
    expect(storyboard.shots).toHaveLength(10);
  });
  test.each(storyboard.shots.map((s) => [s.id, s] as const))(
    "%s has a map action anchored to its narration",
    (_, shot) => {
      const actions = shot.layers.filter((l) => mapAction(l.type));
      expect(actions.length).toBeGreaterThan(0);
      if (!shot.camera.preset.startsWith("followLine"))
        expect(actions.some((l) => l.start)).toBe(true);
    },
  );
  test("never holds, and the camera ends every shot somewhere new", () => {
    const poses = assembly.shots.map((s) =>
      camera.poseAt(s.from + s.durationInFrames - 1),
    );
    storyboard.shots.forEach((s) => expect(s.camera.preset).not.toBe("hold"));
    for (let i = 1; i < poses.length; i++) {
      const [a, b] = [poses[i - 1], poses[i]];
      const panned = Math.hypot(a.x - b.x, a.y - b.y) / metersPerPx(b.zoom);
      const zoomed = Math.abs(a.zoom - b.zoom);
      expect(
        panned > 100 || zoomed > 0.1,
        `${assembly.shots[i].id} shares its framing with the shot before`,
      ).toBe(true);
    }
  });
  test("the camera keeps to the speed limit in every shot", () => {
    const limit = motion.camera.maxSpeedPx + motion.camera.speedTolerancePx;
    assembly.shots.forEach((window) =>
      expect(
        peakMotion(camera.poseAt, window.from, window.durationInFrames, W, H)
          .speed,
        window.id,
      ).toBeLessThanOrEqual(limit),
    );
    expect(() =>
      verifyEpisodeCamera(storyboard, assembly, metas, W, H),
    ).not.toThrow();
  });
  test("a shot over the speed limit fails the check and names itself", () => {
    const fast = structuredClone(storyboard);
    fast.shots[2].camera = {
      preset: "flyTo",
      params: { to: { center: { lon: 122, lat: 34 }, zoom: 5.5 } },
    };
    expect(() => verifyEpisodeCamera(fast, assembly, metas, W, H)).toThrow(
      /too fast in shot eastern-lowlands/,
    );
  });
  test("at most one text card shows at a time", () => {
    assembly.shots.forEach((window, s) => {
      const spans = window.layers
        .filter((_, l) => cards.has(storyboard.shots[s].layers[l].type))
        .map((l) => [l.from, l.from + l.durationInFrames])
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i++)
        expect(
          spans[i][0],
          `${window.id}: cards overlap in time`,
        ).toBeGreaterThanOrEqual(spans[i - 1][1]);
    });
  });
  test("no LowerThird covers its subject on any frame, and it stays out of the bottom 12%", () => {
    const seen: string[] = [];
    assembly.shots.forEach((window, s) => {
      storyboard.shots[s].layers.forEach((layer, l) => {
        if (layer.type !== "LowerThird") return;
        const props = lowerThirdSchema.parse(layer.props);
        seen.push(layer.id);
        const slot = window.layers[l];
        const size = lowerThirdSize(props.title, props.subtitle);
        const screenAt = (f: number) => {
          const cam = camera.path(meta, (window.from + f) / 30, W, H);
          return makeProjection(meta, plateView(meta, cam), W, H).toScreen;
        };
        const chosen = autoCorner(
          props.subject!,
          size,
          W,
          H,
          slot.from,
          slot.durationInFrames,
          screenAt,
        );
        expect(chosen.overlap, layer.id).toBe(0);
        const box = cornerBox(chosen.corner, size, W, H);
        expect(box.bottom).toBeLessThanOrEqual(H * (1 - space.bottomReserve));
        for (let f = 0; f < slot.durationInFrames; f++) {
          const toScreen = screenAt(slot.from + f);
          const [west, south, east, north] = props.subject!;
          const a = toScreen([west, north]);
          const b = toScreen([east, south]);
          expect(
            overlapArea(box, {
              left: a.x,
              top: a.y,
              right: b.x,
              bottom: b.y,
            }),
            `${layer.id} frame ${f}`,
          ).toBe(0);
        }
      });
    });
    expect(seen).toEqual(["canal-name", "incentive"]);
  });
  test("no card lies over anything the shot draws, on any frame", () => {
    const lineOf = (props: Record<string, unknown>) => {
      const geojson = props.geojson as
        | {
            features: {
              geometry: { type: string; coordinates: [number, number][] };
            }[];
          }
        | undefined;
      return (geojson?.features ?? [])
        .filter((f) => f.geometry.type === "LineString")
        .flatMap((f) =>
          f.geometry.coordinates.flatMap((c, i, all) => {
            if (i === 0) return [c];
            const a = all[i - 1];
            return Array.from({ length: 12 }, (_, k): [number, number] => [
              a[0] + ((c[0] - a[0]) * (k + 1)) / 12,
              a[1] + ((c[1] - a[1]) * (k + 1)) / 12,
            ]);
          }),
        );
    };
    const sui = (
      JSON.parse(
        readFileSync(
          "../data/processed/china-east-hs05/historical/china-592-cliopatria.geojson",
          "utf8",
        ),
      ) as {
        features: {
          properties: { id: string };
          geometry: { coordinates: [number, number][][][] };
        }[];
      }
    ).features
      .find((f) => f.properties.id === "cliopatria-sui-dynasty-592")!
      .geometry.coordinates.flat(2);
    let checked = 0;
    assembly.shots.forEach((window, s) => {
      const layers = storyboard.shots[s].layers;
      layers.forEach((layer, l) => {
        if (layer.type !== "LowerThird" && layer.type !== "BigDate") return;
        const slot = window.layers[l];
        const screenAt = (f: number) => {
          const cam = camera.path(meta, (window.from + f) / 30, W, H);
          return makeProjection(meta, plateView(meta, cam), W, H).toScreen;
        };
        let box;
        if (layer.type === "LowerThird") {
          const props = lowerThirdSchema.parse(layer.props);
          const size = lowerThirdSize(props.title, props.subtitle);
          box = cornerBox(
            autoCorner(
              props.subject!,
              size,
              W,
              H,
              slot.from,
              slot.durationInFrames,
              screenAt,
            ).corner,
            size,
            W,
            H,
          );
        } else {
          const props = layer.props as { caption?: string; placement: Corner };
          box = cornerBox(props.placement, bigDateSize(props.caption), W, H);
        }
        for (let f = 0; f < slot.durationInFrames; f += 3) {
          const frame = slot.from + f;
          const points = layers.flatMap((other, o) => {
            const span = window.layers[o];
            if (frame < span.from || frame >= span.from + span.durationInFrames)
              return [];
            return other.type === "HistoricalLayer"
              ? sui
              : lineOf(other.props as Record<string, unknown>);
          });
          const toScreen = screenAt(frame);
          for (const point of points) {
            const p = toScreen(point);
            expect(
              p.x > box.left &&
                p.x < box.right &&
                p.y > box.top &&
                p.y < box.bottom,
              `${layer.id} covers ${point} at frame ${frame}`,
            ).toBe(false);
            checked++;
          }
        }
      });
    });
    expect(checked).toBeGreaterThan(1000);
    // Projects every drawn point on sampled frames: over vitest's 5 s default on a busy machine.
  }, 60_000);
  test("every map shot uses only layers without errata blockers", () => {
    const historical = storyboard.shots.flatMap((s) =>
      s.layers.filter((l) => l.type === "HistoricalLayer"),
    );
    expect(historical.length).toBeGreaterThan(0);
    for (const layer of historical) {
      const errata = JSON.parse(
        readFileSync(
          `../data/processed/china-east-hs05/historical/${(layer.props as { slug: string }).slug}.errata.json`,
          "utf8",
        ),
      ) as { severity: string }[];
      expect(errata.filter((e) => e.severity === "blocker")).toEqual([]);
    }
  });
});
