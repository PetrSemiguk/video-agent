import { useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import {
  colors,
  headlineStack,
  regionColor,
  textLayer,
  type,
} from "../../design/tokens";
import { useOptionalMapProjection } from "../../map/PlateStage";
import { autoCorner, lowerThirdSize } from "./placement";
import { commonShape, placementSchema, shortText, TextFrame } from "./shared";

export const lowerThirdSchema = z
  .strictObject({
    ...commonShape,
    placement: z
      .union([placementSchema, z.literal("auto")])
      .default("lower-left"),
    /** West, south, east, north of the shot's subject, for placement "auto". */
    subject: z
      .tuple([
        z.number().min(-180).max(180),
        z.number().min(-85.051129).max(85.051129),
        z.number().min(-180).max(180),
        z.number().min(-85.051129).max(85.051129),
      ])
      .optional(),
    title: shortText(textLayer.limits.title),
    subtitle: shortText(textLayer.limits.subtitle).optional(),
  })
  .refine((props) => props.placement !== "auto" || props.subject, {
    path: ["subject"],
    message: 'Placement "auto" needs the subject bounds',
  });
export type LowerThirdProps = z.input<typeof lowerThirdSchema>;
export const LowerThird: React.FC<LowerThirdProps> = (input) => {
  const props = lowerThirdSchema.parse(input);
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const map = useOptionalMapProjection();
  const placement =
    props.placement === "auto"
      ? map && props.subject
        ? autoCorner(
            props.subject,
            lowerThirdSize(props.title, props.subtitle),
            width,
            height,
            map.frame - frame,
            props.durationInFrames,
            (f) => map.at(f).toScreen,
          ).corner
        : "lower-left"
      : props.placement;
  return (
    <TextFrame
      name="LowerThird"
      duration={props.durationInFrames}
      placement={placement}
      accent={regionColor[props.color]}
      fit
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
