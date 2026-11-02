// Mandatory on-screen attribution for every map shot (CLAUDE.md overrides).
// TODO(step 5): replace hardcoded colors, fonts and spacing with design tokens.
const TEXT = "rgba(255, 255, 255, 0.85)";
const BACKGROUND = "rgba(0, 0, 0, 0.55)";

export const MapAttribution: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      right: 16,
      bottom: 16,
      padding: "6px 12px",
      borderRadius: 4,
      backgroundColor: BACKGROUND,
      color: TEXT,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 18,
    }}
  >
    {text}
  </div>
);
