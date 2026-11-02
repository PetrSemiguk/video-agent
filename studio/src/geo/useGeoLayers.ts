import { useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import type { GeoCollection, GeoLayer } from "./geojson";

export type GeoLayers = Partial<Record<GeoLayer, GeoCollection>>;

/**
 * Loads studio/public/geo/<dataset>/<layer>.geojson (mirrored from data/processed by
 * `vap.geo.extract`). Missing layers are skipped; the render waits until all are fetched.
 */
export const useGeoLayers = (
  dataset: string,
  layers: readonly GeoLayer[],
): GeoLayers | null => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Loading geo layers ${dataset}`));
  const [data, setData] = useState<GeoLayers | null>(null);
  const key = layers.join(",");

  useEffect(() => {
    const names = key.split(",") as GeoLayer[];
    Promise.all(
      names.map(async (layer) => {
        const res = await fetch(staticFile(`geo/${dataset}/${layer}.geojson`));
        return [
          layer,
          res.ok ? ((await res.json()) as GeoCollection) : null,
        ] as const;
      }),
    )
      .then((entries) => {
        const out: GeoLayers = {};
        for (const [layer, coll] of entries) {
          if (coll) {
            out[layer] = coll;
          }
        }
        setData(out);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [dataset, key, handle, continueRender, cancelRender]);

  return data;
};
