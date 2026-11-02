// Step 1.5 demo: camera presets + plate transition (europe -> central-europe), ~30 s.
import { useMemo } from "react";
import { Sequence } from "remotion";
import { PlaceLabel } from "../components/map/PlaceLabel";
import { RegionHighlight } from "../components/map/RegionHighlight";
import { RiverLine } from "../components/map/RiverLine";
import { motion } from "../design/tokens";
import { useGeoJson } from "../geo/useGeoJson";
import { LonLatTuple, PlateSequence } from "../map/PlateStage";
import { buildShowreelTimeline, lineOf, SHOWREEL } from "./showreelCamera";

// City coordinates from Natural Earth populated_places (vap.geo.find "<name>" --layer places).
const CITIES: {
  name: string;
  at: LonLatTuple;
  anchor?: "right" | "left" | "top" | "bottom";
}[] = [
  { name: "Vienna", at: [16.3647, 48.202], anchor: "left" },
  { name: "Bratislava", at: [17.117, 48.15], anchor: "right" },
  { name: "Budapest", at: [19.0814, 47.502] },
  { name: "Belgrade", at: [20.466, 44.8206] },
];

/** Length fraction of the point of a line nearest to a location (equirectangular approx.). */
const nearestFraction = (
  line: ReturnType<typeof lineOf>,
  [lon, lat]: LonLatTuple,
) => {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = 0;
  let bestD = Infinity;
  line.points.forEach(([x, y], i) => {
    const d = ((x - lon) * k) ** 2 + (y - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = line.cumfrac[i];
    }
  });
  return best;
};

export const CameraShowreel: React.FC = () => {
  const data = useGeoJson({
    danube: "geo/central-europe/rivers/danube-vienna-belgrade.geojson",
    alps: "geo/europe/custom/alps-che-aut.geojson",
  });
  const timeline = useMemo(
    () => (data ? buildShowreelTimeline(data) : null),
    [data],
  );
  if (!data || !timeline) return null;

  const S = SHOWREEL;
  const line = lineOf(data.danube);
  const plainEnter = S.plainLabelAt;

  return (
    <PlateSequence
      plates={[...S.plates]}
      transitionAt={S.transitionAt}
      transitionFrames={S.transitionFrames}
      camera={timeline.path}
      extraAttribution="Made with Natural Earth"
      geo={
        <>
          <Sequence
            from={S.alpsIn}
            durationInFrames={S.alpsOut - S.alpsIn + motion.frames.slow}
            layout="none"
          >
            <RegionHighlight
              geojson={data.alps}
              color="neutral"
              outline
              exitAt={S.alpsOut - S.alpsIn}
            />
          </Sequence>
          <Sequence from={S.riverStart} layout="none">
            <RiverLine geojson={data.danube} drawFrames={S.riverDraw} glow />
          </Sequence>
        </>
      }
      screen={
        <>
          {CITIES.map((c) => (
            <Sequence
              key={c.name}
              from={
                S.riverStart +
                Math.max(
                  0,
                  Math.round(nearestFraction(line, c.at) * S.riverDraw) -
                    motion.frames.fast,
                )
              }
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
          <Sequence from={plainEnter} layout="none">
            <PlaceLabel
              lonLat={[...S.plainLabel]}
              text="Great Hungarian Plain"
              kind="region"
            />
          </Sequence>
        </>
      }
    />
  );
};
