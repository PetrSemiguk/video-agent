// PlateStage: the plate + CSS-camera map engine (variant B from step 1.2), reusable.
//
//   <PlateStage plate="china-east-hs05" camera={path} geo={...} screen={...} />
//
// - `geo` children are rendered inside the transformed plate container, in plate pixels
//   (use SVG sized meta.width x meta.height); they move, scale and tilt with the camera.
// - `screen` children are rendered on top without any transform; place them with
//   useMapProjection().toScreen([lon, lat]) so they follow the map but keep their size.
// Before rendering, every frame of the composition is checked: no plate edge may become
// visible and the plate may never be magnified above 1:1 (the render fails otherwise).
import { createContext, useContext, useMemo } from "react";
import {
  AbsoluteFill,
  Img,
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
import { usePlateMeta } from "../geo/usePlateMeta";

export type LonLatTuple = [number, number];
type Px = { x: number; y: number };

export type MapProjection = {
  meta: PlateMeta;
  view: PlateView;
  width: number;
  height: number;
  /** [lon, lat] → plate pixels (geo layer coordinates). */
  toPlatePx: (lonLat: LonLatTuple) => Px;
  /** [lon, lat] → final frame pixels (screen layer coordinates). */
  toScreen: (lonLat: LonLatTuple) => Px;
  /** Plate px → frame px. */
  plateToScreen: (p: Px) => Px;
};

const ProjectionContext = createContext<MapProjection | null>(null);

export const useMapProjection = (): MapProjection => {
  const ctx = useContext(ProjectionContext);
  if (!ctx) {
    throw new Error("useMapProjection() must be used inside <PlateStage>");
  }
  return ctx;
};

export const MIN_EDGE_MARGIN_PX = 2;

export const verifyCameraPath = (
  meta: PlateMeta,
  camera: CameraPath,
  frames: number,
  fps: number,
  width: number,
  height: number,
) => {
  let minMargin = Infinity;
  let maxMag = 0;
  for (let f = 0; f < frames; f++) {
    const report = coverage(
      meta,
      plateView(meta, camera(meta, f / fps, width, height)),
      width,
      height,
    );
    if (report.minMarginPx < MIN_EDGE_MARGIN_PX) {
      throw new Error(
        `frame ${f}: plate edge within ${report.minMarginPx.toFixed(1)} px`,
      );
    }
    if (report.maxMagnification > 1 + 1e-6) {
      throw new Error(
        `frame ${f}: plate magnified ${report.maxMagnification.toFixed(3)}x`,
      );
    }
    minMargin = Math.min(minMargin, report.minMarginPx);
    maxMag = Math.max(maxMag, report.maxMagnification);
  }
  return { minMargin, maxMag };
};

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

export const PlateStage: React.FC<{
  plate: string;
  camera: CameraPath;
  geo?: React.ReactNode;
  screen?: React.ReactNode;
  /** Appended to the plate's on-screen attribution (e.g. "Made with Natural Earth"). */
  extraAttribution?: string;
}> = ({ plate, camera, geo, screen, extraAttribution }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const meta = usePlateMeta(plate);

  const check = useMemo(
    () =>
      meta
        ? verifyCameraPath(meta, camera, durationInFrames, fps, width, height)
        : null,
    [meta, camera, durationInFrames, fps, width, height],
  );
  if (check && frame === 0) {
    console.log(
      `PlateStage ${plate}: min edge margin ${check.minMargin.toFixed(1)} plate px, ` +
        `max magnification ${check.maxMag.toFixed(3)}`,
    );
  }

  if (!meta) {
    return null;
  }

  const view = plateView(meta, camera(meta, frame / fps, width, height));
  const projection = makeProjection(meta, view, width, height);
  const attribution = [meta.attribution.on_screen, extraAttribution]
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
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: meta.width,
            height: meta.height,
            transformOrigin: "0 0",
            transform: plateTransform(view, width, height),
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
          {geo}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ pointerEvents: "none" }}>{screen}</AbsoluteFill>
      <MapAttribution text={attribution} />
    </ProjectionContext.Provider>
  );
};

/** Full-plate SVG for the geo layer (plate-pixel coordinate system). */
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
