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
  /** One line of meaning: what the number says. */
  label: shortText(infoLayer.limits.statLabel),
  value: boundedValue,
  from: boundedValue.default(0),
  decimals: z.number().int().min(0).max(2).default(0),
  /** What is counted, read together with the number: "5 river systems". */
  unit: shortText(infoLayer.limits.statUnit).optional(),
  /** When it held, on its own line. */
  date: shortText(infoLayer.limits.statDate).optional(),
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
      fit
    >
      {props.date ? (
        <div
          data-info-box
          style={{
            color: colors.labelTextMuted,
            fontSize: infoLayer.smallSize,
            marginBottom: infoLayer.smallGap,
          }}
        >
          {props.date}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          columnGap: infoLayer.gap,
          fontFamily: headlineStack,
          fontWeight: type.weight.bold,
        }}
      >
        <div
          data-info-box
          style={{
            color: regionColor[props.color],
            fontSize: infoLayer.statSize,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {formatNumber(value, props.decimals)}
        </div>
        {props.unit ? (
          <div data-info-box style={{ fontSize: infoLayer.statUnitSize }}>
            {props.unit}
          </div>
        ) : null}
      </div>
      <div
        data-info-box
        style={{ fontSize: infoLayer.bodySize, marginTop: infoLayer.smallGap }}
      >
        {props.label}
      </div>
    </InfoFrame>
  );
};
