import type { ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import {
  colors,
  headlineStack,
  infoLayer,
  motion,
  textLayer,
  type,
} from "../../design/tokens";
import {
  placementSchema,
  shortText,
  TextFrame,
  type TextPlacement,
} from "../text/shared";

export { shortText };
export const semanticSchema = z.enum([
  "regionA",
  "regionB",
  "conflict",
  "neutral",
]);
export const boundedValue = z
  .number()
  .min(-infoLayer.valueLimit)
  .max(infoLayer.valueLimit);
export const infoCommon = {
  durationInFrames: z
    .number()
    .int()
    .min(2 * motion.frames.base + 4 * motion.stagger + 1)
    .max(textLayer.maxDuration)
    .default(infoLayer.defaultDuration),
  placement: placementSchema.default("center"),
};
export const titledShape = {
  ...infoCommon,
  title: shortText(infoLayer.limits.title),
};
export const growthAt = (frame: number, delay = 0) =>
  interpolate(frame - delay, [0, motion.frames.slow], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
export const countValueAt = (frame: number, from: number, to: number) =>
  from + (to - from) * growthAt(frame);
export const revealAt = (frame: number, index: number) =>
  interpolate(frame - index * motion.stagger, [0, motion.frames.base], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
export const formatNumber = (value: number, decimals = 0) => {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rounded === 0 ? 0 : rounded);
};
export const formatYear = (year: number) =>
  `${Math.abs(year)} ${year < 0 ? "BCE" : "CE"}`;
export const yearOrdinal = (year: number) => (year < 0 ? year + 1 : year);
export const ordinalYear = (ordinal: number) =>
  ordinal <= 0 ? ordinal - 1 : ordinal;
export const yearFraction = (year: number, start: number, end: number) =>
  (yearOrdinal(year) - yearOrdinal(start)) /
  (yearOrdinal(end) - yearOrdinal(start));

export const InfoFrame: React.FC<{
  name: string;
  title?: string;
  unit?: string;
  duration: number;
  placement: TextPlacement;
  children: ReactNode;
  fit?: boolean;
}> = ({ name, title, unit, duration, placement, children, fit }) => (
  <TextFrame name={name} duration={duration} placement={placement} fit={fit}>
    {title ? (
      <div
        data-info-box
        style={{
          fontFamily: headlineStack,
          fontSize: infoLayer.titleSize,
          fontWeight: type.weight.bold,
          marginBottom: infoLayer.gap,
        }}
      >
        {title}
      </div>
    ) : null}
    {unit ? (
      <div
        data-info-box
        style={{
          fontSize: infoLayer.smallSize,
          color: colors.labelTextMuted,
          marginBottom: infoLayer.sectionGap,
        }}
      >
        Unit: {unit}
      </div>
    ) : null}
    {children}
  </TextFrame>
);
export const useInfoFrame = () => useCurrentFrame();
