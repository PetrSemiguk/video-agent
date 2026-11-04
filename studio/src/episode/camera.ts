import {
  drift,
  establish,
  flyTo,
  focusOn,
  followLine,
  hold,
  plateZoomLimits,
} from "../camera/presets";
import { plateCenter } from "../camera/keyframes";
import { cameraTimeline, toMerc, type Segment } from "../camera/timeline";
import { motion, space } from "../design/tokens";
import { MIN_EDGE_MARGIN_PX, verifyPlates } from "../map/PlateStage";
import type { PlateMeta } from "../geo/plate";
import type { ParsedStoryboard } from "../storyboard/schema";
import { type Assembly, transitionFrames } from "./plan";

export const buildCamera = (
  storyboard: ParsedStoryboard,
  assembly: Assembly,
  metas: Record<string, PlateMeta>,
  width: number,
  height: number,
) => {
  const segments = storyboard.shots.flatMap((shot, i): Segment[] => {
    const window = assembly.shots[i];
    const active = window.cameraWindow ?? {
      from: 0,
      durationInFrames: window.durationInFrames,
    };
    const frames = active.durationInFrames;
    const spec = shot.camera;
    const preset = (): Segment => {
      switch (spec.preset) {
        case "establish": {
          const { target, ...options } = spec.params;
          return establish(target, frames, options);
        }
        case "drift":
          return drift(frames, spec.params);
        case "hold":
          return hold(frames);
        case "focusOn": {
          const { bounds, ...options } = spec.params;
          return focusOn(bounds, frames, options);
        }
        case "flyTo": {
          const { to, ...options } = spec.params;
          return flyTo(to, frames, options);
        }
        case "followLine": {
          const { line, drawFrames, ...options } = spec.params;
          const start = window.from + active.from;
          return followLine(
            line,
            (f) => Math.max(0, Math.min(1, (f - start) / drawFrames)),
            frames,
            options,
          );
        }
      }
    };
    const suffix = window.durationInFrames - active.from - frames;
    return [
      ...(active.from ? [drift(active.from)] : []),
      preset(),
      ...(suffix ? [drift(suffix)] : []),
    ];
  });
  const first = metas[storyboard.shots[0].plate];
  const center = toMerc(plateCenter(first));
  const limits = plateZoomLimits(first, width, height);
  // Derive a coverage handle from the existing safe area, not a new camera look.
  const initial = {
    ...center,
    zoom: Math.min(limits.max, limits.cover - Math.log2(1 - space.safeArea)),
    pitch: 0,
    bearing: 0,
  };
  const original = segments[0];
  segments[0] = {
    ...original,
    keys: (pose, ctx) => {
      const keys = original.keys(initial, ctx);
      return keys.some((key) => key.f === 0)
        ? keys
        : [{ f: 0, ...initial }, ...keys];
    },
  };
  return cameraTimeline(segments, { fps: motion.fps, width, height });
};

/** Render-time safety, including the outgoing scene's transition extension. */
export const verifyEpisodeCamera = (
  storyboard: ParsedStoryboard,
  assembly: Assembly,
  metas: Record<string, PlateMeta>,
  width: number,
  height: number,
) => {
  const timeline = buildCamera(storyboard, assembly, metas, width, height);
  return storyboard.shots.map((shot, i) => {
    const window = assembly.shots[i],
      next = storyboard.shots[i + 1];
    const overlap = transitionFrames(shot);
    const changing = next && next.plate !== shot.plate && overlap > 0;
    const names = changing ? [shot.plate, next.plate] : [shot.plate];
    const local = (meta: PlateMeta, sec: number, w: number, h: number) =>
      timeline.path(meta, sec + window.from / motion.fps, w, h);
    const reports = verifyPlates(
      names.map((id) => metas[id]),
      changing ? [{ at: window.durationInFrames, frames: overlap }] : [],
      local,
      window.durationInFrames + overlap,
      motion.fps,
      width,
      height,
    );
    if (reports.some((r) => r.minMargin < MIN_EDGE_MARGIN_PX))
      throw new Error(`Unsafe camera in shot ${shot.id}`);
    return { id: shot.id, reports };
  });
};
