// Sheet still for ArrowRetreat: the same withdrawal at four stages, plus an ArrowAdvance along a
// parallel course for contrast. One frame shows the line held being released, the ground let go as
// a trace, the shaft collapsing onto a head that never moves, and that an advance grows instead.
import { useMemo } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { keyframedCamera } from "../camera/keyframes";
import { ArrowAdvance } from "../components/map/ArrowAdvance";
import { ArrowRetreat } from "../components/map/ArrowRetreat";
import {
  colors,
  fontStack,
  hist,
  space,
  textLayer,
  type,
} from "../design/tokens";
import { PlateStage } from "../map/PlateStage";

export type RetreatCheckProps = {
  plate: string;
  /** Each arrow: its course, how long it draws, and whether it pulls back or advances. */
  arrows: {
    id: string;
    kind: "retreat" | "advance";
    path: [number, number][];
    drawFrames: number;
    style?: "solid" | "dashed";
    color?: "regionA" | "regionB" | "conflict" | "neutral";
    label?: string;
    caption: string;
  }[];
};

/**
 * Courses across the north China plain; shapes only, this is a component check, not an episode.
 * A retreat's course runs front first, so these run east to west, back the way ArrowCheck came.
 */
export const retreatCheckDefaults: RetreatCheckProps = {
  plate: "china-east-hs05",
  arrows: [
    {
      id: "held",
      kind: "retreat",
      // Ends at 38.5, not 40: a head up at 40 reaches into the legend in the top-left corner.
      path: [
        [120, 36.5],
        [116, 37.2],
        [112, 37.9],
        [108, 38.5],
      ],
      drawFrames: 600,
      caption: "just let go: the bar across the front is being released",
    },
    {
      id: "halfway",
      kind: "retreat",
      path: [
        [120, 33],
        [116, 33.5],
        [112, 34],
        [108, 35],
      ],
      drawFrames: 120,
      caption: "half the ground given up; the shaft collapses on the head",
    },
    {
      id: "back",
      kind: "retreat",
      path: [
        [120, 28.5],
        [116, 29],
        [112, 29.5],
        [108, 30],
      ],
      drawFrames: 60,
      style: "dashed",
      // 40 characters, the schema's limit, to check the longest label on the map.
      label: "Approximate line of withdrawal c. 190 CE",
      caption: "dashed = approximate, back on the line, longest label",
    },
    {
      id: "short",
      kind: "retreat",
      path: [
        [120, 24.5],
        [116, 25],
      ],
      drawFrames: 80,
      color: "regionB",
      caption: "short course: the head takes more of it",
    },
    {
      id: "advance",
      kind: "advance",
      path: [
        [108, 20.5],
        [112, 21],
        [116, 21.3],
        [120, 21.5],
      ],
      drawFrames: 120,
      caption: "ArrowAdvance for contrast: it grows forwards from its origin",
    },
  ],
};

const FRAME = 60;

export const RetreatCheck: React.FC<RetreatCheckProps> = ({
  plate,
  arrows,
}) => {
  const camera = useMemo(
    () => keyframedCamera([{ t: 0, zoom: { cover: hist.coverZoom } }]),
    [],
  );
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background }}>
      <PlateStage
        plate={plate}
        camera={camera}
        geo={arrows.map((arrow) => {
          const Arrow = arrow.kind === "retreat" ? ArrowRetreat : ArrowAdvance;
          return (
            // Every arrow is read at the same frame; its drawFrames sets how far it has come.
            <Sequence key={arrow.id} durationInFrames={600} layout="none">
              <Arrow
                path={arrow.path}
                drawFrames={arrow.drawFrames}
                style={arrow.style}
                color={arrow.color}
                label={arrow.label}
                exitFrames={0}
              />
            </Sequence>
          );
        })}
        screen={
          <div
            style={{
              position: "absolute",
              left: space.cornerInsetX,
              top: space.cornerInsetY,
              display: "flex",
              flexDirection: "column",
              gap: space.grid,
              // A backing panel, so the legend stays readable over whatever the map puts there.
              padding: space.grid,
              borderRadius: textLayer.radius,
              backgroundColor: textLayer.background,
            }}
          >
            {arrows.map((arrow) => (
              <div
                key={arrow.id}
                style={{
                  fontFamily: fontStack,
                  fontSize: type.size.labelCity,
                  color: colors.labelText,
                  textShadow: `0 0 6px ${colors.background}`,
                }}
              >
                {arrow.id} — {arrow.caption}
              </div>
            ))}
          </div>
        }
      />
    </AbsoluteFill>
  );
};

export const RETREAT_CHECK_FRAMES = FRAME + 1;
