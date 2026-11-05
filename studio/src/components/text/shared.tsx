import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import {
  colors,
  fontStack,
  motion,
  space,
  textLayer,
  type,
} from "../../design/tokens";

export const shortText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\r\n\t]+$/, "Use a single paragraph without control whitespace");
export const placementSchema = z.enum([
  "lower-left",
  "upper-left",
  "lower-right",
  "upper-right",
  "center",
  "flow",
]);
export type TextPlacement = z.infer<typeof placementSchema>;
export const commonShape = {
  durationInFrames: z
    .number()
    .int()
    .min(2 * motion.frames.base + 1)
    .max(textLayer.maxDuration)
    .default(textLayer.defaultDuration),
  color: z
    .enum(["regionA", "regionB", "conflict", "neutral"])
    .default("regionA"),
};

/** Last visible frame is fully transparent; seeking yields the same result. */
export const textAnimationAt = (frame: number, duration: number) => {
  const enter = interpolate(frame, [0, motion.frames.base], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
  const exit = interpolate(
    frame,
    [duration - motion.frames.base, duration - 1],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: motion.easing.in,
    },
  );
  return {
    opacity: enter * (1 - exit),
    shift: space.enterShift * (1 - enter + exit),
  };
};

export const TextFrame: React.FC<{
  name: string;
  duration: number;
  placement: TextPlacement;
  children: ReactNode;
  accent?: string;
  /** Size the card to its content between the textLayer.fit widths. */
  fit?: boolean;
}> = ({ name, duration, placement, children, accent, fit = false }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const animation = textAnimationAt(frame, duration);
  const safeWidth = width * (1 - 2 * space.safeArea);
  const right = placement === "lower-right" || placement === "upper-right";
  const lower = placement === "lower-left" || placement === "lower-right";
  const upper = placement === "upper-left" || placement === "upper-right";
  const position: CSSProperties =
    placement === "flow"
      ? { position: "relative" }
      : {
          position: "absolute",
          ...(right
            ? { right: width * space.safeArea }
            : {
                left:
                  placement === "center"
                    ? (width - Math.min(textLayer.maxWidth, safeWidth)) / 2
                    : width * space.safeArea,
              }),
          ...(lower
            ? { bottom: height * space.bottomReserve + space.enterShift }
            : {
                top: upper
                  ? height * space.safeArea
                  : height * space.safeArea +
                    (height * (1 - space.safeArea - space.bottomReserve)) / 2,
                ...(placement === "center" ? { translate: "0 -50%" } : {}),
              }),
        };
  return (
    <div
      data-text-layer={name}
      style={{
        ...position,
        ...(fit
          ? {
              width: "fit-content",
              minWidth: textLayer.fit.minWidth,
              maxWidth: Math.min(textLayer.fit.maxWidth, safeWidth),
            }
          : {
              width: Math.min(textLayer.maxWidth, safeWidth),
              maxWidth: "100%",
            }),
        boxSizing: "border-box",
        padding: textLayer.padding,
        borderRadius: textLayer.radius,
        borderLeft: accent ? `${textLayer.bar}px solid ${accent}` : undefined,
        background: textLayer.background,
        color: colors.labelText,
        fontFamily: fontStack,
        lineHeight: type.lineHeight,
        overflowWrap: "anywhere",
        whiteSpace: "normal",
        opacity: animation.opacity,
        transform: `translateY(${animation.shift}px)`,
      }}
    >
      {children}
    </div>
  );
};
