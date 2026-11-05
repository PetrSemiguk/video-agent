import { interpolate } from "remotion";
import { motion } from "../../design/tokens";

/** Opacity of a line in the last frames of its layer: it fades instead of vanishing at a cut. */
export const lineExitOpacity = (
  frame: number,
  durationInFrames: number,
  exitFrames: number,
) =>
  exitFrames <= 0
    ? 1
    : interpolate(
        frame,
        [durationInFrames - exitFrames, durationInFrames - 1],
        [1, 0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: motion.easing.inOut,
        },
      );
