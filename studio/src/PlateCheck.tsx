import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { MapAttribution } from "./components/MapAttribution";
import { coverFit, LonLat, lonLatToPlatePx } from "./geo/plate";
import { usePlateMeta } from "./geo/usePlateMeta";

// TODO(step 5): replace hardcoded colors and sizes with design tokens.
const MARKER = "#ff2d2d";
const MARKER_SIZE = 12;

export type PlateCheckProps = {
  plate: string;
  markers: (LonLat & { label?: string })[];
};

export const plateCheckDefaults: PlateCheckProps = {
  plate: "china-east-hs05",
  markers: [{ lon: 116.4, lat: 39.9, label: "Beijing" }],
};

export const PlateCheck: React.FC<PlateCheckProps> = ({ plate, markers }) => {
  const { width, height } = useVideoConfig();
  const meta = usePlateMeta(plate);

  if (!meta) {
    return null;
  }

  const fit = coverFit(meta, width, height);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Img
        src={staticFile(meta.image)}
        style={{
          position: "absolute",
          left: fit.offsetX,
          top: fit.offsetY,
          width: meta.width * fit.scale,
          height: meta.height * fit.scale,
        }}
      />
      {markers.map((m) => {
        const p = lonLatToPlatePx(meta, m);
        return (
          <div
            key={`${m.lon},${m.lat}`}
            title={m.label}
            style={{
              position: "absolute",
              left: fit.offsetX + p.x * fit.scale - MARKER_SIZE / 2,
              top: fit.offsetY + p.y * fit.scale - MARKER_SIZE / 2,
              width: MARKER_SIZE,
              height: MARKER_SIZE,
              borderRadius: MARKER_SIZE / 2,
              backgroundColor: MARKER,
            }}
          />
        );
      })}
      <MapAttribution text={meta.attribution.on_screen} />
    </AbsoluteFill>
  );
};
