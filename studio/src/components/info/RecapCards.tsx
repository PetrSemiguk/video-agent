import { z } from "zod";
import {
  colors,
  headlineStack,
  infoLayer,
  regionColor,
  type,
} from "../../design/tokens";
import {
  InfoFrame,
  revealAt,
  semanticSchema,
  shortText,
  titledShape,
  useInfoFrame,
} from "./shared";

export const recapCardsSchema = z.strictObject({
  ...titledShape,
  cards: z
    .array(
      z.strictObject({
        title: shortText(infoLayer.limits.cardTitle),
        body: shortText(infoLayer.limits.cardBody),
        color: semanticSchema.default("regionA"),
      }),
    )
    .min(2)
    .max(4),
});
export type RecapCardsProps = z.input<typeof recapCardsSchema>;
export const RecapCards: React.FC<RecapCardsProps> = (input) => {
  const props = recapCardsSchema.parse(input),
    frame = useInfoFrame();
  return (
    <InfoFrame
      name="RecapCards"
      title={props.title}
      duration={props.durationInFrames}
      placement={props.placement}
    >
      <div
        data-info-group
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: infoLayer.gap,
        }}
      >
        {props.cards.map((card, i) => (
          <div
            data-info-peer
            data-info-group
            key={i}
            style={{
              padding: infoLayer.cardPad,
              borderRadius: infoLayer.cardRadius,
              background: infoLayer.cardSurface,
              opacity: revealAt(frame, i),
              minWidth: 0,
            }}
          >
            <div
              data-info-box
              style={{
                color: regionColor[card.color],
                fontFamily: headlineStack,
                fontSize: infoLayer.bodySize,
                fontWeight: type.weight.bold,
                marginBottom: infoLayer.smallGap,
              }}
            >
              {card.title}
            </div>
            <div
              data-info-box
              style={{ color: colors.labelText, fontSize: infoLayer.smallSize }}
            >
              {card.body}
            </div>
          </div>
        ))}
      </div>
    </InfoFrame>
  );
};
