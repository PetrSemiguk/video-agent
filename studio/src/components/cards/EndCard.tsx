import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import {
  cards,
  colors,
  fontStack,
  headlineStack,
  motion,
  space,
  type,
} from "../../design/tokens";
import { shortText } from "../text/shared";

export const endCardSchema = z.strictObject({
  title: shortText(cards.endTitleLimit),
  subtitle: shortText(cards.endSubtitleLimit).optional(),
  durationInFrames: z
    .number()
    .int()
    .min(cards.endDuration)
    .max(cards.endDuration)
    .default(cards.endDuration),
});
export type EndCardProps = z.input<typeof endCardSchema>;
export const EndCard: React.FC<EndCardProps> = (input) => {
  const p = endCardSchema.parse(input),
    frame = useCurrentFrame(),
    { width, height } = useVideoConfig();
  const opacity = interpolate(frame, [0, motion.frames.base], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
  return (
    <AbsoluteFill style={{ background: cards.endShade }}>
      <div
        data-card="EndCard"
        style={{
          position: "absolute",
          left: width * space.safeArea,
          top: height * space.safeArea,
          bottom: height * space.bottomReserve,
          width: cards.endWidth,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: cards.gap,
          opacity,
          color: colors.labelText,
          lineHeight: type.lineHeight,
          overflowWrap: "anywhere",
        }}
      >
        <div
          data-card-text
          style={{
            fontFamily: headlineStack,
            fontWeight: type.weight.bold,
            fontSize: cards.endTitleSize,
          }}
        >
          {p.title}
        </div>
        {p.subtitle ? (
          <div
            data-card-text
            style={{ fontFamily: fontStack, fontSize: cards.subtitleSize }}
          >
            {p.subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
