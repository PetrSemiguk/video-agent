import { TransitionSeries } from "@remotion/transitions";
import { AbsoluteFill, Sequence } from "remotion";
import { keyframedCamera } from "../camera/keyframes";
import { TitleCard } from "../components/cards/TitleCard";
import { EndCard } from "../components/cards/EndCard";
import { BRollClip } from "../components/media/BRollClip";
import { LowerThird, SectionTag, BigDate, KeyFact } from "../components/text";
import {
  BarCompare,
  TimelineBar,
  NumberedList,
  RecapCards,
  StatCounter,
} from "../components/info";
import { RegionHighlight } from "../components/map/RegionHighlight";
import { RiverLine } from "../components/map/RiverLine";
import { PlaceLabel } from "../components/map/PlaceLabel";
import { cards, colors, motion } from "../design/tokens";
import { useGeoJson } from "../geo/useGeoJson";
import { PlateStage } from "../map/PlateStage";
import { sceneTransition, type TransitionSpec } from "../transitions";

const camera = keyframedCamera([
  { t: 0, zoom: { cover: 0.15 } },
  { t: cards.showreel.duration / motion.fps, zoom: { cover: 0.22 } },
]);
const Map: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <PlateStage plate="china-east-hs05" camera={camera} screen={children} />
);
const MapLayers: React.FC = () => {
  const data = useGeoJson({
    yellow: "geo/china-east-hs05/rivers/yellow.geojson",
    yangtze: "geo/china-east-hs05/rivers/yangtze.geojson",
    heartland: "geo/china-east-hs05/custom/heartland.geojson",
  });
  if (!data) return null;
  return (
    <PlateStage
      plate="china-east-hs05"
      camera={camera}
      extraAttribution="Made with Natural Earth"
      geo={
        <>
          <RegionHighlight
            geojson={data.heartland}
            color="regionA"
            dimOutside
          />
          <RiverLine geojson={data.yellow} glow />
          <RiverLine geojson={data.yangtze} glow />
        </>
      }
      screen={
        <>
          <PlaceLabel lonLat={[116.3942, 39.9017]} text="Beijing" kind="city" />
          <PlaceLabel lonLat={[113, 36]} text="The Heartland" kind="region" />
          <PlaceLabel lonLat={[111, 30.5]} text="Yangtze" kind="river" />
        </>
      }
    />
  );
};
const TextExamples: React.FC = () => {
  const slot = cards.showreel.textSlot;
  return (
    <Map>
      <Sequence durationInFrames={slot} layout="none">
        <SectionTag text="PART 2 · THE RIVERS" durationInFrames={slot} />
      </Sequence>
      <Sequence from={slot} durationInFrames={slot} layout="none">
        <LowerThird
          title="THE HEARTLAND"
          subtitle="Rivers, mountain valleys and open plains"
          durationInFrames={slot}
        />
      </Sequence>
      <Sequence from={2 * slot} durationInFrames={slot} layout="none">
        <BigDate
          year={1644}
          era="CE"
          caption="A date places the story in time"
          durationInFrames={slot}
        />
      </Sequence>
      <Sequence from={3 * slot} durationInFrames={slot} layout="none">
        <KeyFact
          statement="Two great rivers cross the heartland."
          emphasis="Two great rivers"
          durationInFrames={slot}
        />
      </Sequence>
    </Map>
  );
};
const GraphicExamples: React.FC = () => {
  const slot = cards.showreel.infoSlot;
  return (
    <AbsoluteFill style={{ background: colors.background }}>
      <Sequence durationInFrames={slot} layout="none">
        <BarCompare
          title="ILLUSTRATIVE DATA / COMMON SCALE"
          unit="index points"
          bars={[
            { label: "River plains", value: 80 },
            { label: "Mountain valleys", value: 45, color: "regionB" },
          ]}
          durationInFrames={slot}
        />
      </Sequence>
      <Sequence from={slot} durationInFrames={slot} layout="none">
        <TimelineBar
          title="ILLUSTRATIVE TIMELINE / BCE TO CE"
          startYear={-500}
          endYear={500}
          events={[
            { year: -221, label: "Example BCE marker" },
            { year: -1, label: "Last BCE year" },
            { year: 1, label: "First CE year", color: "regionB" },
          ]}
          durationInFrames={slot}
        />
      </Sequence>
      <Sequence from={2 * slot} durationInFrames={slot} layout="none">
        <NumberedList
          title="READ THE LANDSCAPE"
          items={[
            "Follow the rivers",
            "Read the mountain barriers",
            "Connect the coast and interior",
          ]}
          durationInFrames={slot}
        />
      </Sequence>
      <Sequence from={3 * slot} durationInFrames={slot} layout="none">
        <RecapCards
          title="SECTION RECAP"
          cards={[
            { title: "Rivers", body: "Trace the channels across the plain." },
            {
              title: "Mountains",
              body: "Read the valleys between the ridges.",
              color: "regionB",
            },
          ]}
          durationInFrames={slot}
        />
      </Sequence>
      <Sequence from={4 * slot} durationInFrames={slot} layout="none">
        <StatCounter
          value={1000000000000}
          label="Illustrative total / layout example"
          unit="index points"
          durationInFrames={slot}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
export const showreelTransitions: TransitionSpec[] = [
  "crossfade",
  "crossfade",
  "map-to-graphic-wipe",
  "dip-to-dark",
  "crossfade",
].map((kind) => ({
  kind: kind as TransitionSpec["kind"],
  durationInFrames: cards.transitionFrames,
}));
export const Showreel: React.FC = () => {
  const d = cards.showreel.scenes;
  const scenes = [
    <Map>
      <TitleCard
        title="THE SHAPE OF THE HEARTLAND"
        subtitle="Rivers, mountains and the geography of connection"
        kicker="GEOGRAPHY / HISTORY"
        durationInFrames={d[0]}
      />
    </Map>,
    <MapLayers />,
    <TextExamples />,
    <GraphicExamples />,
    <BRollClip
      assetId="pexels-earth-1851190"
      durationInFrames={d[4]}
      trimBefore={motion.fps}
    />,
    <Map>
      <RecapCards
        title="A LANDSCAPE TO KEEP EXPLORING"
        cards={[
          { title: "Rivers", body: "Follow the channels across the plain." },
          {
            title: "Terrain",
            body: "Read the ridges and valleys.",
            color: "regionB",
          },
        ]}
        durationInFrames={d[5]}
      />
    </Map>,
  ];
  return (
    <AbsoluteFill style={{ background: colors.background }}>
      <Sequence durationInFrames={cards.showreel.content}>
        <TransitionSeries>
          {scenes.flatMap((scene, i) => [
            <TransitionSeries.Sequence
              key={`scene-${i}`}
              durationInFrames={d[i]}
            >
              {scene}
            </TransitionSeries.Sequence>,
            ...(i < scenes.length - 1
              ? [
                  <TransitionSeries.Transition
                    key={`transition-${i}`}
                    {...sceneTransition(showreelTransitions[i])}
                  />,
                ]
              : []),
          ])}
        </TransitionSeries>
      </Sequence>
      <Sequence
        from={cards.showreel.content}
        durationInFrames={cards.endDuration}
      >
        <Map>
          <EndCard
            title="KEEP EXPLORING"
            subtitle="Follow the rivers. Read the landscape."
          />
        </Map>
      </Sequence>
    </AbsoluteFill>
  );
};
