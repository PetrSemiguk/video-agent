// QA: during the europe -> central-europe crossfade, a point (Vienna) drawn in plate A and
// in plate B must land on the same screen pixel. Both markers are placed inside containers
// with exactly the transform PlateSequence gives each plate; the browser positions are
// measured with getBoundingClientRect ("TRANSCHECK frame=… distPx=…" in the console).
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import {
  PERSPECTIVE_PX,
  plateTransform,
  plateView,
} from "../camera/plateProjection";
import { colors, space } from "../design/tokens";
import { useGeoJson } from "../geo/useGeoJson";
import { lonLatToPlatePx } from "../geo/plate";
import { buildShowreelTimeline, metas, SHOWREEL } from "../demo/showreelCamera";

const VIENNA = { lon: 16.3647, lat: 48.202 };

export const TransitionCheck: React.FC = () => {
  const frame = useCurrentFrame() + SHOWREEL.transitionAt; // frames 0..n map onto the transition
  const { width, height, fps } = useVideoConfig();
  const data = useGeoJson({
    danube: "geo/central-europe/rivers/danube-vienna-belgrade.geojson",
    alps: "geo/europe/custom/alps-che-aut.geojson",
  });
  const timeline = useMemo(
    () => (data ? buildShowreelTimeline(data) : null),
    [data],
  );
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const { delayRender, continueRender } = useDelayRender();

  useLayoutEffect(() => {
    if (!timeline) return;
    const handle = delayRender(`measure ${frame}`);
    const [a, b] = refs.current.map((el) => el!.getBoundingClientRect());
    console.log(
      `TRANSCHECK frame=${frame} distPx=${Math.hypot(a.left - b.left, a.top - b.top).toFixed(4)}`,
    );
    continueRender(handle);
  }, [frame, timeline, delayRender, continueRender]);

  if (!timeline) return null;
  const cam = timeline.path(metas.europe, frame / fps, width, height);
  const plates = [metas.europe, metas.central];
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.background,
        perspective: PERSPECTIVE_PX,
        perspectiveOrigin: "50% 50%",
      }}
    >
      {plates.map((meta, i) => {
        const p = lonLatToPlatePx(meta, VIENNA);
        const view = plateView(meta, cam);
        const size = space.debugMarker / view.scale;
        return (
          <div
            key={meta.name}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: meta.width,
              height: meta.height,
              transformOrigin: "0 0",
              transform: plateTransform(view, width, height),
            }}
          >
            <div
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
            <div
              style={{
                position: "absolute",
                left: p.x - size / 2,
                top: p.y - size / 2,
                width: size,
                height: size,
                borderRadius: size / 2,
                border: `${2 / view.scale}px solid ${i === 0 ? colors.debugMarker : colors.regionB}`,
              }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
