import { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import {
  colors,
  fontStack,
  headlineStack,
  motion,
  regionColor,
  routeLine,
  stroke,
  type,
} from "../../design/tokens";
import type { GeoFeature } from "../../geo/geojson";
import { polylineD, sliceByFraction, type MeasuredLine } from "../../geo/line";
import { GeoSvg, useMapProjection } from "../../map/PlateStage";
import { lineExitOpacity } from "./lineExit";
import { routeLineSchema } from "./schemas";
export { routeLineSchema } from "./schemas";

// Draws a route (vap.geo.route output) at constant speed along its length, branch after branch.
// Node labels and arrows appear when the head passes them. Sizes are divided by view.scale, as
// geo children live inside the transformed plate. Timing: frames of the enclosing <Sequence>.
type Node = {
  name: string;
  lonlat: [number, number];
  fraction: number;
  label: boolean;
};
type Pt = { x: number; y: number };

/** Progress of each branch for overall progress p, by its share of the total length. */
export const branchProgress = (lengths: number[], p: number): number[] => {
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  let start = 0;
  return lengths.map((length) => {
    const share = length / total;
    const value = share > 0 ? (p - start) / share : 1;
    start += share;
    return Math.min(1, Math.max(0, value));
  });
};

/** Fractions along a branch where direction arrows sit. */
export const arrowFractions = (lengthKm: number): number[] => {
  const n = Math.max(1, Math.round(lengthKm / routeLine.arrowEveryKm));
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
};

const fractionPoint = (line: MeasuredLine<Pt>, f: number) => {
  const piece = sliceByFraction(
    line,
    Math.max(0, f - routeLine.tangentFraction),
    f + routeLine.tangentFraction,
  );
  const a = piece[0];
  const b = piece[piece.length - 1];
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    dx: b.x - a.x,
    dy: b.y - a.y,
  };
};

const RouteLineView: React.FC<z.output<typeof routeLineSchema>> = ({
  geojson,
  drawFrames,
  style,
  color,
  arrows,
  label,
  nodeAnchors,
  durationInFrames,
  exitFrames,
}) => {
  const frame = useCurrentFrame();
  const { meta, view, toPlatePx } = useMapProjection();
  const branches = useMemo(
    () =>
      (geojson.features as GeoFeature[]).map((feature) => {
        const properties = feature.properties as unknown as {
          cumfrac: number[];
          length_km?: number;
          nodes?: Node[];
        };
        const coordinates = feature.geometry.coordinates as [number, number][];
        return {
          line: {
            points: coordinates.map((c) => toPlatePx(c)),
            cumfrac: properties.cumfrac,
          },
          length: properties.length_km ?? 1,
          nodes: properties.nodes ?? [],
        };
      }),
    // toPlatePx depends only on the plate, not on the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geojson, meta],
  );
  const p = interpolate(frame, [0, drawFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (p <= 0) return null;
  const k = 1 / view.scale;
  const fill = regionColor[color];
  const progress = branchProgress(
    branches.map((b) => b.length),
    p,
  );
  const dash = style === "dashed" ? routeLine.dash.join(" ") : undefined;
  const seen = new Set<string>();
  const appear = interpolate(p, [0, routeLine.enterFraction], [0, 1], {
    extrapolateRight: "clamp",
  });
  const labelOpacity = interpolate(frame, [0, motion.frames.base], [0, 1], {
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
  return (
    <GeoSvg
      style={{ opacity: lineExitOpacity(frame, durationInFrames, exitFrames) }}
    >
      {branches.map((branch, i) => {
        const d = polylineD(sliceByFraction(branch.line, 0, progress[i]));
        if (!d) return null;
        return (
          <g
            key={i}
            fill="none"
            strokeLinecap={dash ? "butt" : "round"}
            strokeLinejoin="round"
          >
            <path
              d={d}
              stroke={colors.routeCasing}
              strokeWidth={(stroke.route + stroke.routeHalo) * k}
            />
            <path
              d={d}
              stroke={fill}
              strokeWidth={stroke.route * k}
              strokeDasharray={dash}
              opacity={appear}
            />
          </g>
        );
      })}
      {arrows
        ? branches.flatMap((branch, i) =>
            arrowFractions(branch.length)
              .filter((f) => f <= progress[i])
              .map((f) => {
                const c = fractionPoint(branch.line, f);
                const angle = (Math.atan2(c.dy, c.dx) * 180) / Math.PI;
                const l = (routeLine.arrowLength * k) / 2;
                const w = (routeLine.arrowWidth * k) / 2;
                return (
                  <path
                    key={`${i}-${f}`}
                    d={`M${l} 0L${-l} ${w}L${-l} ${-w}Z`}
                    fill={fill}
                    stroke={colors.routeCasing}
                    strokeWidth={stroke.border * k}
                    transform={`translate(${c.x} ${c.y}) rotate(${angle})`}
                  />
                );
              }),
          )
        : null}
      {branches.flatMap((branch, i) =>
        branch.nodes
          .filter((node) => {
            if (!node.label || seen.has(node.name)) return false;
            seen.add(node.name);
            return node.fraction <= progress[i] + 1e-6 && progress[i] > 0;
          })
          .map((node) => {
            const at = toPlatePx(node.lonlat);
            const left = nodeAnchors[node.name] === "left";
            const gap = routeLine.labelGap * k;
            return (
              <g key={node.name}>
                <circle
                  cx={at.x}
                  cy={at.y}
                  r={(routeLine.nodeDot / 2) * k}
                  fill={colors.labelText}
                  stroke={colors.labelHalo}
                  strokeWidth={stroke.labelHalo * 0.5 * k}
                />
                <text
                  x={at.x + (left ? -gap : gap)}
                  y={at.y}
                  dominantBaseline="middle"
                  textAnchor={left ? "end" : "start"}
                  fontFamily={fontStack}
                  fontWeight={type.weight.medium}
                  fontSize={type.size.labelCity * k}
                  fill={colors.labelText}
                  stroke={colors.labelHalo}
                  strokeWidth={stroke.labelHalo * k}
                  paintOrder="stroke fill"
                >
                  {node.name}
                </text>
              </g>
            );
          }),
      )}
      {label
        ? (() => {
            const at = toPlatePx(label.lonLat);
            return (
              <text
                x={at.x}
                y={at.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily={headlineStack}
                fontWeight={type.weight.bold}
                fontSize={type.size.labelRegion * k}
                letterSpacing={`${type.tracking.region}em`}
                fill={fill}
                stroke={colors.labelHalo}
                strokeWidth={stroke.labelHalo * k}
                paintOrder="stroke fill"
                opacity={labelOpacity}
              >
                {label.text}
              </text>
            );
          })()
        : null}
    </GeoSvg>
  );
};

export const RouteLine: React.FC<z.input<typeof routeLineSchema>> = (props) => (
  <RouteLineView {...routeLineSchema.parse(props)} />
);
