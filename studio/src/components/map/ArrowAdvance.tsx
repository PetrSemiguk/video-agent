import { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import {
  advanceArrow,
  colors,
  fontStack,
  regionColor,
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
import { lineExitOpacity } from "./lineExit";
import { arrowAdvanceSchema } from "./schemas";
export { arrowAdvanceSchema } from "./schemas";

// One advance: a shaft that grows from the origin, tapering from narrow to full width, with a
// single head at the tip. Unlike RouteLine, which draws a thin sourced course with repeating
// direction marks, this reads as a movement of force: an army or a migration. Sizes are divided
// by view.scale, as geo children live inside the transformed plate. Timing: frames of the
// enclosing <Sequence>.
type Pt = { x: number; y: number };

/** Length of a measured polyline in its own units, for sizing the head against the path. */
export const totalLength = (line: MeasuredLine<Pt>) =>
  line.points.reduce(
    (sum, point, i) =>
      i === 0
        ? 0
        : sum +
          Math.hypot(
            point.x - line.points[i - 1].x,
            point.y - line.points[i - 1].y,
          ),
    0,
  );

/** Where the shaft stops so the head sits at the tip, as a fraction of the whole path. */
export const shaftEnd = (progress: number, headFraction: number) =>
  Math.max(0, progress - headFraction);

/** The point the advance has reached, and the direction of the piece just behind it. */
export const tipDirection = (line: MeasuredLine<Pt>, at: number) => {
  const piece = sliceByFraction(
    line,
    Math.max(0, at - 2 * advanceArrow.tangentFraction),
    at,
  );
  const a = piece[0] ?? { x: 0, y: 0 };
  const b = piece[piece.length - 1] ?? a;
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  return {
    x: b.x,
    y: b.y,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
};

const ArrowAdvanceView: React.FC<z.output<typeof arrowAdvanceSchema>> = ({
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
  if (p <= 0) return null;
  const k = 1 / view.scale;
  const fill = regionColor[color];
  const appear = interpolate(p, [0, advanceArrow.enterFraction], [0, 1], {
    extrapolateRight: "clamp",
  });
  // The head keeps its size on the map, so it takes a smaller share of a longer path.
  const headFraction = Math.min(
    0.4,
    advanceArrow.headLength / Math.max(1, totalLength(line)),
  );
  const end = shaftEnd(p, headFraction);
  const shaft = polylineD(sliceByFraction(line, 0, end));
  const width = advanceArrow.width * k;
  const tip = tipDirection(line, p);
  const [headLength, headWidth] = [
    advanceArrow.headLength * k,
    advanceArrow.headWidth * k,
  ];
  const arrived = interpolate(p, [0.97, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <GeoSvg
      style={{ opacity: lineExitOpacity(frame, durationInFrames, exitFrames) }}
    >
      <g opacity={appear}>
        {shaft ? (
          <g fill="none" strokeLinecap="butt" strokeLinejoin="round">
            <path
              d={shaft}
              stroke={colors.routeCasing}
              strokeWidth={width + stroke.routeHalo * k}
            />
            <path
              d={shaft}
              stroke={fill}
              strokeWidth={width}
              strokeDasharray={
                style === "dashed"
                  ? advanceArrow.dash.map((n) => n * k).join(" ")
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
          transform={`translate(${tip.x} ${tip.y}) rotate(${tip.angle})`}
        />
        {label && arrived > 0 ? (
          <text
            x={tip.x}
            y={tip.y - advanceArrow.labelGap * k}
            textAnchor="middle"
            dominantBaseline="auto"
            fontFamily={fontStack}
            fontWeight={type.weight.medium}
            fontSize={type.size.labelCity * k}
            fill={colors.labelText}
            stroke={colors.labelHalo}
            strokeWidth={stroke.labelHalo * k}
            paintOrder="stroke fill"
            opacity={arrived}
          >
            {label}
          </text>
        ) : null}
      </g>
    </GeoSvg>
  );
};

export const ArrowAdvance: React.FC<z.input<typeof arrowAdvanceSchema>> = (
  props,
) => <ArrowAdvanceView {...arrowAdvanceSchema.parse(props)} />;
