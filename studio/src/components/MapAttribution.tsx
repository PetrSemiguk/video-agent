// Mandatory on-screen attribution, secondary to the map labels.
import { colors, fontStack, space, type } from "../design/tokens";

export const MapAttribution: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      right: space.attributionInset,
      left: space.attributionInset,
      width: "fit-content",
      marginLeft: "auto",
      maxWidth: `calc(100% - ${2 * space.attributionInset}px)`,
      lineHeight: type.lineHeight,
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
