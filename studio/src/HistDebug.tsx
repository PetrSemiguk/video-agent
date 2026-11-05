// Debug still for historical layers: polities on the plate, labels, big date, attributions.
// Default view fits the whole plate; `focus` + `nativeZoom` give a crop for border checks.
// `rivers` draws named Natural Earth rivers on top, to compare borders with channels.
import { useMemo } from "react";
import { keyframedCamera } from "./camera/keyframes";
import { HistoricalLayer, Polity } from "./components/map/HistoricalLayer";
import { PlaceLabel } from "./components/map/PlaceLabel";
import {
  colors,
  fontStack,
  headlineStack,
  hist,
  space,
  stroke,
  textLayer,
  type,
} from "./design/tokens";
import { GeoSvg, PlateStage, useMapProjection } from "./map/PlateStage";
import { useGeoJson } from "./geo/useGeoJson";

export type HistDebugProps = {
  plate: string;
  /** data/processed/<plate>/historical/<slug>.geojson */
  slug: string;
  year: number;
  caption: string;
  focus?: { lon: number; lat: number };
  /** Zoom levels relative to 1 plate px = 1 frame px; 0 is 1:1. Requires `focus`. */
  nativeZoom?: number;
  rivers?: string[];
};

type River = {
  properties: { name_en: string | null };
  geometry: {
    type: "LineString" | "MultiLineString";
    coordinates: number[][] | number[][][];
  };
};

const riverLines = (geometry: River["geometry"]) =>
  (geometry.type === "LineString"
    ? [geometry.coordinates]
    : geometry.coordinates) as number[][][];

const Rivers: React.FC<{ rivers: River[] }> = ({ rivers }) => {
  const { view, toPlatePx } = useMapProjection();
  return (
    <GeoSvg>
      {rivers.flatMap((river, i) =>
        riverLines(river.geometry).map((line, j) => (
          <path
            key={`${i}-${j}`}
            d={line
              .map(([lon, lat], k) => {
                const p = toPlatePx([lon, lat]);
                return `${k ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
              })
              .join("")}
            fill="none"
            stroke={colors.river}
            strokeWidth={stroke.river.max / view.scale}
          />
        )),
      )}
    </GeoSvg>
  );
};

/**
 * Largest polities first. PlaceLabel pushes a label back inside the safe area, which would
 * pile labels up at the frame edge, so one that does not fit where it belongs is left out.
 */
const Labels: React.FC<{ polities: Polity[] }> = ({ polities }) => {
  const { toScreen, width, height } = useMapProjection();
  const left = width * space.safeArea;
  const top = height * space.safeArea;
  const placed: { x: number; y: number; w: number; h: number }[] = [
    { x: left, y: top, w: hist.dateBox.width, h: hist.dateBox.height },
  ];
  const shown = [...polities]
    .sort((a, b) => b.properties.area_km2 - a.properties.area_km2)
    .filter(({ properties: { label, name_en, area_km2 } }) => {
      if (name_en.length > hist.labelMaxChars) return false;
      const { x, y } = toScreen(label);
      const size =
        area_km2 >= hist.regionLabelMinKm2
          ? type.size.labelRegion
          : type.size.labelCity;
      const w = name_en.length * size * hist.glyphWidth + hist.labelGap;
      const h = size * type.lineHeight + hist.labelGap;
      const box = { x: x - w / 2, y: y - h / 2, w, h };
      const inside =
        box.x >= left &&
        box.x + w <= width - left &&
        box.y >= top &&
        box.y + h <= height * (1 - space.bottomReserve);
      if (
        !inside ||
        placed.some(
          (o) =>
            box.x < o.x + o.w &&
            o.x < box.x + box.w &&
            box.y < o.y + o.h &&
            o.y < box.y + box.h,
        )
      )
        return false;
      placed.push(box);
      return true;
    });
  return (
    <>
      {shown.map(({ properties: { id, label, name_en, area_km2 } }) => (
        <PlaceLabel
          key={id}
          lonLat={label}
          text={name_en}
          kind={area_km2 >= hist.regionLabelMinKm2 ? "region" : "city"}
        />
      ))}
    </>
  );
};

/** No panel: the production BigDate box would hide a third of a debug map. */
const DateBlock: React.FC<{ year: number; caption: string }> = ({
  year,
  caption,
}) => {
  const { width, height } = useMapProjection();
  return (
    <div
      style={{
        position: "absolute",
        left: width * space.safeArea,
        top: height * space.safeArea,
        width: hist.dateBox.width,
        color: colors.labelText,
        WebkitTextStroke: `${stroke.labelHalo}px ${colors.labelHalo}`,
        paintOrder: "stroke fill",
      }}
    >
      <div
        style={{
          fontFamily: headlineStack,
          fontWeight: type.weight.bold,
          fontSize: textLayer.dateSize,
          lineHeight: 1,
          color: colors.regionA,
        }}
      >
        {year}
      </div>
      <div
        style={{
          fontFamily: fontStack,
          fontSize: type.size.labelCity,
          lineHeight: type.lineHeight,
        }}
      >
        {caption}
      </div>
    </div>
  );
};

const FRAMES = 90;
export const HIST_DEBUG_FRAMES = FRAMES;

export const histDebugDefaults: HistDebugProps = {
  plate: "europe",
  slug: "europe-1914",
  year: 1914,
  caption: "1 July 1914",
};

export const HistDebug: React.FC<HistDebugProps> = ({
  plate,
  slug,
  year,
  caption,
  focus,
  nativeZoom,
  rivers,
}) => {
  const data = useGeoJson({
    polities: `geo/${plate}/historical/${slug}.geojson`,
    rivers: `geo/${plate}/rivers.geojson`,
  });
  const camera = useMemo(
    () =>
      keyframedCamera([
        {
          t: 0,
          ...(focus ? { center: focus } : {}),
          zoom: focus ? { native: nativeZoom ?? 0 } : { cover: hist.coverZoom },
        },
      ]),
    [focus, nativeZoom],
  );
  const polities = (data?.polities.features ?? []) as unknown as Polity[];
  const { attribution } = (data?.polities ?? {}) as { attribution?: string };
  const lines = ((data?.rivers.features ?? []) as unknown as River[]).filter(
    (river) => rivers?.some((name) => river.properties.name_en?.includes(name)),
  );
  return (
    <PlateStage
      plate={plate}
      camera={camera}
      extraAttribution={`${attribution ?? ""} · Made with Natural Earth`}
      geo={
        <>
          <HistoricalLayer
            slug={slug}
            credit={attribution ?? slug}
            enterFrames={1}
          />
          <Rivers rivers={lines} />
        </>
      }
      screen={
        <>
          <Labels polities={polities} />
          <DateBlock year={year} caption={caption} />
        </>
      }
    />
  );
};
