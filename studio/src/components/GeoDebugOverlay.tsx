// Debug rendering of Natural Earth layers in plate pixels. Place it inside the same
// transformed container as the plate image (variant B), so it moves with the camera.
// `scale` is the plate→screen scale; stroke widths and text are divided by it so they keep
// a constant on-screen size.
import { useMemo } from "react";
import type { PlateMeta } from "../geo/plate";
import { geometryPoints, geometryToPath } from "../geo/geojson";
import type { GeoLayers } from "../geo/useGeoLayers";

// TODO(step 5): temporary debug styles — replace with design tokens.
const STYLE = {
  countries: { stroke: "rgba(255,255,255,0.7)", width: 1.5 },
  admin1: { stroke: "rgba(255,255,255,0.3)", width: 0.75 },
  rivers: { stroke: "#5ec8ff", width: 1.5 },
  lakes: { fill: "rgba(94,200,255,0.4)" },
  coastline: { stroke: "#ffd400", width: 1 },
  regions: { stroke: "rgba(255,190,120,0.85)", width: 1, dash: [6, 4] },
  regionText: { fill: "rgba(255,210,160,0.95)", size: 14 },
  places: { fill: "#ffffff", radius: 3, size: 14 },
  halo: "rgba(0,0,0,0.75)",
  font: "Arial, Helvetica, sans-serif",
  maxPlaceRank: 3,
};

export const GeoDebugOverlay: React.FC<{
  meta: PlateMeta;
  layers: GeoLayers;
  scale: number;
}> = ({ meta, layers, scale }) => {
  const k = 1 / scale; // plate px per screen px

  const paths = useMemo(() => {
    const toPaths = (name: keyof GeoLayers) =>
      (layers[name]?.features ?? []).map((f) => ({
        id: `${name}-${f.properties.id}`,
        d: geometryToPath(meta, f.geometry),
        props: f.properties,
      }));
    return {
      admin1: toPaths("admin1"),
      countries: toPaths("countries"),
      lakes: toPaths("lakes"),
      rivers: toPaths("rivers"),
      coastline: toPaths("coastline"),
      regions: toPaths("regions").filter((p) => p.d !== ""),
    };
  }, [meta, layers]);

  const regionLabels = (layers.regions?.features ?? []).flatMap((f) => {
    const at = f.properties.label
      ? geometryPoints(meta, { type: "Point", coordinates: f.properties.label })
      : geometryPoints(meta, f.geometry);
    return at.length && f.properties.name_en
      ? [{ id: f.properties.id, name: f.properties.name_en, ...at[0] }]
      : [];
  });

  const places = (layers.places?.features ?? []).filter(
    (f) => (f.properties.scalerank ?? 99) <= STYLE.maxPlaceRank,
  );

  const text = (size: number) => ({
    fontFamily: STYLE.font,
    fontSize: size * k,
    paintOrder: "stroke" as const,
    stroke: STYLE.halo,
    strokeWidth: 3 * k,
  });

  return (
    <svg
      width={meta.width}
      height={meta.height}
      viewBox={`0 0 ${meta.width} ${meta.height}`}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
    >
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        {paths.admin1.map((p) => (
          <path
            key={p.id}
            d={p.d}
            stroke={STYLE.admin1.stroke}
            strokeWidth={STYLE.admin1.width * k}
          />
        ))}
        {paths.countries.map((p) => (
          <path
            key={p.id}
            d={p.d}
            stroke={STYLE.countries.stroke}
            strokeWidth={STYLE.countries.width * k}
          />
        ))}
        {paths.lakes.map((p) => (
          <path key={p.id} d={p.d} fill={STYLE.lakes.fill} stroke="none" />
        ))}
        {paths.rivers.map((p) => (
          <path
            key={p.id}
            d={p.d}
            stroke={STYLE.rivers.stroke}
            strokeWidth={STYLE.rivers.width * k}
          />
        ))}
        {paths.coastline.map((p) => (
          <path
            key={p.id}
            d={p.d}
            stroke={STYLE.coastline.stroke}
            strokeWidth={STYLE.coastline.width * k}
          />
        ))}
        {paths.regions.map((p) => (
          <path
            key={p.id}
            d={p.d}
            stroke={STYLE.regions.stroke}
            strokeWidth={STYLE.regions.width * k}
            strokeDasharray={STYLE.regions.dash.map((v) => v * k).join(" ")}
          />
        ))}
      </g>
      {regionLabels.map((l) => (
        <text
          key={`rl-${l.id}`}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          fill={STYLE.regionText.fill}
          fontStyle="italic"
          {...text(STYLE.regionText.size)}
        >
          {l.name}
        </text>
      ))}
      {places.map((f) => {
        const [p] = geometryPoints(meta, f.geometry);
        return p ? (
          <g key={`pl-${f.properties.id}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={STYLE.places.radius * k}
              fill={STYLE.places.fill}
            />
            <text
              x={p.x + 6 * k}
              y={p.y - 4 * k}
              fill={STYLE.places.fill}
              {...text(STYLE.places.size)}
            >
              {f.properties.name_en}
            </text>
          </g>
        ) : null;
      })}
    </svg>
  );
};
