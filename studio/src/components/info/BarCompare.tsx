import { z } from "zod";
import { colors, infoLayer, regionColor } from "../../design/tokens";
import {
  boundedValue,
  formatNumber,
  growthAt,
  InfoFrame,
  semanticSchema,
  shortText,
  titledShape,
  useInfoFrame,
} from "./shared";

export const barCompareSchema = z.strictObject({
  ...titledShape,
  unit: shortText(infoLayer.limits.unit).optional(),
  decimals: z.number().int().min(0).max(2).default(0),
  bars: z
    .array(
      z.strictObject({
        label: shortText(infoLayer.limits.label),
        value: boundedValue,
        color: semanticSchema.default("regionA"),
      }),
    )
    .min(2)
    .max(5),
});
export type BarCompareProps = z.input<typeof barCompareSchema>;
export const barAxisLabels = (min: number, max: number, decimals: number) => {
  const midpoint = (min + max) / 2;
  const midpointDecimals = Number.isInteger(midpoint * 10 ** decimals)
    ? decimals
    : decimals + 1;
  return [
    formatNumber(min, decimals),
    formatNumber(midpoint, midpointDecimals),
    formatNumber(max, decimals),
  ];
};
export const barDomain = (values: number[]) => {
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  return { min, max: min === max ? min + 1 : max };
};
export const barGeometry = (
  value: number,
  min: number,
  max: number,
  progress: number,
) => {
  const zero = min === 0 ? 0 : -min / (max - min);
  const end = (value * progress - min) / (max - min);
  return { left: Math.min(zero, end), width: Math.abs(end - zero), zero };
};
export const BarCompare: React.FC<BarCompareProps> = (input) => {
  const props = barCompareSchema.parse(input);
  const progress = growthAt(useInfoFrame());
  const domain = barDomain(props.bars.map((bar) => bar.value));
  return (
    <InfoFrame
      name="BarCompare"
      title={props.title}
      unit={props.unit}
      duration={props.durationInFrames}
      placement={props.placement}
    >
      <div style={{ display: "grid", gap: infoLayer.gap }}>
        {props.bars.map((bar, i) => {
          const geometry = barGeometry(
            bar.value,
            domain.min,
            domain.max,
            progress,
          );
          return (
            <div key={i} data-info-group>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `minmax(0, 1fr) ${infoLayer.valueWidth}px`,
                  gap: infoLayer.gap,
                  marginBottom: infoLayer.smallGap,
                }}
              >
                <div
                  data-info-box
                  data-info-peer
                  style={{ minWidth: 0, fontSize: infoLayer.smallSize }}
                >
                  {bar.label}
                </div>
                <div
                  data-info-box
                  data-info-peer
                  style={{
                    fontSize: infoLayer.smallSize,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatNumber(bar.value, props.decimals)}
                </div>
              </div>
              <div
                style={{
                  height: infoLayer.barHeight,
                  background: infoLayer.track,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    height: "100%",
                    left: `${geometry.left * 100}%`,
                    width: `${geometry.width * 100}%`,
                    background: regionColor[bar.color],
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `calc(${geometry.zero * 100}% - ${geometry.zero * infoLayer.playheadWidth}px)`,
                    width: infoLayer.playheadWidth,
                    background: colors.labelText,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div
        data-info-group
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: infoLayer.smallGap,
          marginTop: infoLayer.gap,
          color: colors.labelTextMuted,
          fontSize: infoLayer.smallSize,
        }}
      >
        {barAxisLabels(domain.min, domain.max, props.decimals).map(
          (label, i) => (
            <div
              data-info-box
              data-info-peer
              key={i}
              style={{
                textAlign: i === 0 ? "left" : i === 1 ? "center" : "right",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
          ),
        )}
      </div>
    </InfoFrame>
  );
};
