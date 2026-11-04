import { AbsoluteFill, Sequence } from "remotion";
import { keyframedCamera } from "../camera/keyframes";
import {
  BarCompare,
  TimelineBar,
  NumberedList,
  RecapCards,
  StatCounter,
} from "../components/info";
import { useInfoLayoutAudit } from "../components/info/layoutAudit";
import {
  colors,
  fontStack,
  infoLayer,
  motion,
  textLayer,
  type,
} from "../design/tokens";
import { PlateStage } from "../map/PlateStage";

const camera = keyframedCamera([
  { t: 0, zoom: { cover: 0.15 } },
  { t: infoLayer.demo.duration / motion.fps, zoom: { cover: 0.22 } },
]);
export const maximumInfoSamples = (stress = false) => {
  const l = infoLayer.limits;
  const label = stress
    ? "W".repeat(l.label)
    : "A landscape of rivers, mountains and open plains";
  const body = stress
    ? "W".repeat(l.item)
    : "A landscape of rivers, mountains, valleys and the people that live between them.";
  const title = stress ? "W".repeat(l.title) : label.toUpperCase();
  const unit = stress ? "W".repeat(l.unit) : "index points";
  return {
    barCompare: {
      title,
      unit,
      decimals: 2,
      bars: [
        -infoLayer.valueLimit,
        -123456789.99,
        0,
        123456789.99,
        infoLayer.valueLimit,
      ].map((value, i) => ({
        label,
        value,
        color: i % 2 ? ("regionB" as const) : ("regionA" as const),
      })),
    },
    timelineBar: {
      title,
      startYear: -9999,
      endYear: 9999,
      events: [-9999, -1, 1, 1, 9999].map((year) => ({ year, label })),
    },
    numberedList: { title, items: Array.from({ length: 5 }, () => body) },
    recapCards: {
      title,
      cards: Array.from({ length: 4 }, (_, i) => ({
        title: stress
          ? "W".repeat(l.cardTitle)
          : "MOUNTAIN VALLEYS AND RIVER PLAIN",
        body,
        color: i % 2 ? ("regionB" as const) : ("regionA" as const),
      })),
    },
    statCounter: {
      value: -infoLayer.valueLimit,
      from: infoLayer.valueLimit,
      decimals: 2,
      label: body,
      unit,
    },
  };
};
export const InfoSheet: React.FC<{ stress: boolean }> = ({ stress }) => {
  useInfoLayoutAudit(stress);
  const s = maximumInfoSamples(stress),
    r = infoLayer.review;
  const rows = [
    {
      name: "BarCompare",
      note: "5 bars / signed extremes / zero",
      content: <BarCompare {...s.barCompare} placement="flow" />,
    },
    {
      name: "TimelineBar",
      note: "5 markers / coincident dates / BCE–CE",
      content: <TimelineBar {...s.timelineBar} placement="flow" />,
    },
    {
      name: "NumberedList",
      note: "5 items / 80 characters each",
      content: <NumberedList {...s.numberedList} placement="flow" />,
    },
    {
      name: "RecapCards",
      note: "4 cards / 32 title / 80 body",
      content: <RecapCards {...s.recapCards} placement="flow" />,
    },
    {
      name: "StatCounter",
      note: "−1 trillion / 2 decimals / 80 label",
      content: <StatCounter {...s.statCounter} placement="flow" />,
    },
  ];
  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        color: colors.labelText,
        fontFamily: fontStack,
        padding: r.padding,
        gap: r.gap,
      }}
    >
      <div
        style={{ fontSize: infoLayer.titleSize, fontWeight: type.weight.bold }}
      >
        INFOGRAPHICS / MAXIMUM CONTENT {stress ? "/ WIDE-GLYPH STRESS" : ""}
      </div>
      <div style={{ fontSize: r.labelSize, color: colors.labelTextMuted }}>
        Native 1080p type / en-US numbers / synthetic data / all limits
        exercised
      </div>
      {rows.map((row, i) => (
        <div
          data-info-cell
          key={row.name}
          style={{
            height: r.rows[i],
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: r.gap,
            padding: textLayer.padding,
            boxSizing: "border-box",
            background: colors.surface,
            borderRadius: textLayer.radius,
          }}
        >
          <div
            style={{
              width: r.labelWidth,
              flexShrink: 0,
              fontSize: r.labelSize,
            }}
          >
            <div style={{ fontWeight: type.weight.bold }}>{row.name}</div>
            <div
              style={{ marginTop: infoLayer.gap, color: colors.labelTextMuted }}
            >
              {row.note}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>{row.content}</div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
export const InfoDemo: React.FC = () => {
  const slot = infoLayer.demo.slot;
  return (
    <PlateStage
      plate="china-east-hs05"
      camera={camera}
      screen={
        <>
          <Sequence durationInFrames={slot} layout="none">
            <BarCompare
              title="ILLUSTRATIVE DATA / INDEX COMPARISON"
              unit="index points"
              bars={[
                { label: "River plains", value: 80 },
                { label: "Mountain valleys", value: 45, color: "regionB" },
                { label: "Coastal lowlands", value: 65, color: "neutral" },
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
                { year: 300, label: "Example CE marker", color: "regionB" },
              ]}
              durationInFrames={slot}
            />
          </Sequence>
          <Sequence from={2 * slot} durationInFrames={slot} layout="none">
            <NumberedList
              title="READ THE LANDSCAPE"
              items={[
                "Follow the river plains",
                "Read the mountain barriers",
                "Connect the coast to the interior",
              ]}
              durationInFrames={slot}
            />
          </Sequence>
          <Sequence from={3 * slot} durationInFrames={slot} layout="none">
            <RecapCards
              title="THE GEOGRAPHY / SECTION RECAP"
              cards={[
                {
                  title: "Rivers",
                  body: "Trace the channels across the plain.",
                },
                {
                  title: "Mountains",
                  body: "Follow the valleys between the ridges.",
                  color: "regionB",
                },
                { title: "Plains", body: "Look for broad connections inland." },
                {
                  title: "Coast",
                  body: "Connect the inland view to the sea.",
                  color: "regionB",
                },
              ]}
              durationInFrames={slot}
            />
          </Sequence>
          <Sequence from={4 * slot} durationInFrames={slot} layout="none">
            <StatCounter
              value={infoLayer.valueLimit}
              label="Illustrative total / layout example only"
              unit="index points"
              durationInFrames={slot}
            />
          </Sequence>
        </>
      }
    />
  );
};
