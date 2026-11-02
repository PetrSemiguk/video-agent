// Highlights a polygon region in the PlateStage geo layer.
// Fill fades to opacity.regionFill; the outline is drawn around the perimeter
// (stroke-dashoffset with pathLength = 1 per ring); dimOutside darkens everything outside
// the region with an even-odd mask built from the very same rings (no seams).
// Timing: frames from the start of the enclosing <Sequence>.
import { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import {
  colors,
  motion,
  opacity,
  RegionColor,
  regionColor,
  stroke,
} from "../../design/tokens";
import type { GeoCollection, GeoFeature, Geometry } from "../../geo/geojson";
import { GeoSvg, useMapProjection } from "../../map/PlateStage";

const ringsOf = (g: Geometry): [number, number][][] =>
  g.type === "Polygon"
    ? g.coordinates
    : g.type === "MultiPolygon"
      ? g.coordinates.flat()
      : [];

export const RegionHighlight: React.FC<{
  geojson: GeoCollection | GeoFeature;
  color: RegionColor;
  enterFrames?: number;
  outline?: boolean;
  dimOutside?: boolean;
}> = ({
  geojson,
  color,
  enterFrames = motion.frames.slow,
  outline = true,
  dimOutside = false,
}) => {
  const frame = useCurrentFrame();
  const { meta, view, toPlatePx } = useMapProjection();

  const rings = useMemo(() => {
    const feats =
      geojson.type === "FeatureCollection" ? geojson.features : [geojson];
    return feats
      .flatMap((f) => ringsOf(f.geometry))
      .map(
        (ring) =>
          ring
            .map((ll, i) => {
              const p = toPlatePx(ll);
              return `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
            })
            .join("") + "Z",
      );
    // toPlatePx depends only on the plate, not on the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, meta]);

  const p = interpolate(frame, [0, enterFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
  const fillColor = regionColor[color];
  const k = 1 / view.scale; // plate px per screen px
  const all = rings.join("");
  // A rectangle far larger than the plate: the even-odd hole is the region itself.
  const pad = Math.max(meta.width, meta.height) * 2;
  const outer = `M${-pad} ${-pad}H${meta.width + pad}V${meta.height + pad}H${-pad}Z`;

  return (
    <GeoSvg>
      {dimOutside ? (
        <path
          d={outer + all}
          fill={colors.dimOverlay}
          fillRule="evenodd"
          opacity={opacity.dimOutside * p}
        />
      ) : null}
      <path
        d={all}
        fill={fillColor}
        fillRule="evenodd"
        opacity={opacity.regionFill * p}
      />
      {outline
        ? rings.map((d, i) => (
            <path
              key={i}
              d={d}
              pathLength={1}
              fill="none"
              stroke={fillColor}
              strokeWidth={stroke.regionOutline * k}
              strokeLinejoin="round"
              strokeDasharray="1 1"
              strokeDashoffset={1 - p}
            />
          ))
        : null}
    </GeoSvg>
  );
};
