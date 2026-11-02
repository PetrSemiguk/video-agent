import { useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import type { PlateMeta } from "./plate";

/** Loads studio/public/plates/<name>.json, holding the render until it arrives. */
export const usePlateMeta = (plate: string): PlateMeta | null => {
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

  return meta;
};
