import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import {
  cards,
  colors,
  fontStack,
  headlineStack,
  motion,
  regionColor,
  space,
  type,
} from "../../design/tokens";
import { commonShape, shortText, textAnimationAt } from "../text/shared";

export const titleCardSchema = z.strictObject({
  ...commonShape,
  title: shortText(cards.titleLimit),
  subtitle: shortText(cards.subtitleLimit).optional(),
  kicker: shortText(cards.kickerLimit).optional(),
});
export type TitleCardProps = z.input<typeof titleCardSchema>;
export const TitleCard: React.FC<TitleCardProps> = (input) => {
  const p = titleCardSchema.parse(input),
    f = useCurrentFrame(),
    { width, height } = useVideoConfig();
  const a = textAnimationAt(f, p.durationInFrames);
  const hero = p.title.length <= cards.hero.maxChars;
  const push = hero
    ? interpolate(f, [0, p.durationInFrames], [1, cards.hero.push], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  return (
    <div
      data-card="TitleCard"
      style={{
        position: "absolute",
        left: width * space.safeArea,
        top: height * space.safeArea,
        bottom: height * space.bottomReserve,
        width: Math.min(cards.titleWidth, width * (1 - 2 * space.safeArea)),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: cards.gap,
        color: colors.labelText,
        opacity: a.opacity,
        transform: `translateY(${a.shift}px) scale(${push})`,
        transformOrigin: "0% 50%",
        overflowWrap: "anywhere",
        lineHeight: type.lineHeight,
        textShadow: hero ? cards.hero.halo : undefined,
      }}
    >
      {p.kicker ? (
        <div
          data-card-text
          style={{
            fontFamily: fontStack,
            fontSize: cards.kickerSize,
            color: regionColor[p.color],
            letterSpacing: `${type.tracking.caps}em`,
          }}
        >
          {p.kicker}
        </div>
      ) : null}
      <div
        data-card-text
        style={{
          fontFamily: headlineStack,
          fontWeight: type.weight.bold,
          fontSize: hero ? cards.hero.titleSize : cards.titleSize,
          letterSpacing: hero ? `${cards.hero.tracking}em` : undefined,
        }}
      >
        {p.title}
      </div>
      {p.subtitle ? (
        <div
          data-card-text
          style={{
            fontFamily: fontStack,
            fontSize: hero ? cards.hero.subtitleSize : cards.subtitleSize,
          }}
        >
          {p.subtitle}
        </div>
      ) : null}
      <div
        style={{
          height: space.grid,
          width:
            width *
            space.safeArea *
            interpolate(f, [0, motion.frames.slow], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: motion.easing.out,
            }),
          background: regionColor[p.color],
        }}
      />
    </div>
  );
};
