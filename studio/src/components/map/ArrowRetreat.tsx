import { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import {
  colors,
  fontStack,
  motion,
  regionColor,
  retreatArrow,
  stroke,
  type,
} from "../../design/tokens";
import {
  measurePolyline,
  polylineD,
  sliceByFraction,
  type MeasuredLine,
} from "../../geo/line";
import { GeoSvg, useMapProjection } from "../../map/PlateStage";
// Shared with the advance arrow: the head's size against the path, and its direction at a point.
import { tipDirection, totalLength } from "./ArrowAdvance";
import { lineExitOpacity } from "./lineExit";
import { arrowRetreatSchema } from "./schemas";
export { arrowRetreatSchema } from "./schemas";

// One withdrawal. Unlike ArrowAdvance, nothing grows forwards: the arrow is whole from the first
// frame, with its head already on the line fallen back to, and its tail collapses back along the
// course. The ground let go stays behind as a faint dashed trace, and the bar across the front —
// the line held — is released as the force leaves it. Reversing an advance would read as a fresh
// attack the other way; a shaft that only ever shortens cannot. Sizes are divided by view.scale,
// as geo children live inside the transformed plate. Timing: frames of the enclosing <Sequence>.
type Pt = { x: number; y: number };

/**
 * Spans of the course at progress p: the ground already let go, and the part still held, which
 * ends where the head begins and so collapses onto it.
 */
export const retreatSpans = (progress: number, headFraction: number) => {
  const p = Math.min(1, Math.max(0, progress));
  const to = Math.max(0, 1 - headFraction);
  return { vacated: { from: 0, to: p }, shaft: { from: Math.min(p, to), to } };
};

/** Opacity of the line held: full while the force is on it, gone once it has left. */
export const heldOpacity = (progress: number) =>
  Math.min(1, Math.max(0, 1 - progress / retreatArrow.held.releaseFraction));

/** Endpoints of the bar across the course at its first point: the line that was held. */
export const heldBar = (line: MeasuredLine<Pt>, length: number) => {
  const piece = sliceByFraction(line, 0, 2 * retreatArrow.tangentFraction);
  const a = piece[0] ?? { x: 0, y: 0 };
  const b = piece[piece.length - 1] ?? a;
  const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Across the course: the normal of the first piece, half the bar each way.
  const nx = (-(b.y - a.y) / span) * (length / 2);
  const ny = ((b.x - a.x) / span) * (length / 2);
  return { x1: a.x - nx, y1: a.y - ny, x2: a.x + nx, y2: a.y + ny };
};

const ArrowRetreatView: React.FC<z.output<typeof arrowRetreatSchema>> = ({
  path,
  color,
  drawFrames,
  style,
  label,
  durationInFrames,
  exitFrames,
}) => {
  const frame = useCurrentFrame();
  const { meta, view, toPlatePx } = useMapProjection();
  const line = useMemo(
    () => measurePolyline(path.map((point) => toPlatePx(point))),
    // toPlatePx depends only on the plate, not on the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, meta],
  );

  const p = interpolate(frame, [0, drawFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const k = 1 / view.scale;
  const fill = regionColor[color];
  // The arrow is on the map from the first frame, so it fades in on frames, not on progress.
  const appear = interpolate(frame, [0, retreatArrow.enterFrames], [0, 1], {
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
  // The head keeps its size on the map, so it takes a smaller share of a longer path.
  const headFraction = Math.min(
    0.4,
    retreatArrow.headLength / Math.max(1, totalLength(line)),
  );
  const { vacated, shaft } = retreatSpans(p, headFraction);
  const trace = polylineD(sliceByFraction(line, vacated.from, vacated.to));
  const body = polylineD(sliceByFraction(line, shaft.from, shaft.to));
  const width = retreatArrow.width * k;
  const head = tipDirection(line, 1);
  const [headLength, headWidth] = [
    retreatArrow.headLength * k,
    retreatArrow.headWidth * k,
  ];
  const held = heldBar(line, retreatArrow.held.length * k);
  const back = interpolate(p, [0.97, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <GeoSvg
      style={{ opacity: lineExitOpacity(frame, durationInFrames, exitFrames) }}
    >
      <g opacity={appear}>
        {trace ? (
          <path
            d={trace}
            fill="none"
            stroke={fill}
            strokeOpacity={retreatArrow.trace.opacity}
            strokeWidth={retreatArrow.trace.width * k}
            strokeDasharray={retreatArrow.trace.dash
              .map((n) => n * k)
              .join(" ")}
            strokeLinecap="butt"
          />
        ) : null}
        {heldOpacity(p) > 0 ? (
          <g opacity={heldOpacity(p)} strokeLinecap="butt">
            <line
              x1={held.x1}
              y1={held.y1}
              x2={held.x2}
              y2={held.y2}
              stroke={colors.routeCasing}
              strokeWidth={(retreatArrow.held.width + stroke.routeHalo) * k}
            />
            <line
              x1={held.x1}
              y1={held.y1}
              x2={held.x2}
              y2={held.y2}
              stroke={fill}
              strokeWidth={retreatArrow.held.width * k}
            />
          </g>
        ) : null}
        {body ? (
          <g fill="none" strokeLinecap="butt" strokeLinejoin="round">
            <path
              d={body}
              stroke={colors.routeCasing}
              strokeWidth={width + stroke.routeHalo * k}
            />
            <path
              d={body}
              stroke={fill}
              strokeWidth={width}
              strokeDasharray={
                style === "dashed"
                  ? retreatArrow.dash.map((n) => n * k).join(" ")
                  : undefined
              }
            />
          </g>
        ) : null}
        <path
          d={`M0 0L${-headLength} ${headWidth / 2}L${-headLength} ${-headWidth / 2}Z`}
          fill={fill}
          stroke={colors.routeCasing}
          strokeWidth={stroke.routeHalo * k}
          strokeLinejoin="round"
          paintOrder="stroke fill"
          transform={`translate(${head.x} ${head.y}) rotate(${head.angle})`}
        />
        {label && back > 0 ? (
          <text
            x={head.x}
            y={head.y - retreatArrow.labelGap * k}
            textAnchor="middle"
            dominantBaseline="auto"
            fontFamily={fontStack}
            fontWeight={type.weight.medium}
            fontSize={type.size.labelCity * k}
            fill={colors.labelText}
            stroke={colors.labelHalo}
            strokeWidth={stroke.labelHalo * k}
            paintOrder="stroke fill"
            opacity={back}
          >
            {label}
          </text>
        ) : null}
      </g>
    </GeoSvg>
  );
};

export const ArrowRetreat: React.FC<z.input<typeof arrowRetreatSchema>> = (
  props,
) => <ArrowRetreatView {...arrowRetreatSchema.parse(props)} />;
