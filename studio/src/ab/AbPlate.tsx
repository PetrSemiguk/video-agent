// Variant B of the step 1.2 A/B test: the 4K plate moved with CSS translate/scale and a
// CSS-perspective pseudo-tilt. Fails the render if any frame would show a plate edge or
// magnify the plate above its native resolution.
import { useMemo } from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CHENGDU, FLYOVER_PLATE, flyoverCamera, TILT } from "../camera/flyover";
import {
  coverage,
  PERSPECTIVE_PX,
  plateTransform,
  plateView,
} from "../camera/plateProjection";
import { MapAttribution } from "../components/MapAttribution";
import { lonLatToPlatePx, PlateMeta } from "../geo/plate";
import { usePlateMeta } from "../geo/usePlateMeta";

// TODO(step 5): replace hardcoded colors and sizes with design tokens.
const MARKER = "#ff2d2d";
const MARKER_SIZE = 12;
const MIN_EDGE_MARGIN_PX = 2;

/** Checks every frame of the trajectory up front; throws on the first violation. */
const verifyTrajectory = (
  meta: PlateMeta,
  frames: number,
  fps: number,
  width: number,
  height: number,
) => {
  let minMargin = Infinity;
  let maxMag = 0;
  for (let f = 0; f < frames; f++) {
    const cam = flyoverCamera(meta, f / fps, TILT.plate, width, height);
    const report = coverage(meta, plateView(meta, cam), width, height);
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

export const AbPlate: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const meta = usePlateMeta(FLYOVER_PLATE);

  const check = useMemo(
    () =>
      meta
        ? verifyTrajectory(meta, durationInFrames, fps, width, height)
        : null,
    [meta, durationInFrames, fps, width, height],
  );
  if (check && frame === 0) {
    console.log(
      `AbPlate coverage OK: min edge margin ${check.minMargin.toFixed(1)} plate px, ` +
        `max magnification ${check.maxMag.toFixed(3)}`,
    );
  }

  if (!meta) {
    return null;
  }

  const view = plateView(
    meta,
    flyoverCamera(meta, frame / fps, TILT.plate, width, height),
  );
  const marker = lonLatToPlatePx(meta, CHENGDU);
  const markerSize = MARKER_SIZE / view.scale; // keep ~12 screen px under scale()

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "black",
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
        <div
          style={{
            position: "absolute",
            left: marker.x - markerSize / 2,
            top: marker.y - markerSize / 2,
            width: markerSize,
            height: markerSize,
            borderRadius: markerSize / 2,
            backgroundColor: MARKER,
          }}
        />
      </div>
      <MapAttribution text={meta.attribution.on_screen} />
    </AbsoluteFill>
  );
};
