import { AbsoluteFill, Img, staticFile } from "remotion";
import { MapAttribution } from "../components/MapAttribution";
import { colors, fontStack, headlineStack, space, type } from "./tokens";

export const GradeCompare: React.FC<{ plate: "china" | "europe" }> = ({
  plate,
}) => (
  <AbsoluteFill style={{ background: colors.background, flexDirection: "row" }}>
    {(["v1", "v2"] as const).map((version) => (
      <div
        key={version}
        style={{
          position: "relative",
          width: "50%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Img
          src={staticFile(`plates/review-${plate}-${version}.png`)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            top: space.cornerInsetY,
            left: space.cornerInsetX,
            color: colors.labelText,
            fontFamily: headlineStack,
            fontSize: type.size.labelRegion,
            fontWeight: type.weight.bold,
          }}
        >
          {plate.toUpperCase()} / GRADE {version.toUpperCase()}
          <div
            style={{
              fontFamily: fontStack,
              fontSize: type.size.attribution,
              fontWeight: type.weight.regular,
            }}
          >
            Hillshade {version === "v1" ? "0.50" : "0.65"}
          </div>
        </div>
        <MapAttribution text="Imagery: NASA Earth Observatory · Terrain: USGS, NOAA, EU-DEM (Copernicus) et al. via AWS Terrain Tiles" />
      </div>
    ))}
  </AbsoluteFill>
);
