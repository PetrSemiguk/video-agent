// Debug still: plate + Natural Earth layers, placed with the variant-B plate transform.
// Default view fits the whole plate (cover); `focus` + `scale` (1 = native) give a crop.
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { plateTransform, PlateView } from "./camera/plateProjection";
import { GeoDebugOverlay } from "./components/GeoDebugOverlay";
import { MapAttribution } from "./components/MapAttribution";
import { GEO_LAYERS } from "./geo/geojson";
import { coverFit, LonLat, lonLatToPlatePx } from "./geo/plate";
import { useGeoLayers } from "./geo/useGeoLayers";
import { usePlateMeta } from "./geo/usePlateMeta";

export type GeoDebugProps = {
  plate: string;
  /** Folder under public/geo/ (= data/processed/<dataset>); defaults to the plate name. */
  dataset?: string;
  /** Centre of the view; defaults to the plate centre. */
  focus?: LonLat;
  /** Plate→screen scale; defaults to cover (whole plate in frame). 1 = native pixels. */
  scale?: number;
};

export const geoDebugDefaults: GeoDebugProps = { plate: "china-east-hs05" };

export const GeoDebug: React.FC<GeoDebugProps> = ({
  plate,
  dataset,
  focus,
  scale,
}) => {
  const { width, height } = useVideoConfig();
  const meta = usePlateMeta(plate);
  const layers = useGeoLayers(dataset ?? plate, GEO_LAYERS);

  if (!meta || !layers) {
    return null;
  }

  const centre = focus
    ? lonLatToPlatePx(meta, focus)
    : { x: meta.width / 2, y: meta.height / 2 };
  const view: PlateView = {
    cx: centre.x,
    cy: centre.y,
    scale: scale ?? coverFit(meta, width, height).scale,
    pitchDeg: 0,
    bearingDeg: 0,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: meta.width,
          height: meta.height,
          transformOrigin: "0 0",
          transform: plateTransform(view, width, height),
        }}
      >
        <Img
          src={staticFile(meta.image)}
          style={{
            position: "absolute",
            width: meta.width,
            height: meta.height,
          }}
        />
        <GeoDebugOverlay meta={meta} layers={layers} scale={view.scale} />
      </div>
      <MapAttribution
        text={`${meta.attribution.on_screen} · Made with Natural Earth`}
      />
    </AbsoluteFill>
  );
};
