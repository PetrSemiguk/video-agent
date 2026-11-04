// Browser acceptance check: font-ready overflow, safe height and sibling collisions.
import { useEffect, useState } from "react";
import { useDelayRender } from "remotion";
import { fontsReady } from "../../design/fonts";
import { infoLayer, space } from "../../design/tokens";

export const useInfoLayoutAudit = (stress: boolean) => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Checking infographic layout"));
  useEffect(() => {
    fontsReady
      .then(() => document.fonts.ready)
      .then(() => {
        const measurements = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-info-cell] [data-text-layer]",
          ),
        ).map((element) => {
          const bounds = element.getBoundingClientRect();
          const panel = element
            .closest("[data-info-cell]")!
            .getBoundingClientRect();
          const nodes = Array.from(
            element.querySelectorAll<HTMLElement>("[data-info-box]"),
          );
          const overflow = nodes.some((node) => {
            const box = node.getBoundingClientRect();
            return (
              node.scrollWidth > node.clientWidth + 1 ||
              node.scrollHeight > node.clientHeight + 1 ||
              box.left < bounds.left - 1 ||
              box.right > bounds.right + 1 ||
              box.bottom > bounds.bottom + 1 ||
              box.top < bounds.top - 1
            );
          });
          let collisions = 0;
          for (const group of element.querySelectorAll<HTMLElement>(
            "[data-info-group]",
          )) {
            const peers = Array.from(
              group.querySelectorAll<HTMLElement>("[data-info-peer]"),
            ).filter(
              (peer) =>
                peer.parentElement?.closest("[data-info-group]") === group,
            );
            for (let a = 0; a < peers.length; a++)
              for (let b = a + 1; b < peers.length; b++) {
                const x = peers[a].getBoundingClientRect(),
                  y = peers[b].getBoundingClientRect();
                if (
                  Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 &&
                  Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1
                )
                  collisions++;
              }
          }
          return {
            component: element.dataset.textLayer,
            width: bounds.width,
            height: bounds.height,
            overflow,
            collisions,
            outsidePanel:
              bounds.left < panel.left ||
              bounds.right > panel.right ||
              bounds.top < panel.top ||
              bounds.bottom > panel.bottom,
            exceeds1080SafeHeight:
              bounds.height >
              infoLayer.demo.height *
                (1 - space.safeArea - space.bottomReserve) -
                2 * space.enterShift,
            textBoxes: nodes.length,
          };
        });
        if (
          measurements.length !== 5 ||
          measurements.some(
            (item) =>
              item.overflow ||
              item.collisions ||
              item.outsidePanel ||
              item.exceeds1080SafeHeight,
          )
        )
          throw new Error(
            `Infographic layout failed: ${JSON.stringify(measurements)}`,
          );
        console.info(
          `INFO_LAYOUT_AUDIT ${JSON.stringify({ stress, measurements })}`,
        );
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [stress, handle, continueRender, cancelRender]);
};
