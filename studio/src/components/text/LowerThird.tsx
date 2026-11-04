import { z } from "zod";
import {
  colors,
  headlineStack,
  regionColor,
  textLayer,
  type,
} from "../../design/tokens";
import { commonShape, placementSchema, shortText, TextFrame } from "./shared";

export const lowerThirdSchema = z.strictObject({
  ...commonShape,
  placement: placementSchema.default("lower-left"),
  title: shortText(textLayer.limits.title),
  subtitle: shortText(textLayer.limits.subtitle).optional(),
});
export type LowerThirdProps = z.input<typeof lowerThirdSchema>;
export const LowerThird: React.FC<LowerThirdProps> = (input) => {
  const props = lowerThirdSchema.parse(input);
  return (
    <TextFrame
      name="LowerThird"
      duration={props.durationInFrames}
      placement={props.placement}
      accent={regionColor[props.color]}
    >
      <div
        data-text-content
        style={{
          fontFamily: headlineStack,
          fontWeight: type.weight.bold,
          fontSize: textLayer.titleSize,
        }}
      >
        {props.title}
      </div>
      {props.subtitle ? (
        <div
          data-text-content
          style={{
            marginTop: textLayer.gap,
            color: colors.labelTextMuted,
            fontSize: textLayer.bodySize,
          }}
        >
          {props.subtitle}
        </div>
      ) : null}
    </TextFrame>
  );
};
