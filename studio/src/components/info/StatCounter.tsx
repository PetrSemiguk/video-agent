import { z } from "zod";
import {
  colors,
  headlineStack,
  infoLayer,
  regionColor,
  type,
} from "../../design/tokens";
import {
  boundedValue,
  countValueAt,
  formatNumber,
  infoCommon,
  InfoFrame,
  semanticSchema,
  shortText,
  useInfoFrame,
} from "./shared";

export const statCounterSchema = z.strictObject({
  ...infoCommon,
  label: shortText(infoLayer.limits.statLabel),
  value: boundedValue,
  from: boundedValue.default(0),
  decimals: z.number().int().min(0).max(2).default(0),
  unit: shortText(infoLayer.limits.unit).optional(),
  color: semanticSchema.default("regionA"),
});
export type StatCounterProps = z.input<typeof statCounterSchema>;
export const StatCounter: React.FC<StatCounterProps> = (input) => {
  const props = statCounterSchema.parse(input),
    value = countValueAt(useInfoFrame(), props.from, props.value);
  return (
    <InfoFrame
      name="StatCounter"
      duration={props.durationInFrames}
      placement={props.placement}
    >
      <div
        data-info-box
        style={{
          color: regionColor[props.color],
          fontFamily: headlineStack,
          fontSize: infoLayer.statSize,
          fontWeight: type.weight.bold,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {formatNumber(value, props.decimals)}
      </div>
      {props.unit ? (
        <div
          data-info-box
          style={{
            color: colors.labelTextMuted,
            fontSize: infoLayer.bodySize,
            marginTop: infoLayer.smallGap,
          }}
        >
          {props.unit}
        </div>
      ) : null}
      <div
        data-info-box
        style={{ fontSize: infoLayer.bodySize, marginTop: infoLayer.gap }}
      >
        {props.label}
      </div>
    </InfoFrame>
  );
};
