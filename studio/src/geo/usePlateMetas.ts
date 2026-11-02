import { useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import type { PlateMeta } from "./plate";

/** Loads several studio/public/plates/<name>.json at once (order preserved). */
export const usePlateMetas = (plates: string[]): PlateMeta[] | null => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const key = plates.join(",");
  const [handle] = useState(() => delayRender(`Loading plates ${key}`));
  const [metas, setMetas] = useState<PlateMeta[] | null>(null);

  useEffect(() => {
    Promise.all(
      key.split(",").map(async (p) => {
        const res = await fetch(staticFile(`plates/${p}.json`));
        if (!res.ok) throw new Error(`plates/${p}.json: HTTP ${res.status}`);
        return (await res.json()) as PlateMeta;
      }),
    )
      .then((m) => {
        setMetas(m);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [key, handle, continueRender, cancelRender]);

  return metas;
};
