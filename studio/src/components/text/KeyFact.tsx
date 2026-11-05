import { z } from "zod";
import { regionColor, textLayer, type } from "../../design/tokens";
import { commonShape, placementSchema, shortText, TextFrame } from "./shared";

export const keyFactSchema = z
  .strictObject({
    ...commonShape,
    placement: placementSchema.default("lower-left"),
    statement: shortText(textLayer.limits.statement),
    emphasis: shortText(textLayer.limits.emphasis),
  })
  .refine(
    ({ statement, emphasis }) =>
      statement.includes(emphasis) &&
      statement.indexOf(emphasis) === statement.lastIndexOf(emphasis),
    {
      path: ["emphasis"],
      message: "Emphasis must occur exactly once in statement (case sensitive)",
    },
  );
export type KeyFactProps = z.input<typeof keyFactSchema>;
export const KeyFact: React.FC<KeyFactProps> = (input) => {
  const props = keyFactSchema.parse(input);
  const at = props.statement.indexOf(props.emphasis);
  return (
    <TextFrame
      name="KeyFact"
      duration={props.durationInFrames}
      placement={props.placement}
      fit
    >
      <div
        data-text-content
        style={{ fontSize: textLayer.factSize, fontWeight: type.weight.medium }}
      >
        {props.statement.slice(0, at)}
        <span
          style={{
            color: regionColor[props.color],
            fontWeight: type.weight.bold,
          }}
        >
          {props.emphasis}
        </span>
        {props.statement.slice(at + props.emphasis.length)}
      </div>
    </TextFrame>
  );
};
