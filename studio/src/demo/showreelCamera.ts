// Camera timeline of the CameraShowreel demo (step 1.5), shared with the vitest checks.
import centralMeta from "../../public/plates/central-europe.json";
import europeMeta from "../../public/plates/europe.json";
import {
  boundsOf,
  drift,
  establish,
  flyTo,
  focusOn,
  followLine,
  MeasuredLonLatLine,
  plateZoomLimits,
} from "../camera/presets";
import { cameraTimeline } from "../camera/timeline";
import type { GeoCollection } from "../geo/geojson";
import { pointAtFraction } from "../geo/line";
import type { PlateMeta } from "../geo/plate";

export const SHOWREEL = {
  fps: 30,
  width: 1920,
  height: 1080,
  frames: 900,
  plates: ["europe", "central-europe"],
  /** Crossfade europe -> central-europe. */
  transitionAt: 300,
  transitionFrames: 45,
  /** Danube drawing (absolute frames). */
  riverStart: 390,
  riverDraw: 300,
  alpsIn: 180,
  alpsOut: 330,
  plainLabelAt: 820,
  /** Great Hungarian Plain: NE region bounds and label point (vap.geo.find --plate central-europe). */
  plainBounds: [17.95, 44.745, 23.359, 48.71] as [
    number,
    number,
    number,
    number,
  ],
  plainLabel: [19.9302, 46.7886] as [number, number],
} as const;

export const metas = {
  europe: europeMeta as unknown as PlateMeta,
  central: centralMeta as unknown as PlateMeta,
};

export const riverProgress = (abs: number) =>
  Math.min(1, Math.max(0, (abs - SHOWREEL.riverStart) / SHOWREEL.riverDraw));

export const lineOf = (coll: GeoCollection): MeasuredLonLatLine => {
  const f = coll.features[0] as unknown as {
    geometry: { coordinates: [number, number][] };
    properties: { cumfrac: number[] };
  };
  return { points: f.geometry.coordinates, cumfrac: f.properties.cumfrac };
};

export const buildShowreelTimeline = (data: {
  danube: GeoCollection;
  alps: GeoCollection;
}) => {
  const { width: W, height: H, fps } = SHOWREEL;
  const E = plateZoomLimits(metas.europe, W, H);
  const C = plateZoomLimits(metas.central, W, H);
  const plateCentre = { lon: 18.2, lat: 46.4 };
  // Land exactly where followLine aims when the river starts (lead 0.05 ahead of Vienna),
  // so the camera does not have to chase a head that is already moving.
  const [aimLon, aimLat] = pointAtFraction(lineOf(data.danube), 0.05);
  const riverAim = { lon: aimLon, lat: aimLat };
  return cameraTimeline(
    [
      // 0–4 s: establish on Europe.
      establish(
        { center: { lon: 10.6, lat: 48.6 }, zoom: E.cover + 0.12 },
        120,
        { drift: [0.006, -0.002] },
      ),
      // 4–7.5 s: fly to the Alps, framing Switzerland + Austria (europe plate limit).
      flyTo(
        { center: { lon: 11.6, lat: 47.3 }, zoom: Math.min(E.max - 0.1, 5.25) },
        105,
      ),
      // 7.5–8.5 s: settle on CH + AT with a light tilt.
      focusOn(data.alps, 30, { tilt: 6, bearing: 2, maxZoom: E.max - 0.16 }),
      // 8.5–10 s: head for the centre of the central-europe plate, level out.
      flyTo({ center: plateCentre, zoom: C.cover + 0.06 }, 45),
      // 10–11.5 s: zoom through the plates while they crossfade.
      flyTo({ center: { lon: 17.6, lat: 47.0 }, zoom: C.cover + 0.2 }, 45),
      // 11.5–12.8 s: descend onto the start of the Danube.
      flyTo({ center: riverAim, zoom: C.max - 0.18 }, 39),
      // 12.8–24 s: follow the head of the river (Vienna -> Belgrade).
      followLine(lineOf(data.danube), riverProgress, 336, {
        zoom: C.max - 0.18,
        lead: 0.05,
        lag: 8,
        smooth: 24,
        blend: 60,
      }),
      // 24–27 s: drift, then frame the Great Hungarian Plain.
      drift(90, { dir: [1, -0.3], amount: 0.02 }),
      focusOn(
        boundsOf(
          SHOWREEL.plainBounds as unknown as [number, number, number, number],
        ),
        90,
        {
          maxZoom: C.max - 0.12,
        },
      ),
    ],
    { fps, width: W, height: H },
  );
};
