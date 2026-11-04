import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  colors,
  fontStack,
  headlineStack,
  monoStack,
  motion,
  space,
  type,
} from "./design/tokens";

export const Hello: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const appear = spring({ frame, fps, config: motion.spring });
  const opacity = interpolate(frame, [0, motion.frames.base], [0, 1], {
    extrapolateRight: "clamp",
    easing: motion.easing.out,
  });
  const scale = interpolate(appear, [0, 1], [motion.enterScale, 1]);
  const subtitleOpacity = interpolate(
    frame,
    [motion.frames.fast, motion.frames.fast + motion.frames.base],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.background,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: fontStack,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            color: colors.labelText,
            fontSize: type.size.title,
            fontFamily: headlineStack,
            fontWeight: type.weight.bold,
            letterSpacing: `${type.tracking.title}em`,
          }}
        >
          VIDEO AGENT
        </div>
        <div
          style={{
            color: colors.labelTextMuted,
            fontSize: type.size.subtitle,
            letterSpacing: `${type.tracking.caps}em`,
            marginTop: space.titleGap,
            textTransform: "uppercase",
            opacity: subtitleOpacity,
          }}
        >
          Step 2 · Remotion OK
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: space.cornerInsetX,
          bottom: space.cornerInsetY,
          color: colors.labelTextMuted,
          fontSize: type.size.mono,
          fontFamily: monoStack,
        }}
      >
        {String(frame).padStart(3, "0")}
      </div>
    </AbsoluteFill>
  );
};
