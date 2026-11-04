import { z } from "zod";
import { colors, infoLayer, regionColor } from "../../design/tokens";
import {
  formatYear,
  growthAt,
  InfoFrame,
  ordinalYear,
  semanticSchema,
  shortText,
  titledShape,
  useInfoFrame,
  yearFraction,
  yearOrdinal,
} from "./shared";

const historicalYear = z
  .number()
  .int()
  .min(-infoLayer.yearLimit)
  .max(infoLayer.yearLimit)
  .refine(
    (year) => year !== 0,
    "Historical year zero does not exist; use -1 for 1 BCE",
  );
export const timelineBarSchema = z
  .strictObject({
    ...titledShape,
    startYear: historicalYear,
    endYear: historicalYear,
    events: z
      .array(
        z.strictObject({
          year: historicalYear,
          label: shortText(infoLayer.limits.label),
          color: semanticSchema.default("regionA"),
        }),
      )
      .min(1)
      .max(5),
  })
  .superRefine((props, ctx) => {
    if (props.startYear >= props.endYear)
      ctx.addIssue({
        code: "custom",
        path: ["endYear"],
        message: "endYear must be after startYear",
      });
    props.events.forEach((event, i) => {
      if (event.year < props.startYear || event.year > props.endYear)
        ctx.addIssue({
          code: "custom",
          path: ["events", i, "year"],
          message: "Event must lie inside the span",
        });
    });
  });
export type TimelineBarProps = z.input<typeof timelineBarSchema>;
export const TimelineBar: React.FC<TimelineBarProps> = (input) => {
  const props = timelineBarSchema.parse(input);
  const progress = growthAt(useInfoFrame());
  const current = ordinalYear(
    Math.round(
      yearOrdinal(props.startYear) +
        progress * (yearOrdinal(props.endYear) - yearOrdinal(props.startYear)),
    ),
  );
  return (
    <InfoFrame
      name="TimelineBar"
      title={props.title}
      duration={props.durationInFrames}
      placement={props.placement}
    >
      <div
        data-info-group
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: infoLayer.gap,
          fontSize: infoLayer.smallSize,
          marginBottom: infoLayer.gap,
        }}
      >
        <div data-info-box data-info-peer>
          {formatYear(props.startYear)}
        </div>
        <div
          data-info-box
          data-info-peer
          style={{ textAlign: "center", color: colors.river }}
        >
          {formatYear(current)}
        </div>
        <div data-info-box data-info-peer style={{ textAlign: "right" }}>
          {formatYear(props.endYear)}
        </div>
      </div>
      <div
        style={{
          position: "relative",
          height: infoLayer.barHeight,
          background: infoLayer.track,
          marginBottom: infoLayer.sectionGap,
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: colors.river,
          }}
        />
      </div>
      <div style={{ display: "grid", gap: infoLayer.gap }}>
        {[...props.events]
          .sort((a, b) => a.year - b.year)
          .map((event, i) => {
            const fraction = yearFraction(
              event.year,
              props.startYear,
              props.endYear,
            );
            return (
              <div data-info-group key={i}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `${infoLayer.dateWidth}px minmax(0, 1fr)`,
                    gap: infoLayer.gap,
                    fontSize: infoLayer.smallSize,
                    marginBottom: infoLayer.smallGap,
                  }}
                >
                  <div
                    data-info-box
                    data-info-peer
                    style={{ color: regionColor[event.color] }}
                  >
                    {formatYear(event.year)}
                  </div>
                  <div data-info-box data-info-peer>
                    {event.label}
                  </div>
                </div>
                <div
                  style={{
                    position: "relative",
                    height: infoLayer.markerSize,
                    background: infoLayer.track,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: `calc(${fraction * 100}% - ${fraction * infoLayer.markerSize}px)`,
                      height: infoLayer.markerSize,
                      width: infoLayer.markerSize,
                      borderRadius: infoLayer.markerSize / 2,
                      background: regionColor[event.color],
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: `calc(${progress * 100}% - ${progress * infoLayer.playheadWidth}px)`,
                      height: "100%",
                      width: infoLayer.playheadWidth,
                      background: colors.river,
                    }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </InfoFrame>
  );
};
