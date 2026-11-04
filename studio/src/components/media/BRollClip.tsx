import { useId } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { z } from "zod";
import {
  cards,
  colors,
  motion,
  plateLookJson,
  textLayer,
} from "../../design/tokens";
import { brollAssets } from "../../media/broll";
import { MapAttribution } from "../MapAttribution";

export const bRollClipSchema = z
  .strictObject({
    assetId: z.enum(["pexels-earth-1851190"]),
    durationInFrames: z
      .number()
      .int()
      .min(2 * motion.frames.base + 1)
      .max(brollAssets["pexels-earth-1851190"].durationInFrames)
      .default(textLayer.defaultDuration),
    trimBefore: z.number().int().min(0).default(0),
  })
  .refine(
    (p) =>
      p.trimBefore + p.durationInFrames <=
      brollAssets[p.assetId].durationInFrames,
    {
      path: ["durationInFrames"],
      message: "Trim plus duration exceeds the approved local clip",
    },
  );
export type BRollClipProps = z.input<typeof bRollClipSchema>;
export const BRollClip: React.FC<BRollClipProps> = (input) => {
  const p = bRollClipSchema.parse(input),
    asset = brollAssets[p.assetId],
    frame = useCurrentFrame();
  const id = `broll-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const grade = JSON.parse(plateLookJson).grades.dark;
  const scale =
    1 +
    (cards.brollPush - 1) *
      Math.max(0, Math.min(1, frame / (p.durationInFrames - 1)));
  return (
    <AbsoluteFill style={{ background: colors.background, overflow: "hidden" }}>
      <svg width={0} height={0}>
        <defs>
          <filter id={id} colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values={String(grade.saturation)} />
            <feComponentTransfer>
              {(["R", "G", "B"] as const).map((channel) => {
                const Component = `feFunc${channel}` as "feFuncR";
                return (
                  <Component
                    key={channel}
                    type="gamma"
                    amplitude={grade.exposure ** grade.gamma}
                    exponent={grade.gamma}
                    offset={0}
                  />
                );
              })}
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <AbsoluteFill
        style={{ transform: `scale(${scale})`, filter: `url(#${id})` }}
      >
        <OffthreadVideo
          src={staticFile(asset.src)}
          trimBefore={p.trimBefore}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <MapAttribution text={asset.credit} />
    </AbsoluteFill>
  );
};
