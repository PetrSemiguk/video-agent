// Variant A of the step 1.2 A/B test: MapLibre GL with a fully local style:
// the plate as an image source, terrarium raster-dem terrain from studio/public/terrain/,
// Chengdu as a GeoJSON circle layer. No glyphs, sprites or remote URLs.
// Per-frame sync follows the remotion-maps MapLibre technique:
// delayRender -> jumpTo -> triggerRepaint -> once('idle') -> continueRender.
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { CHENGDU, FLYOVER_PLATE, flyoverCamera, TILT } from "../camera/flyover";
import { MapAttribution } from "../components/MapAttribution";
import type { PlateMeta } from "../geo/plate";
import { usePlateMeta } from "../geo/usePlateMeta";

import { colors, space } from "../design/tokens";
const BACKGROUND = colors.dimOverlay;
const MARKER = colors.debugMarker;
const MARKER_RADIUS = space.debugMarker / 2;
export const TERRAIN_EXAGGERATION = 1.8;
const TERRAIN_MAXZOOM = 7;

const absolute = (path: string) =>
  new URL(staticFile(path), window.location.href).href;

// The worker is copied into public/maplibre/ by `npm run prepare:maplibre`
// (the default worker URL points next to the bundled module, which does not exist).
maplibregl.setWorkerUrl(absolute("maplibre/maplibre-gl-worker.mjs"));

const buildStyle = (meta: PlateMeta): maplibregl.StyleSpecification => {
  const [minLon, minLat, maxLon, maxLat] = meta.bbox_lonlat;
  return {
    version: 8,
    sources: {
      plate: {
        type: "image",
        url: absolute(meta.image),
        coordinates: [
          [minLon, maxLat],
          [maxLon, maxLat],
          [maxLon, minLat],
          [minLon, minLat],
        ],
      },
      dem: {
        type: "raster-dem",
        tiles: [`${absolute("terrain")}/{z}/{x}/{y}.png`],
        tileSize: 256,
        encoding: "terrarium",
        minzoom: 0,
        maxzoom: TERRAIN_MAXZOOM,
      },
      chengdu: {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [CHENGDU.lon, CHENGDU.lat] },
        },
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": BACKGROUND },
      },
      {
        id: "plate",
        type: "raster",
        source: "plate",
        paint: { "raster-fade-duration": 0, "raster-resampling": "linear" },
      },
      {
        id: "chengdu",
        type: "circle",
        source: "chengdu",
        paint: {
          "circle-color": MARKER,
          "circle-radius": MARKER_RADIUS,
          "circle-pitch-alignment": "viewport",
        },
      },
    ],
    terrain: { source: "dem", exaggeration: TERRAIN_EXAGGERATION },
  };
};

export const AbMapLibre: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const meta = usePlateMeta(FLYOVER_PLATE);
  const containerRef = useRef<HTMLDivElement>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [loadingHandle] = useState(() => delayRender("Loading MapLibre map"));
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!meta || !containerRef.current) {
      return;
    }
    const cam = flyoverCamera(meta, 0, TILT.maplibre, width, height);
    const mapInstance = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(meta),
      center: [cam.center.lon, cam.center.lat],
      zoom: cam.zoom,
      pitch: cam.pitch,
      bearing: cam.bearing,
      maxPitch: 85,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    mapInstance.on("error", (e) => console.warn("MapLibre:", e.error?.message));
    mapInstance.on("load", () => {
      mapInstance.once("idle", () => {
        setMap(mapInstance);
        continueRender(loadingHandle);
      });
    });
    // No mapInstance.remove() cleanup: it interferes with Remotion's render lifecycle.
  }, [meta, width, height, continueRender, loadingHandle, cancelRender]);

  useEffect(() => {
    if (!map || !meta) {
      return;
    }
    const handle = delayRender(`MapLibre frame ${frame}`);
    const cam = flyoverCamera(meta, frame / fps, TILT.maplibre, width, height);
    map.jumpTo({
      center: [cam.center.lon, cam.center.lat],
      zoom: cam.zoom,
      pitch: cam.pitch,
      bearing: cam.bearing,
    });
    map.once("idle", () => continueRender(handle));
    // Force an idle event even if the camera did not change since the previous frame.
    map.triggerRepaint();
  }, [map, meta, frame, fps, width, height, delayRender, continueRender]);

  return (
    <AbsoluteFill style={{ backgroundColor: BACKGROUND }}>
      <div ref={containerRef} style={{ position: "absolute", width, height }} />
      {meta ? <MapAttribution text={meta.attribution.on_screen} /> : null}
    </AbsoluteFill>
  );
};
