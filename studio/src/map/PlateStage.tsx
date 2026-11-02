// Plate map engine (variant B from step 1.2): plates + one CSS camera.
//
//   <PlateStage plate="china-east-hs05" camera={path} geo={...} screen={...} />
//   <PlateSequence plates={["europe", "central-europe"]} transitionAt={300}
//                  transitionFrames={45} camera={path} geo={...} screen={...} />
//
// - One geo-camera (centre lon/lat, absolute zoom = metres per screen px) drives every plate;
//   each plate converts it into its own pixels (plateView), so plates line up exactly.
// - `geo` children live inside the transformed container of the *active* plate (plate px,
//   use GeoSvg); the active plate switches in the middle of a transition. Because every
//   plate projects the same lon/lat to the same screen point, nothing jumps.
// - `screen` children are untransformed; place them with useMapProjection().toScreen().
// - During a transition plate B fades in over plate A (crossfade).
// Every frame is checked before rendering: each visible plate must cover the frame (edges
// never visible) and must not be magnified above min(1, 1 / oversampling); a plate that is
// being replaced may reach FADE_OUT_MAX_MAG from one transition length before the crossfade
// until it ends (zoom-through window). The render fails with the frame number otherwise.
import { createContext, useContext, useMemo } from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  coverage,
  PERSPECTIVE_PX,
  plateTransform,
  plateView,
  PlateView,
  projectToScreen,
} from "../camera/plateProjection";
import type { CameraPath } from "../camera/types";
import { MapAttribution } from "../components/MapAttribution";
import { colors } from "../design/tokens";
import { lonLatToPlatePx, PlateMeta } from "../geo/plate";
import { usePlateMetas } from "../geo/usePlateMetas";

export type LonLatTuple = [number, number];
type Px = { x: number; y: number };

export type MapProjection = {
  meta: PlateMeta;
  view: PlateView;
  width: number;
  height: number;
  /** [lon, lat] → plate pixels of the active plate (geo layer coordinates). */
  toPlatePx: (lonLat: LonLatTuple) => Px;
  /** [lon, lat] → final frame pixels (screen layer coordinates). */
  toScreen: (lonLat: LonLatTuple) => Px;
  /** Plate px → frame px. */
  plateToScreen: (p: Px) => Px;
};

const ProjectionContext = createContext<MapProjection | null>(null);

export const useMapProjection = (): MapProjection => {
  const ctx = useContext(ProjectionContext);
  if (!ctx)
    throw new Error(
      "useMapProjection() must be used inside <PlateStage>/<PlateSequence>",
    );
  return ctx;
};

export const MIN_EDGE_MARGIN_PX = 2;
/**
 * Zoom-through: the plate being replaced may be magnified this much, from one transition
 * length before the crossfade until its end (the next plate cannot cover the frame earlier).
 */
export const FADE_OUT_MAX_MAG = 1.4;

/** Largest allowed magnification of a plate: never above 1:1, less if already upscaled. */
export const maxMagnification = (meta: PlateMeta) =>
  Math.min(1, 1 / (meta.resolution?.edge ?? 1));

export const makeProjection = (
  meta: PlateMeta,
  view: PlateView,
  width: number,
  height: number,
): MapProjection => {
  const toPlatePx = ([lon, lat]: LonLatTuple) =>
    lonLatToPlatePx(meta, { lon, lat });
  const plateToScreen = (p: Px) =>
    projectToScreen(view, p.x, p.y, width, height);
  return {
    meta,
    view,
    width,
    height,
    toPlatePx,
    plateToScreen,
    toScreen: (ll) => plateToScreen(toPlatePx(ll)),
  };
};

