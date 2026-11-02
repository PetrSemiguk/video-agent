// Plate metadata contract written by `vap.geo.plate` (pipeline/src/vap/geo/plate.py).
// lonLatToPlatePx must match pipeline/src/vap/geo/mercator.py exactly (see docs/maps.md).

export type PlateSource = {
  id: string;
  name: string;
  license: string;
  url: string;
  on_screen: string;
  full: string;
};

export type PlateMeta = {
  name: string;
  image: string;
  width: number;
  height: number;
  crs: "EPSG:3857";
  bbox_lonlat: [number, number, number, number];
  bbox_3857: [number, number, number, number];
  pixel_size_m: number;
  zoom: { tile512: number; tile256: number };
  projection: { radius_m: number; lonlat_to_px: string };
  attribution: { sources: PlateSource[]; on_screen: string; full: string };
};

export type LonLat = { lon: number; lat: number };

const MAX_LAT = 85.0511287798066;

/** [lon, lat] -> plate pixels; (0, 0) is the top-left corner of the plate image. */
export const lonLatToPlatePx = (
  meta: PlateMeta,
  { lon, lat }: LonLat,
): { x: number; y: number } => {
  const R = meta.projection.radius_m;
  const [minX, minY, maxX, maxY] = meta.bbox_3857;
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const xM = R * ((lon * Math.PI) / 180);
  const yM = R * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
  return {
    x: ((xM - minX) / (maxX - minX)) * meta.width,
    y: ((maxY - yM) / (maxY - minY)) * meta.height,
  };
};

/** CSS object-fit: cover placement of a plate inside a frame. */
export const coverFit = (
  meta: PlateMeta,
  frameWidth: number,
  frameHeight: number,
): { scale: number; offsetX: number; offsetY: number } => {
  const scale = Math.max(frameWidth / meta.width, frameHeight / meta.height);
  return {
    scale,
    offsetX: (frameWidth - meta.width * scale) / 2,
    offsetY: (frameHeight - meta.height * scale) / 2,
  };
};
