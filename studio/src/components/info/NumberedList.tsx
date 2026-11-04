import { z } from "zod";
import { infoLayer, regionColor, space } from "../../design/tokens";
import {
  InfoFrame,
  revealAt,
  semanticSchema,
  shortText,
  titledShape,
  useInfoFrame,
} from "./shared";

export const numberedListSchema = z.strictObject({
  ...titledShape,
  color: semanticSchema.default("regionA"),
  items: z.array(shortText(infoLayer.limits.item)).min(3).max(5),
});
export type NumberedListProps = z.input<typeof numberedListSchema>;
export const NumberedList: React.FC<NumberedListProps> = (input) => {
  const props = numberedListSchema.parse(input),
    frame = useInfoFrame();
  return (
    <InfoFrame
      name="NumberedList"
      title={props.title}
      duration={props.durationInFrames}
      placement={props.placement}
    >
      <div style={{ display: "grid", gap: infoLayer.gap }}>
        {props.items.map((item, i) => {
          const progress = revealAt(frame, i);
          return (
            <div
              key={i}
              data-info-group
              style={{
                display: "grid",
                gridTemplateColumns: `${infoLayer.numberWidth}px minmax(0, 1fr)`,
                gap: infoLayer.gap,
                opacity: progress,
                transform: `translateY(${space.enterShift * (1 - progress)}px)`,
                fontSize: infoLayer.bodySize,
              }}
            >
              <div
                data-info-box
                data-info-peer
                style={{ color: regionColor[props.color] }}
              >
                {i + 1}.
              </div>
              <div data-info-box data-info-peer>
                {item}
              </div>
            </div>
          );
        })}
      </div>
    </InfoFrame>
  );
};
