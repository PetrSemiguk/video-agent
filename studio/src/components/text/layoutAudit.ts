// Browser-only acceptance check for the native-size maximum-length review sheet.
import { useEffect, useState } from "react";
import { useDelayRender } from "remotion";
import { fontsReady } from "../../design/fonts";

export const useTextLayoutAudit = (stress: boolean) => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Checking text layer layout"));
  useEffect(() => {
    fontsReady
      .then(() => document.fonts.ready)
      .then(() => {
        const measurements = Array.from(
          document.querySelectorAll<HTMLElement>("[data-text-layer]"),
        ).map((element) => {
          const bounds = element.getBoundingClientRect();
          const panel = element
            .closest("[data-review-cell]")!
            .getBoundingClientRect();
          const content = Array.from(
            element.querySelectorAll<HTMLElement>("[data-text-content]"),
          );
          const overflow = content.some((node) => {
            const box = node.getBoundingClientRect();
            return (
              node.scrollWidth > node.clientWidth + 1 ||
              node.scrollHeight > node.clientHeight + 1 ||
              box.right > bounds.right + 1 ||
              box.bottom > bounds.bottom + 1
            );
          });
          const outsidePanel =
            bounds.left < panel.left ||
            bounds.right > panel.right ||
            bounds.top < panel.top ||
            bounds.bottom > panel.bottom;
          return {
            component: element.dataset.textLayer,
            width: bounds.width,
            height: bounds.height,
            overflow,
            outsidePanel,
          };
        });
        if (
          measurements.length !== 4 ||
          measurements.some(
            (measurement) => measurement.overflow || measurement.outsidePanel,
          )
        ) {
          throw new Error(
            `Text layer layout failed: ${JSON.stringify(measurements)}`,
          );
        }
        console.info(
          `TEXT_LAYOUT_AUDIT ${JSON.stringify({ stress, measurements })}`,
        );
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [stress, handle, continueRender, cancelRender]);
};
