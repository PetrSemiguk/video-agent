import { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import {
  motion,
  opacity,
  polityPalette,
  RegionColor,
  regionColor,
  stroke,
} from "../../design/tokens";
import { useGeoJson } from "../../geo/useGeoJson";
import { GeoSvg, useMapProjection } from "../../map/PlateStage";
import { historicalLayerSchema } from "./schemas";
export { historicalLayerSchema } from "./schemas";

// Fills every polity of a historical layer in the PlateStage geo layer. The layer comes from
// data/processed/<plate>/historical/<slug>.geojson, mirrored to public/geo. `vap.geo.hist`
// gives each polity a palette index that differs from its neighbours; a composed map may set
// a semantic color role instead.
export type Polity = {
  properties: {
    id: string;
    name_en: string;
    label: [number, number];
    area_km2: number;
    palette_index: number;
    color_role?: RegionColor;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

export const polityColor = ({ properties }: Polity) =>
  properties.color_role
    ? regionColor[properties.color_role]
    : polityPalette[properties.palette_index];

const ringsOf = (geometry: Polity["geometry"]) =>
  (geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates) as number[][][][];

const HistoricalLayerView: React.FC<{
  slug: string;
  enterFrames: number;
}> = ({ slug, enterFrames }) => {
  const frame = useCurrentFrame();
  const { meta, view, toPlatePx } = useMapProjection();
  const data = useGeoJson({
    layer: `geo/${meta.name}/historical/${slug}.geojson`,
  });
  const polities = (data?.layer.features ?? []) as unknown as Polity[];
  const paths = useMemo(
    () =>
      polities.map((polity) =>
        ringsOf(polity.geometry)
          .flat()
          .map(
            (ring) =>
              ring
                .map(([lon, lat], i) => {
                  const p = toPlatePx([lon, lat]);
                  return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
                })
                .join("") + "Z",
          )
          .join(""),
      ),
    // toPlatePx depends only on the plate, not on the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [polities, meta],
  );
  const appear = interpolate(frame, [0, enterFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
  return (
    <GeoSvg style={{ opacity: appear }}>
      {polities.map((polity, i) => (
        <path
          key={polity.properties.id}
          d={paths[i]}
          fill={polityColor(polity)}
          fillRule="evenodd"
          opacity={opacity.polityFill}
        />
      ))}
      {polities.map((polity, i) => (
        <path
          key={polity.properties.id}
          d={paths[i]}
          fill="none"
          stroke={polityColor(polity)}
          strokeWidth={stroke.polityBorder / view.scale}
          strokeLinejoin="round"
        />
      ))}
    </GeoSvg>
  );
};

export const HistoricalLayer: React.FC<
  z.input<typeof historicalLayerSchema>
> = (props) => {
  const { slug, enterFrames } = historicalLayerSchema.parse(props);
  return <HistoricalLayerView slug={slug} enterFrames={enterFrames} />;
};
