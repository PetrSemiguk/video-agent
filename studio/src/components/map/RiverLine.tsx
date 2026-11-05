import { z } from "zod";
import { riverLineSchema } from "./schemas";
export { riverLineSchema } from "./schemas";
// Draws a river (vap.geo.river output: one LineString source→mouth + per-vertex `cumfrac`)
// from source to mouth at constant speed along its length. Width tapers from stroke.river.min
// at the source to .max at the mouth (TAPER_STEPS pieces of increasing width); the drawing
// head is brighter while the line is growing. Timing: frames from the enclosing <Sequence>.
import { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors, motion, stroke, textLayer } from "../../design/tokens";
import type { GeoCollection } from "../../geo/geojson";
import { MeasuredLine, polylineD, sliceByFraction } from "../../geo/line";
import { GeoSvg, useMapProjection } from "../../map/PlateStage";
import { lineExitOpacity } from "./lineExit";

const TAPER_STEPS = 24;
/** Length fraction of the bright head. */
const HEAD_FRACTION = 0.02;

const RiverLineView: React.FC<{
  geojson: GeoCollection;
  drawFrames: number;
  glow?: boolean;
  fromFraction?: number;
  durationInFrames?: number;
  exitFrames?: number;
}> = ({
  geojson,
  drawFrames,
  glow = false,
  fromFraction = 0,
  durationInFrames = textLayer.maxDuration,
  exitFrames = motion.frames.base,
}) => {
  const frame = useCurrentFrame();
  const { meta, view, toPlatePx } = useMapProjection();

  const line = useMemo((): MeasuredLine<{ x: number; y: number }> => {
    const f = geojson.features[0];
    if (f.geometry.type !== "LineString") {
      throw new Error(
        "RiverLine expects a single LineString (run vap.geo.river)",
      );
    }
    const cumfrac = (f.properties as unknown as { cumfrac: number[] }).cumfrac;
    return {
      points: f.geometry.coordinates.map((ll) => toPlatePx(ll)),
      cumfrac,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, meta]);

  // Uniform speed along the length: progress is linear in time.
  const p = interpolate(frame, [0, drawFrames], [fromFraction, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (p <= 0) {
    return null;
  }
  // A part that is already there fades in rather than popping.
  const fade =
    fromFraction > 0
      ? interpolate(frame, [0, motion.frames.base], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: motion.easing.out,
        })
      : 1;
  const k = 1 / view.scale;
  const width = (f: number) =>
    (stroke.river.min + (stroke.river.max - stroke.river.min) * f) * k;

  const pieces = Array.from({ length: TAPER_STEPS }, (_, i) => {
    const f0 = i / TAPER_STEPS;
    const f1 = Math.min((i + 1) / TAPER_STEPS, p);
    return f1 > f0
      ? { d: polylineD(sliceByFraction(line, f0, f1)), w: width((f0 + f1) / 2) }
      : null;
  }).filter((x): x is { d: string; w: number } => x !== null);

  // Head highlight fades out once the river is complete.
  const headOpacity = interpolate(
    frame,
    [drawFrames, drawFrames + motion.frames.base],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const head = polylineD(sliceByFraction(line, p - HEAD_FRACTION, p));

  return (
    <GeoSvg>
      <g
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={fade * lineExitOpacity(frame, durationInFrames, exitFrames)}
      >
        {glow
          ? pieces.map((s, i) => (
              <path
                key={`g${i}`}
                d={s.d}
                stroke={colors.riverGlow}
                strokeWidth={s.w + stroke.riverGlow * k}
              />
            ))
          : null}
        {pieces.map((s, i) => (
          <path key={i} d={s.d} stroke={colors.river} strokeWidth={s.w} />
        ))}
        {headOpacity > 0 && head ? (
          <path
            d={head}
            stroke={colors.riverHead}
            strokeWidth={width(p) * stroke.riverHeadBoost}
            opacity={headOpacity}
          />
        ) : null}
      </g>
    </GeoSvg>
  );
};

export const RiverLine: React.FC<z.input<typeof riverLineSchema>> = (props) => (
  <RiverLineView {...riverLineSchema.parse(props)} />
);
