import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from "remotion";
import { colors, fontStack, styleReview as s, type } from "./tokens";

if (typeof document !== "undefined") {
  const handle = delayRender("Loading headline candidates");
  Promise.all(
    s.candidates.map((candidate) =>
      new FontFace(candidate.family, `url(${staticFile(candidate.file)})`, {
        weight: candidate.descriptor,
      }).load(),
    ),
  )
    .then((faces) => {
      faces.forEach((face) => document.fonts.add(face));
      continueRender(handle);
    })
    .catch(cancelRender);
}

const swatches = [
  ["Region A", colors.regionA],
  ["Region B", colors.regionB],
  ["Conflict", colors.conflict],
  ["Neutral", colors.neutralRegion],
  ["River", colors.river],
  ["Text", colors.labelText],
];

export const StyleSheet: React.FC = () => (
  <AbsoluteFill
    style={{
      background: colors.background,
      color: colors.labelText,
      fontFamily: fontStack,
      padding: s.padding,
      gap: s.gap,
      lineHeight: type.lineHeight,
    }}
  >
    <div style={{ fontSize: s.heading, fontWeight: type.weight.bold }}>
      CHANNEL DESIGN / 2.1 — FONT REVIEW
    </div>
    <div style={{ fontSize: s.caption, color: s.muted }}>
      Three local OFL headline families + Inter body · v1 palette and scale ·
      selected: Barlow Condensed + Inter
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: s.gap,
      }}
    >
      {s.candidates.map((candidate) => (
        <div
          key={candidate.family}
          style={{
            background: s.surface,
            borderRadius: s.radius,
            padding: s.cardPadding,
          }}
        >
          <div style={{ fontSize: s.caption, color: s.muted }}>
            {candidate.note}
          </div>
          <div style={{ fontSize: s.body, marginTop: s.gap }}>
            {candidate.name} + Inter
          </div>
          <div
            style={{
              fontFamily: candidate.family,
              fontWeight: candidate.weight,
              letterSpacing: s.tracking,
            }}
          >
            <div style={{ fontSize: s.headline, marginTop: s.gap }}>
              THE HEARTLAND
            </div>
            <div style={{ fontSize: s.date, color: colors.regionA }}>1644</div>
          </div>
          <div style={{ fontSize: s.body, marginTop: s.gap }}>Yellow River</div>
          <div style={{ fontSize: s.caption, marginTop: s.gap }}>Beijing</div>
        </div>
      ))}
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: s.gap,
      }}
    >
      {swatches.map(([label, color]) => (
        <div key={label}>
          <div
            style={{
              background: color,
              height: s.swatchHeight,
              borderRadius: s.radius,
            }}
          />
          <div style={{ fontSize: s.caption }}>{label}</div>
        </div>
      ))}
    </div>
    <div style={{ display: "flex", gap: s.gap }}>
      {s.polity.map((color) => (
        <div
          key={color}
          style={{
            background: color,
            height: s.swatchHeight,
            flex: 1,
            borderRadius: s.radius,
          }}
        />
      ))}
    </div>
    <div style={{ display: "flex", gap: s.gap, alignItems: "baseline" }}>
      {s.proposedScale.map((size) => (
        <span key={size} style={{ fontSize: size }}>
          {size}
        </span>
      ))}
    </div>
    <div style={{ fontSize: s.caption, color: s.muted }}>
      1080p scale · minimum 26 px · title safe 5% · reserve bottom 12% for
      playback UI / captions
    </div>
  </AbsoluteFill>
);
