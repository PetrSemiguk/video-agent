import { interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import {
  colors,
  headlineStack,
  motion,
  regionColor,
  textLayer,
  type,
} from "../../design/tokens";
import { commonShape, placementSchema, shortText, TextFrame } from "./shared";

export const bigDateSchema = z.strictObject({
  ...commonShape,
  placement: placementSchema.default("center"),
  year: z.number().int().min(1).max(9999),
  fromYear: z.number().int().min(0).max(9999).default(0),
  era: z.enum(["BCE", "CE"]).optional(),
  caption: shortText(textLayer.limits.caption).optional(),
});
export type BigDateProps = z.input<typeof bigDateSchema>;
export const countYearAt = (frame: number, from: number, to: number) =>
  Math.round(
    interpolate(frame, [0, motion.frames.slow], [from, to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: motion.easing.out,
    }),
  );
export const BigDate: React.FC<BigDateProps> = (input) => {
  const props = bigDateSchema.parse(input);
  const year = countYearAt(useCurrentFrame(), props.fromYear, props.year);
  return (
    <TextFrame
      name="BigDate"
      duration={props.durationInFrames}
      placement={props.placement}
    >
      <div
        data-text-content
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: textLayer.gap,
          fontFamily: headlineStack,
          fontWeight: type.weight.bold,
          color: regionColor[props.color],
        }}
      >
        <span
          style={{
            fontSize: textLayer.dateSize,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {year}
        </span>
        {props.era ? (
          <span style={{ fontSize: textLayer.eraSize }}>{props.era}</span>
        ) : null}
      </div>
      {props.caption ? (
        <div
          data-text-content
          style={{
            marginTop: textLayer.gap,
            color: colors.labelTextMuted,
            fontSize: textLayer.bodySize,
          }}
        >
          {props.caption}
        </div>
      ) : null}
    </TextFrame>
  );
};
