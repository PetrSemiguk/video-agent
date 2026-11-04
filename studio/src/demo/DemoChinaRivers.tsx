// Step 1.4 demo: rivers, a highlighted region and city labels on the plate engine (B).
// 20 s @ 30 fps on china-east-hs05. Data: pipeline/vap.geo.river (yellow, yangtze) and
// vap.geo.compose (heartland), mirrored to public/geo/china-east-hs05/.
import { Sequence, useVideoConfig } from "remotion";
import { keyframedCamera } from "../camera/keyframes";
import { PlaceLabel } from "../components/map/PlaceLabel";
import { RegionHighlight } from "../components/map/RegionHighlight";
import { RiverLine } from "../components/map/RiverLine";
import { motion } from "../design/tokens";
import { pointAtFraction } from "../geo/line";
import { useGeoJson } from "../geo/useGeoJson";
import { LonLatTuple, PlateStage } from "../map/PlateStage";

const PLATE = "china-east-hs05";

export const DEMO_CHINA_RIVERS_FRAMES = motion.demo.duration;

// City coordinates from Natural Earth populated_places
// (`uv run python -m vap.geo.find "<name>" --layer places`).
const CITIES: {
  name: string;
  at: LonLatTuple;
  anchor?: "right" | "left" | "top" | "bottom";
}[] = [
  { name: "Beijing", at: [116.3942, 39.9017] },
  { name: "Xi'an", at: [108.8931, 34.277], anchor: "left" },
  { name: "Luoyang", at: [112.4445, 34.6438], anchor: "bottom" },
];

const camera = keyframedCamera([
  { t: 0, zoom: { cover: 0.05 } },
  { t: 3, zoom: { cover: 0.15 }, ease: motion.easing.out },
  { t: 8, center: { lon: 106.5, lat: 33.5 }, zoom: { cover: 0.3 } },
  { t: 12, center: { lon: 107.5, lat: 32.8 }, zoom: { cover: 0.32 } },
  { t: 15, center: { lon: 112.5, lat: 36.2 }, zoom: { cover: 0.55 } },
  { t: 16, center: { lon: 112.7, lat: 36.2 }, zoom: { cover: 0.56 } },
  {
    t: 20,
    center: { lon: 114.5, lat: 35.6 },
    zoom: { native: -0.28 },
    pitch: 12,
    bearing: 3,
  },
]);

// Timeline (frames).
const T = motion.demo;
const YELLOW_LABEL_AT = 0.62; // middle course, past the Ordos loop
const YANGTZE_LABEL_AT = 0.66;

const lineOf = (coll: {
  features: { geometry: unknown; properties: unknown }[];
}) => {
  const f = coll.features[0] as unknown as {
    geometry: { coordinates: [number, number][] };
    properties: { cumfrac: number[] };
  };
  return { points: f.geometry.coordinates, cumfrac: f.properties.cumfrac };
};

export const DemoChinaRivers: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const data = useGeoJson({
    yellow: `geo/${PLATE}/rivers/yellow.geojson`,
    yangtze: `geo/${PLATE}/rivers/yangtze.geojson`,
    heartland: `geo/${PLATE}/custom/heartland.geojson`,
  });
  if (!data) {
    return null;
  }

  const yellowLabel = pointAtFraction(lineOf(data.yellow), YELLOW_LABEL_AT);
  const yangtzeLabel = pointAtFraction(lineOf(data.yangtze), YANGTZE_LABEL_AT);
  const heartlandLabel = (data.heartland.features[0].properties.label ?? [
    113, 36,
  ]) as LonLatTuple;

  return (
    <PlateStage
      plate={PLATE}
      camera={camera}
      extraAttribution="Made with Natural Earth"
      geo={
        <>
          <Sequence
            from={T.heartland}
            durationInFrames={durationInFrames - T.heartland}
            layout="none"
          >
            <RegionHighlight
              geojson={data.heartland}
              color="regionA"
              enterFrames={T.heartlandEnter}
              dimOutside
              outline
            />
          </Sequence>
          <Sequence from={T.yellow} layout="none">
            <RiverLine geojson={data.yellow} drawFrames={T.yellowDraw} glow />
          </Sequence>
          <Sequence from={T.yangtze} layout="none">
            <RiverLine geojson={data.yangtze} drawFrames={T.yangtzeDraw} glow />
          </Sequence>
        </>
      }
      screen={
        <>
          <Sequence from={T.yellow} layout="none">
            <PlaceLabel
              lonLat={yellowLabel}
              text="Yellow River"
              kind="river"
              enterFrame={Math.round(T.yellowDraw * YELLOW_LABEL_AT)}
            />
          </Sequence>
          <Sequence from={T.yangtze} layout="none">
            <PlaceLabel
              lonLat={yangtzeLabel}
              text="Yangtze"
              kind="river"
              enterFrame={Math.round(T.yangtzeDraw * YANGTZE_LABEL_AT)}
            />
          </Sequence>
          <Sequence from={T.heartland} layout="none">
            <PlaceLabel
              lonLat={heartlandLabel}
              text="The Heartland"
              kind="region"
              enterFrame={Math.round(T.heartlandEnter / 2)}
            />
          </Sequence>
          {CITIES.map((c, i) => (
            <Sequence
              key={c.name}
              from={T.cities + i * T.cityStagger}
              layout="none"
            >
              <PlaceLabel
                lonLat={c.at}
                text={c.name}
                kind="city"
                anchor={c.anchor}
              />
            </Sequence>
          ))}
        </>
      }
    />
  );
};
