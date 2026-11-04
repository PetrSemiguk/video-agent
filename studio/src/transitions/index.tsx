import type { TransitionPresentationComponentProps } from "@remotion/transitions";
import { linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { cards, colors, motion } from "../design/tokens";

export const transitionSchema = z.strictObject({
  kind: z.enum(["crossfade", "dip-to-dark", "map-to-graphic-wipe"]),
  durationInFrames: z
    .number()
    .int()
    .min(2)
    .max(motion.frames.slow * 2)
    .default(cards.transitionFrames),
});
export type TransitionSpec = z.input<typeof transitionSchema>;
export const dipOpacity = (
  direction: "entering" | "exiting",
  progress: number,
) =>
  direction === "entering"
    ? Math.max(0, (progress - 0.5) * 2)
    : Math.max(0, 1 - progress * 2);
const Dip: React.FC<
  TransitionPresentationComponentProps<Record<string, never>>
> = ({ children, presentationDirection, presentationProgress }) => (
  <AbsoluteFill
    style={{
      opacity: dipOpacity(presentationDirection, presentationProgress),
      background: colors.background,
    }}
  >
    {children}
  </AbsoluteFill>
);
const cross = fade();
const graphicWipe = wipe({ direction: "from-left" });
const Cross: React.FC<
  TransitionPresentationComponentProps<Record<string, never>>
> = (p) => <cross.component {...p} passedProps={cross.props} />;
const GraphicWipe: React.FC<
  TransitionPresentationComponentProps<Record<string, never>>
> = (p) => <graphicWipe.component {...p} passedProps={graphicWipe.props} />;
export const sceneTransition = (input: TransitionSpec) => {
  const p = transitionSchema.parse(input);
  return {
    timing: linearTiming({
      durationInFrames: p.durationInFrames,
      easing: motion.easing.inOut,
    }),
    presentation:
      p.kind === "crossfade"
        ? { component: Cross, props: {} }
        : p.kind === "map-to-graphic-wipe"
          ? { component: GraphicWipe, props: {} }
          : { component: Dip, props: {} },
  };
};
