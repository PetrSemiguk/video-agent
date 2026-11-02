// Minimal GeoJSON types for data/processed layers and conversion to SVG paths in plate pixels.
// Uses lonLatToPlatePx (the plate contract), never a separate projection library.
import { lonLatToPlatePx, PlateMeta } from "./plate";

type Position = [number, number];

export type Geometry =
  | { type: "Point"; coordinates: Position }
  | { type: "MultiPoint"; coordinates: Position[] }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export type GeoProps = {
  id: string;
  name_en: string | null;
  type: string;
  scalerank: number | null;
  label?: Position;
};

export type GeoFeature = {
  type: "Feature";
  properties: GeoProps;
  geometry: Geometry;
};
export type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

export const GEO_LAYERS = [
  "admin1",
  "countries",
  "lakes",
  "rivers",
  "coastline",
  "regions",
  "places",
] as const;
export type GeoLayer = (typeof GEO_LAYERS)[number];

const ring = (meta: PlateMeta, coords: Position[], close: boolean): string => {
  const parts = coords.map(([lon, lat], i) => {
    const p = lonLatToPlatePx(meta, { lon, lat });
    return `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  });
  return parts.join("") + (close ? "Z" : "");
};

/** SVG path data for line/polygon geometries; points return "". */
export const geometryToPath = (meta: PlateMeta, g: Geometry): string => {
  switch (g.type) {
    case "LineString":
      return ring(meta, g.coordinates, false);
    case "MultiLineString":
      return g.coordinates.map((c) => ring(meta, c, false)).join("");
    case "Polygon":
      return g.coordinates.map((c) => ring(meta, c, true)).join("");
    case "MultiPolygon":
      return g.coordinates
        .flatMap((poly) => poly.map((c) => ring(meta, c, true)))
        .join("");
    default:
      return "";
  }
};

/** Plate-pixel positions of point geometries. */
export const geometryPoints = (
  meta: PlateMeta,
  g: Geometry,
): { x: number; y: number }[] => {
  if (g.type === "Point") {
    const [lon, lat] = g.coordinates;
    return [lonLatToPlatePx(meta, { lon, lat })];
  }
  if (g.type === "MultiPoint") {
    return g.coordinates.map(([lon, lat]) =>
      lonLatToPlatePx(meta, { lon, lat }),
    );
  }
  return [];
};