/** Opacity of each plate at a frame (plate i fades in over plate i - 1). */
export const plateOpacities = (
  frame: number,
  count: number,
  transitions: { at: number; frames: number }[],
) =>
  Array.from({ length: count }, (_, i) => {
    if (i === 0)
      return frame <
        (transitions[0] ? transitions[0].at + transitions[0].frames : Infinity)
        ? 1
        : 0;
    const t = transitions[i - 1];
    const fadeIn = interpolate(frame, [t.at, t.at + t.frames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const next = transitions[i];
    return next && frame >= next.at + next.frames ? 0 : fadeIn;
  });

/** Index of the plate that hosts the geo layer (switches mid-transition). */
export const activePlate = (
  frame: number,
  transitions: { at: number; frames: number }[],
) => transitions.filter((t) => frame >= t.at + t.frames / 2).length;

export const verifyPlates = (
  metas: PlateMeta[],
  transitions: { at: number; frames: number }[],
  camera: CameraPath,
  frames: number,
  fps: number,
  width: number,
  height: number,
) => {
  const report = metas.map(() => ({ minMargin: Infinity, maxMag: 0 }));
  for (let f = 0; f < frames; f++) {
    const cam = camera(metas[0], f / fps, width, height);
    const op = plateOpacities(f, metas.length, transitions);
    metas.forEach((meta, i) => {
      if (op[i] <= 0 && !(i > 0 && f >= transitions[i - 1].at)) return; // not on screen
      const c = coverage(meta, plateView(meta, cam), width, height);
      const fadingOut =
        i < metas.length - 1 && f >= transitions[i].at - transitions[i].frames;
      const limit = fadingOut ? FADE_OUT_MAX_MAG : maxMagnification(meta);
      if (c.minMarginPx < MIN_EDGE_MARGIN_PX) {
        throw new Error(
          `frame ${f}: plate "${meta.name}" edge within ${c.minMarginPx.toFixed(1)} px`,
        );
      }
      if (c.maxMagnification > limit + 1e-6) {
        throw new Error(
          `frame ${f}: plate "${meta.name}" magnified ${c.maxMagnification.toFixed(3)}x (limit ${limit.toFixed(3)})`,
        );
      }
      report[i].minMargin = Math.min(report[i].minMargin, c.minMarginPx);
      report[i].maxMag = Math.max(report[i].maxMag, c.maxMagnification);
    });
  }
  return report;
};

export const PlateSequence: React.FC<{
  plates: string[];
  /** Frame where plate i + 1 starts fading in over plate i (one entry per transition). */
  transitionAt?: number | number[];
  transitionFrames?: number | number[];
  camera: CameraPath;
  geo?: React.ReactNode;
  screen?: React.ReactNode;
  extraAttribution?: string;
}> = ({
  plates,
  transitionAt = [],
  transitionFrames = 30,
  camera,
  geo,
  screen,
  extraAttribution,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const metas = usePlateMetas(plates);
  // Stable key so the (expensive) per-frame verification runs once, not on every frame.
  const transitionKey = JSON.stringify([transitionAt, transitionFrames]);
  const transitions = useMemo(() => {
    const [at, len] = JSON.parse(transitionKey) as [
      number | number[],
      number | number[],
    ];
    const ats = Array.isArray(at) ? at : [at];
    const lens = Array.isArray(len) ? len : ats.map(() => len);
    return ats.map((a, i) => ({ at: a, frames: lens[i] }));
  }, [transitionKey]);
  if (transitions.length !== plates.length - 1) {
    throw new Error(
      `${plates.length} plates need ${plates.length - 1} transition(s)`,
    );
  }

  const report = useMemo(
    () =>
      metas
        ? verifyPlates(
            metas,
            transitions,
            camera,
            durationInFrames,
            fps,
            width,
            height,
          )
        : null,
    [metas, transitions, camera, durationInFrames, fps, width, height],
  );
  if (report && frame === 0) {
    report.forEach((r, i) =>
      console.log(
        `PlateStage ${plates[i]}: min edge margin ${r.minMargin.toFixed(1)} plate px, max magnification ${r.maxMag.toFixed(3)}`,
      ),
    );
  }
  if (!metas) return null;

  const cam = camera(metas[0], frame / fps, width, height);
  const opacities = plateOpacities(frame, metas.length, transitions);
  const active = activePlate(frame, transitions);
  const views = metas.map((m) => plateView(m, cam));
  const projection = makeProjection(
    metas[active],
    views[active],
    width,
    height,
  );
  const attribution = [metas[active].attribution.on_screen, extraAttribution]
    .filter(Boolean)
    .join(" · ");

  return (
    <ProjectionContext.Provider value={projection}>
      <AbsoluteFill
        style={{
          backgroundColor: colors.background,
          overflow: "hidden",
          perspective: PERSPECTIVE_PX,
          perspectiveOrigin: "50% 50%",
        }}
      >
        {metas.map((meta, i) =>
          opacities[i] > 0 || i === active ? (
            <div
              key={meta.name}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: meta.width,
                height: meta.height,
                transformOrigin: "0 0",
                transform: plateTransform(views[i], width, height),
                opacity: opacities[i],
              }}
            >
              <Img
                src={staticFile(meta.image)}
                style={{
                  position: "absolute",
                  width: meta.width,
                  height: meta.height,
                }}
              />
            </div>
          ) : null,
        )}
        {/* The geo layer gets its own container with the active plate's transform, above all
            plates and at full opacity, so it never fades with a plate. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: metas[active].width,
            height: metas[active].height,
            transformOrigin: "0 0",
            transform: plateTransform(views[active], width, height),
          }}
        >
          {geo}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ pointerEvents: "none" }}>{screen}</AbsoluteFill>
      <MapAttribution text={attribution} />
    </ProjectionContext.Provider>
  );
};

export const PlateStage: React.FC<{
  plate: string;
  camera: CameraPath;
  geo?: React.ReactNode;
  screen?: React.ReactNode;
  /** Appended to the plate's on-screen attribution (e.g. "Made with Natural Earth"). */
  extraAttribution?: string;
}> = ({ plate, ...rest }) => <PlateSequence plates={[plate]} {...rest} />;

/** Full-plate SVG for the geo layer (plate-pixel coordinate system of the active plate). */
export const GeoSvg: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => {
  const { meta } = useMapProjection();
  return (
    <svg
      width={meta.width}
      height={meta.height}
      viewBox={`0 0 ${meta.width} ${meta.height}`}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        ...style,
      }}
    >
      {children}
    </svg>
  );
};
