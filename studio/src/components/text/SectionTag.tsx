import { z } from "zod";
import {
  headlineStack,
  regionColor,
  textLayer,
  type,
} from "../../design/tokens";
import { commonShape, placementSchema, shortText, TextFrame } from "./shared";

export const sectionTagSchema = z.strictObject({
  ...commonShape,
  placement: placementSchema.default("upper-left"),
  text: shortText(textLayer.limits.tag),
});
export type SectionTagProps = z.input<typeof sectionTagSchema>;
export const SectionTag: React.FC<SectionTagProps> = (input) => {
  const props = sectionTagSchema.parse(input);
  return (
    <TextFrame
      name="SectionTag"
      duration={props.durationInFrames}
      placement={props.placement}
    >
      <div
        data-text-content
        style={{
          color: regionColor[props.color],
          fontFamily: headlineStack,
          fontSize: textLayer.tagSize,
          fontWeight: type.weight.bold,
          letterSpacing: `${type.tracking.caps}em`,
          textTransform: "uppercase",
        }}
      >
        {props.text}
      </div>
    </TextFrame>
  );
};
