// Mandatory on-screen attribution for every map shot (CLAUDE.md overrides).
import { colors, fontStack, space, type } from "../design/tokens";

export const MapAttribution: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      right: space.attributionInset,
      bottom: space.attributionInset,
      padding: `${space.attributionPadY}px ${space.attributionPadX}px`,
      borderRadius: space.attributionRadius,
      backgroundColor: colors.attributionBackground,
      color: colors.attributionText,
      fontFamily: fontStack,
      fontSize: type.size.attribution,
    }}
  >
    {text}
  </div>
);
