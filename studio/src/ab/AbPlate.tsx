// Variant B of the step 1.2 A/B test, now on the reusable PlateStage engine.
import type { CameraPath } from "../camera/types";
import { CHENGDU, FLYOVER_PLATE, flyoverCamera, TILT } from "../camera/flyover";
import { colors, space } from "../design/tokens";
import { useMapProjection, PlateStage } from "../map/PlateStage";

const camera: CameraPath = (meta, t, w, h) =>
  flyoverCamera(meta, t, TILT.plate, w, h);

const ChengduMarker: React.FC = () => {
  const { toPlatePx, view } = useMapProjection();
  const p = toPlatePx([CHENGDU.lon, CHENGDU.lat]);
  const size = space.debugMarker / view.scale; // constant ~12 screen px under scale()
  return (
    <div
      style={{
        position: "absolute",
        left: p.x - size / 2,
        top: p.y - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.debugMarker,
      }}
    />
  );
};

export const AbPlate: React.FC = () => (
  <PlateStage plate={FLYOVER_PLATE} camera={camera} geo={<ChengduMarker />} />
);
