import { useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import type { GeoCollection } from "./geojson";

/**
 * Loads GeoJSON files from studio/public/ (e.g. "geo/<plate>/rivers/yellow.geojson"),
 * holding the render until all of them arrive. Fails the render on a missing file.
 */
export const useGeoJson = <K extends string>(
  files: Record<K, string>,
): Record<K, GeoCollection> | null => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const key = JSON.stringify(files);
  const [handle] = useState(() => delayRender(`Loading GeoJSON ${key}`));
  const [data, setData] = useState<Record<K, GeoCollection> | null>(null);

  useEffect(() => {
    const entries = Object.entries(JSON.parse(key)) as [K, string][];
    Promise.all(
      entries.map(async ([name, path]) => {
        const res = await fetch(staticFile(path));
        if (!res.ok) {
          throw new Error(`${path}: HTTP ${res.status}`);
        }
        return [name, (await res.json()) as GeoCollection] as const;
      }),
    )
      .then((loaded) => {
        setData(Object.fromEntries(loaded) as Record<K, GeoCollection>);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [key, handle, continueRender, cancelRender]);

  return data;
};
