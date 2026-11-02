import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// TODO(step 5): replace hardcoded colors, fonts and spacing with design tokens.
const BACKGROUND = "#0b0f14";
const TEXT = "#f2f5f8";
const MUTED = "#8a96a3";

export const Hello: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const appear = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const scale = interpolate(appear, [0, 1], [0.94, 1]);
  const subtitleOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUND,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Arial, Helvetica, sans-serif",
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
            color: TEXT,
            fontSize: 140,
            fontWeight: 700,
            letterSpacing: 12,
          }}
        >
          VIDEO AGENT
        </div>
        <div
          style={{
            color: MUTED,
            fontSize: 32,
            letterSpacing: 8,
            marginTop: 24,
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
          right: 48,
          bottom: 40,
          color: MUTED,
          fontSize: 28,
          fontFamily: "Consolas, monospace",
        }}
      >
        {String(frame).padStart(3, "0")}
      </div>
    </AbsoluteFill>
  );
};
