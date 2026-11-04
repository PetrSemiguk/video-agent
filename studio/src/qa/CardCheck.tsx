import { useEffect, useState } from "react";
import { AbsoluteFill, useDelayRender } from "remotion";
import { keyframedCamera } from "../camera/keyframes";
import { TitleCard } from "../components/cards/TitleCard";
import { EndCard } from "../components/cards/EndCard";
import { cards, colors, fontStack, space, type } from "../design/tokens";
import { fontsReady } from "../design/fonts";
import { PlateStage } from "../map/PlateStage";

const camera = keyframedCamera([{ t: 0, zoom: { cover: 0.15 } }]);
const CardAudit: React.FC<{
  kind: "title" | "end";
  stress: boolean;
}> = ({ kind, stress }) => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() =>
    delayRender("Checking card text and end-screen reservations"),
  );
  useEffect(() => {
    fontsReady
      .then(() => document.fonts.ready)
      .then(() => {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>("[data-card-text]"),
        );
        const zones = Object.values(cards.endZones);
        const boxes = nodes.map((node) => {
          const b = node.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(node);
          const glyph = range.getBoundingClientRect();
          return {
            width: b.width,
            height: b.height,
            overflow:
              node.scrollWidth > node.clientWidth + 1 ||
              node.scrollHeight > node.clientHeight + 1 ||
              glyph.bottom > b.bottom + 1,
            outsideSafe:
              b.left < cards.showreel.width * space.safeArea - 1 ||
              b.right > cards.showreel.width * (1 - space.safeArea) + 1 ||
              b.top < cards.showreel.height * space.safeArea - 1 ||
              b.bottom > cards.showreel.height * (1 - space.bottomReserve) + 1,
            overlapsEndZone:
              kind === "end" &&
              zones.some(
                (z) =>
                  Math.min(b.right, z.x + z.width) - Math.max(b.left, z.x) >
                    0 &&
                  Math.min(b.bottom, z.y + z.height) - Math.max(b.top, z.y) > 0,
              ),
          };
        });
        if (
          boxes.length < 2 ||
          boxes.some((b) => b.overflow || b.outsideSafe || b.overlapsEndZone)
        )
          throw new Error(`Card layout failed: ${JSON.stringify(boxes)}`);
        console.info(
          `CARD_LAYOUT_AUDIT ${JSON.stringify({ kind, stress, boxes })}`,
        );
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [kind, stress, handle, continueRender, cancelRender]);
  return null;
};
export const CardCheck: React.FC<{
  kind: "title" | "end";
  stress: boolean;
}> = ({ kind, stress }) => {
  return (
    <PlateStage
      plate="china-east-hs05"
      camera={camera}
      screen={
        <>
          <CardAudit kind={kind} stress={stress} />
          {kind === "title" ? (
            <TitleCard
              title={
                stress
                  ? "W".repeat(cards.titleLimit)
                  : "THE SHAPE OF THE HEARTLAND"
              }
              subtitle={
                stress
                  ? "W".repeat(cards.subtitleLimit)
                  : "Rivers, mountains and the geography of connection"
              }
              kicker={
                stress ? "W".repeat(cards.kickerLimit) : "GEOGRAPHY / HISTORY"
              }
              durationInFrames={cards.endDuration}
            />
          ) : (
            <EndCard
              title={
                stress ? "W".repeat(cards.endTitleLimit) : "KEEP EXPLORING"
              }
              subtitle={
                stress
                  ? "W".repeat(cards.endSubtitleLimit)
                  : "Follow the rivers. Read the landscape."
              }
            />
          )}
          {kind === "end" ? (
            <AbsoluteFill>
              {Object.entries(cards.endZones).map(([name, z]) => (
                <div
                  key={name}
                  style={{
                    position: "absolute",
                    left: z.x,
                    top: z.y,
                    width: z.width,
                    height: z.height,
                    outline: `${space.grid / 4}px solid ${colors.regionB}`,
                    borderRadius: name === "subscribe" ? z.width / 2 : 0,
                    color: colors.labelText,
                    fontFamily: fontStack,
                    fontSize: type.size.attribution,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  YouTube {name} reservation
                </div>
              ))}
            </AbsoluteFill>
          ) : null}
        </>
      }
    />
  );
};
