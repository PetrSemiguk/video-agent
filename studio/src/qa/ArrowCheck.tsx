// Sheet still for ArrowAdvance: the same arrow at four stages, solid and dashed, long and short,
// over a plate. One frame shows how the shaft tapers, where the head sits and when a label joins.
import { useMemo } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { keyframedCamera } from "../camera/keyframes";
import { ArrowAdvance } from "../components/map/ArrowAdvance";
import {
  colors,
  fontStack,
  hist,
  space,
  textLayer,
  type,
} from "../design/tokens";
import { PlateStage } from "../map/PlateStage";

export type ArrowCheckProps = {
  plate: string;
  /** Each arrow: its course, how long it draws, and how far in we look at it. */
  arrows: {
    id: string;
    path: [number, number][];
    drawFrames: number;
    style?: "solid" | "dashed";
    color?: "regionA" | "regionB" | "conflict" | "neutral";
    label?: string;
    caption: string;
  }[];
};

/** Courses across the north China plain; shapes only, this is a component check, not an episode. */
export const arrowCheckDefaults: ArrowCheckProps = {
  plate: "china-east-hs05",
  arrows: [
    {
      id: "early",
      path: [
        [108, 40],
        [112, 38.5],
        [116, 37.5],
        [120, 36.5],
      ],
      drawFrames: 180,
      caption: "solid, a third in",
    },
    {
      id: "most",
      path: [
        [108, 35],
        [112, 34],
        [116, 33.5],
        [120, 33],
      ],
      drawFrames: 86,
      caption: "solid, nearly arrived",
    },
    {
      id: "approximate",
      path: [
        [108, 30],
        [112, 29.5],
        [116, 29],
        [120, 28.5],
      ],
      drawFrames: 60,
      style: "dashed",
      label: "Approximate course",
      caption: "dashed = approximate, arrived, labelled",
    },
    {
      id: "short",
      path: [
        [116, 25],
        [120, 24.5],
      ],
      drawFrames: 60,
      color: "regionB",
      caption: "short course: the head takes more of it",
    },
  ],
};

const FRAME = 60;

export const ArrowCheck: React.FC<ArrowCheckProps> = ({ plate, arrows }) => {
  const camera = useMemo(
    () => keyframedCamera([{ t: 0, zoom: { cover: hist.coverZoom } }]),
    [],
  );
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background }}>
      <PlateStage
        plate={plate}
        camera={camera}
        geo={arrows.map((arrow) => (
          // Every arrow is read at the same frame; its drawFrames sets how far it has come.
          <Sequence key={arrow.id} durationInFrames={600} layout="none">
            <ArrowAdvance
              path={arrow.path}
              drawFrames={arrow.drawFrames}
              style={arrow.style}
              color={arrow.color}
              label={arrow.label}
              exitFrames={0}
            />
          </Sequence>
        ))}
        screen={
          <div
            style={{
              position: "absolute",
              left: space.cornerInsetX,
              top: space.cornerInsetY,
              display: "flex",
              flexDirection: "column",
              gap: 10,
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

export const ARROW_CHECK_FRAMES = FRAME + 1;
