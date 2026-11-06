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
import {
  cameraTimeline,
  metersPerPx,
  toMerc,
  type CamPose,
  type Segment,
} from "../camera/timeline";
import { motion, space } from "../design/tokens";
import { MIN_EDGE_MARGIN_PX, verifyPlates } from "../map/PlateStage";
import type { PlateMeta } from "../geo/plate";
import type { ParsedStoryboard } from "../storyboard/schema";
import { type Assembly, labelRanges, textLayerTypes, transitionFrames } from "./plan";

/**
 * The widest the camera may go on a plate: its cover zoom, held one safe-area step inside so the
 * plate's edges stay out of frame, and never past the plate's sharp limit. This is the reference
 * for "wide" in the rhythm report: a scale is wide relative to what the episode's plates can show,
 * not to an absolute ground width (docs/visual-grammar.md).
 */
export const widestSafeZoom = (
  meta: PlateMeta,
  width: number,
  height: number,
) => {
  const limits = plateZoomLimits(meta, width, height);
  return Math.min(limits.max, limits.cover - Math.log2(1 - space.safeArea));
};

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
          // A shot that shows text anywhere keeps the strict zoom limit throughout: the
          // preset limits a whole shot, while the build checks each frame on its own.
          const labelled = shot.layers.some((l) => textLayerTypes.has(l.type));
          return followLine(
            line,
            (f) => Math.max(0, Math.min(1, (f - start) / drawFrames)),
            frames,
            {
              ...options,
              maxPanPx: motion.camera.maxPanPx,
              maxZoomPx: labelled
                ? motion.camera.maxZoomWithLabelPx
                : motion.camera.maxZoomPx,
            },
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
  const initial = {
    ...center,
    zoom: widestSafeZoom(first, width, height),
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

/** How far the picture moves on screen between two poses, at the corner where it moves most. */
export const screenMotion = (
  a: CamPose,
  b: CamPose,
  width: number,
  height: number,
) => {
  const mpp = metersPerPx((a.zoom + b.zoom) / 2);
  const [dx, dy] = [(b.x - a.x) / mpp, (b.y - a.y) / mpp];
  const k = 2 ** (b.zoom - a.zoom) - 1;
  return Math.max(
    ...[-0.5, 0.5].flatMap((u) =>
      [-0.5, 0.5].map((v) =>
        Math.hypot(dx - k * u * width, dy - k * v * height),
      ),
    ),
  );
};

/**
 * Pan and zoom of the picture between two poses, in screen px, apart. Pan moves every pixel
 * by the same amount; zoom is measured at the corners, where it moves most.
 */
export const panZoomMotion = (
  a: CamPose,
  b: CamPose,
  width: number,
  height: number,
) => {
  const mpp = metersPerPx((a.zoom + b.zoom) / 2);
  return {
    pan: Math.hypot(b.x - a.x, b.y - a.y) / mpp,
    zoom:
      Math.abs(2 ** (b.zoom - a.zoom) - 1) * Math.hypot(width, height) * 0.5,
  };
};

/**
 * Peak pan and peak zoom in a frame range, each against the limit that applies there: while a
 * text layer is on screen a zoom keeps the strict limit. `worst` is the one furthest over.
 */
export const peakPanZoom = (
  poseAt: (frame: number) => CamPose,
  from: number,
  frames: number,
  width: number,
  height: number,
  hasLabel: (frame: number) => boolean = () => true,
) => {
  const { maxPanPx, maxZoomPx, maxZoomWithLabelPx } = motion.camera;
  type Peak = { value: number; limit: number; at: number };
  const peaks: Record<"pan" | "zoom", Peak> = {
    pan: { value: 0, limit: maxPanPx, at: from },
    zoom: { value: 0, limit: maxZoomWithLabelPx, at: from },
  };
  let worst: Peak & { what: "pan" | "zoom"; over: number } = {
    what: "pan",
    over: -Infinity,
    ...peaks.pan,
  };
  for (let f = from + 1; f < from + frames; f++) {
    const step = panZoomMotion(poseAt(f - 1), poseAt(f), width, height);
    const limits = {
      pan: maxPanPx,
      zoom: hasLabel(f) || hasLabel(f - 1) ? maxZoomWithLabelPx : maxZoomPx,
    };
    for (const what of ["pan", "zoom"] as const) {
      const [value, limit] = [step[what], limits[what]];
      if (value > peaks[what].value) peaks[what] = { value, limit, at: f };
      if (value - limit > worst.over)
        worst = { what, over: value - limit, value, limit, at: f };
    }
  }
  return { ...peaks, worst };
};

/** Fastest movement of the picture in a frame range, px per frame, and where it happens. */
export const peakMotion = (
  poseAt: (frame: number) => CamPose,
  from: number,
  frames: number,
  width: number,
  height: number,
) => {
  let [speed, at] = [0, from];
  for (let f = from + 1; f < from + frames; f++) {
    const motion = screenMotion(poseAt(f - 1), poseAt(f), width, height);
    if (motion > speed) [speed, at] = [motion, f];
  }
  return { speed, at };
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
  const ranges = labelRanges(storyboard, assembly);
  const hasLabel = (f: number) => ranges.some(([a, b]) => f >= a && f < b);
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
    const peak = peakMotion(
      timeline.poseAt,
      window.from,
      window.durationInFrames,
      width,
      height,
    );
    const split = peakPanZoom(
      timeline.poseAt,
      window.from,
      window.durationInFrames,
      width,
      height,
      hasLabel,
    );
    const { what, value, limit, at } = split.worst;
    if (split.worst.over > motion.camera.speedTolerancePx)
      throw new Error(
        `Camera too fast in shot ${shot.id}: ${what} ${value.toFixed(1)} px/frame at frame ${at}, limit ${limit}${
          what === "zoom" && limit === motion.camera.maxZoomWithLabelPx
            ? " while a label is on screen"
            : ""
        }. Bring the framings or zooms closer, lengthen the shot, or clear the labels off the fast part (docs/visual-grammar.md)`,
      );
    return {
      id: shot.id,
      peakMotionPx: peak.speed,
      peakPanPx: split.pan.value,
      peakZoomPx: split.zoom.value,
      reports,
    };
  });
};
