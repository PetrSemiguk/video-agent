// QA composition: verifies in the real renderer (Chromium) that toScreen() matches where the
// browser actually places points of the geo layer, on a tilted/rotated camera path.
// Each frame measures zero-size probe elements with getBoundingClientRect(), compares them
// with toScreen() and prints the max error (also to the console: "PROJCHECK ...").
// A magenta line with vector-effect: non-scaling-stroke (10 px) checks stroke behaviour.
import { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, useCurrentFrame, useDelayRender } from "remotion";
import { keyframedCamera } from "../camera/keyframes";
import { colors, fontStack } from "../design/tokens";
import {
  GeoSvg,
  LonLatTuple,
  PlateStage,
  useMapProjection,
} from "../map/PlateStage";

export const PROBES: LonLatTuple[] = [
  [104.07, 30.67], // Chengdu
  [116.39, 39.9], // Beijing
  [121.47, 31.23], // Shanghai
  [91.1, 29.65], // Lhasa
  [113.26, 23.13], // Guangzhou
];

export const projectionCheckCamera = keyframedCamera([
  { t: 0, zoom: { cover: 0.25 } },
  {
    t: 3,
    center: { lon: 108, lat: 31.5 },
    zoom: { native: -0.4 },
    pitch: 18,
    bearing: 5,
  },
  {
    t: 6,
    center: { lon: 112, lat: 31 },
    zoom: { native: -0.35 },
    pitch: 12,
    bearing: -4,
  },
  { t: 10, zoom: { cover: 0.4 }, pitch: 8, bearing: 3 },
]);

const Probes: React.FC = () => {
  const { toPlatePx, toScreen } = useMapProjection();
  const frame = useCurrentFrame();
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const { delayRender, continueRender } = useDelayRender();
  const [result, setResult] = useState<{ frame: number; max: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const handle = delayRender(`measure ${frame}`);
    let max = 0;
    PROBES.forEach((ll, i) => {
      const r = refs.current[i]!.getBoundingClientRect();
      const s = toScreen(ll);
      max = Math.max(max, Math.hypot(r.left - s.x, r.top - s.y));
    });
    console.log(`PROJCHECK frame=${frame} maxErrPx=${max.toFixed(4)}`);
    setResult({ frame, max });
    continueRender(handle);
  }, [frame, toScreen, delayRender, continueRender]);

  return (
    <>
      {PROBES.map((ll, i) => {
        const p = toPlatePx(ll);
        return (
          <div
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: 0,
              height: 0,
            }}
          />
        );
      })}
      {result ? (
        <div
          data-result
          style={{
            position: "fixed",
            display: "none",
          }}
        >
          {result.max}
        </div>
      ) : null}
    </>
  );
};

const ScreenMarkers: React.FC = () => {
  const { toScreen } = useMapProjection();
  return (
    <>
      {PROBES.map((ll, i) => {
        const s = toScreen(ll);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: s.x - 6,
              top: s.y - 6,
              width: 12,
              height: 12,
              borderRadius: 6,
              border: `2px solid ${colors.debugMarker}`,
            }}
          />
        );
      })}
    </>
  );
};

const StrokeProbe: React.FC = () => {
  const { meta } = useMapProjection();
  return (
    <GeoSvg>
      <path
        d={`M0 ${meta.height / 2} L${meta.width} ${meta.height / 2}`}
        stroke="#ff00ff"
        strokeWidth={10}
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
    </GeoSvg>
  );
};

export const ProjectionCheck: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: fontStack }}>
    <PlateStage
      plate="china-east-hs05"
      camera={projectionCheckCamera}
      geo={
        <>
          <StrokeProbe />
          <Probes />
        </>
      }
      screen={<ScreenMarkers />}
    />
  </AbsoluteFill>
);
