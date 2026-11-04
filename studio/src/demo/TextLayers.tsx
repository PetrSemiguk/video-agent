import { useTextLayoutAudit } from "../components/text/layoutAudit";
import { AbsoluteFill, Sequence } from "remotion";
import { keyframedCamera } from "../camera/keyframes";
import { BigDate, KeyFact, LowerThird, SectionTag } from "../components/text";
import { colors, fontStack, motion, textLayer, type } from "../design/tokens";
import { PlateStage } from "../map/PlateStage";

const camera = keyframedCamera([
  { t: 0, zoom: { cover: 0.15 } },
  { t: textLayer.demo.duration / motion.fps, zoom: { cover: 0.22 } },
]);

export const maximumTextSamples = (stress = false) => {
  const limits = textLayer.limits;
  const emphasis = stress
    ? "M".repeat(limits.emphasis)
    : "over 2,000 years of life";
  return {
    lowerThird: {
      title: stress
        ? "W".repeat(limits.title)
        : "THE HEARTLAND: RIVERS, MOUNTAINS AND THE FAMILIES WHO LIVE HERE.",
      subtitle: stress
        ? "W".repeat(limits.subtitle)
        : "Follow the mountain valleys and river plains to discover the geography of the eastern heartland.",
    },
    sectionTag: {
      text: stress
        ? "W".repeat(limits.tag)
        : "PART 2 / THE GREAT RIVER PLAINS.",
    },
    bigDate: {
      year: 9999,
      era: "BCE" as const,
      caption: stress
        ? "W".repeat(limits.caption)
        : "A large year, an optional era, and a short caption connect the map to the story.",
    },
    keyFact: {
      statement: stress
        ? "W".repeat(48) + emphasis + "W".repeat(48)
        : `The rivers and mountains help imagine ${emphasis} across this landscape, from the valleys to the open seas.`,
      emphasis,
    },
  };
};

export const TextLayersSheet: React.FC<{ stress: boolean }> = ({ stress }) => {
  useTextLayoutAudit(stress);
  const samples = maximumTextSamples(stress);
  const r = textLayer.review;
  const rows = [
    {
      name: "LowerThird",
      note: "64 title / 96 subtitle",
      element: <LowerThird {...samples.lowerThird} placement="flow" />,
    },
    {
      name: "SectionTag",
      note: "32 characters",
      element: (
        <SectionTag {...samples.sectionTag} placement="flow" color="regionB" />
      ),
    },
    {
      name: "BigDate",
      note: "4 digits + BCE / 80 caption",
      element: <BigDate {...samples.bigDate} placement="flow" />,
    },
    {
      name: "KeyFact",
      note: "120 statement / 24 emphasis",
      element: (
        <KeyFact {...samples.keyFact} placement="flow" color="regionB" />
      ),
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
      <div style={{ fontSize: r.titleSize, fontWeight: type.weight.bold }}>
        TEXT LAYERS / MAXIMUM LENGTH {stress ? "/ WIDE-GLYPH STRESS" : ""}
      </div>
      <div style={{ fontSize: r.labelSize, color: colors.labelTextMuted }}>
        Native 1080p typography / no truncation / no font scaling / frame{" "}
        {r.settledFrame}
      </div>
      {rows.map((row) => (
        <div
          data-review-cell
          key={row.name}
          style={{
            display: "flex",
            alignItems: "center",
            height: r.rowHeight,
            flexShrink: 0,
            gap: r.gap,
            padding: textLayer.padding,
            boxSizing: "border-box",
            borderRadius: textLayer.radius,
            background: colors.surface,
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
              style={{ color: colors.labelTextMuted, marginTop: textLayer.gap }}
            >
              {row.note}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>{row.element}</div>
        </div>
      ))}
    </AbsoluteFill>
  );
};

export const TextLayersDemo: React.FC = () => {
  const slot = textLayer.demo.slot;
  return (
    <PlateStage
      plate="china-east-hs05"
      camera={camera}
      screen={
        <>
          <Sequence durationInFrames={slot} layout="none">
            <SectionTag text="PART 2 · THE RIVERS" durationInFrames={slot} />
          </Sequence>
          <Sequence from={slot} durationInFrames={slot} layout="none">
            <LowerThird
              title="THE HEARTLAND"
              subtitle="River plains between the mountains and the sea"
              durationInFrames={slot}
            />
          </Sequence>
          <Sequence from={2 * slot} durationInFrames={slot} layout="none">
            <BigDate
              year={1644}
              era="CE"
              caption="A date connects the map to the story"
              durationInFrames={slot}
            />
          </Sequence>
          <Sequence from={3 * slot} durationInFrames={slot} layout="none">
            <KeyFact
              statement="Two great rivers cross the heartland."
              emphasis="Two great rivers"
              color="regionB"
              durationInFrames={slot}
            />
          </Sequence>
        </>
      }
    />
  );
};
