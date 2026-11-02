import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { coverFit, LonLat, lonLatToPlatePx, PlateMeta } from "./geo/plate";

// TODO(step 5): replace hardcoded colors, fonts and spacing with design tokens.
const MARKER = "#ff2d2d";
const ATTRIBUTION_TEXT = "rgba(255, 255, 255, 0.85)";
const ATTRIBUTION_BG = "rgba(0, 0, 0, 0.55)";
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
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Loading plate ${plate}`));
  const [meta, setMeta] = useState<PlateMeta | null>(null);

  useEffect(() => {
    fetch(staticFile(`plates/${plate}.json`))
      .then((res) => {
        if (!res.ok) {
          throw new Error(`plates/${plate}.json: HTTP ${res.status}`);
        }
        return res.json() as Promise<PlateMeta>;
      })
      .then((json) => {
        setMeta(json);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [plate, handle, continueRender, cancelRender]);

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
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          padding: "6px 12px",
          borderRadius: 4,
          backgroundColor: ATTRIBUTION_BG,
          color: ATTRIBUTION_TEXT,
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 18,
        }}
      >
        {meta.attribution.on_screen}
      </div>
    </AbsoluteFill>
  );
};
