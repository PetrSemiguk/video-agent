import { Composition, Still } from "remotion";
import "./design/fonts";
import { ProjectionCheck } from "./qa/ProjectionCheck";
import { TransitionCheck } from "./qa/TransitionCheck";
import { CameraShowreel } from "./demo/CameraShowreel";
import { SHOWREEL } from "./demo/showreelCamera";
import {
  DEMO_CHINA_RIVERS_FRAMES,
  DemoChinaRivers,
} from "./demo/DemoChinaRivers";
import { AbMapLibre } from "./ab/AbMapLibre";
import { AbPlate } from "./ab/AbPlate";
import { FLYOVER_FPS, FLYOVER_FRAMES } from "./camera/flyover";
import { GeoDebug, geoDebugDefaults } from "./GeoDebug";
import { GlCheck } from "./GlCheck";
import { Hello } from "./Hello";
import { PlateCheck, plateCheckDefaults } from "./PlateCheck";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Hello"
        component={Hello}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Still id="GlCheck" component={GlCheck} width={1280} height={720} />
      <Still
        id="PlateCheck"
        component={PlateCheck}
        width={1920}
        height={1080}
        defaultProps={plateCheckDefaults}
      />
      <Still
        id="GeoDebug"
        component={GeoDebug}
        width={1920}
        height={1080}
        defaultProps={geoDebugDefaults}
      />
      <Composition
        id="AbMapLibre"
        component={AbMapLibre}
        durationInFrames={FLYOVER_FRAMES}
        fps={FLYOVER_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="AbPlate"
        component={AbPlate}
        durationInFrames={FLYOVER_FRAMES}
        fps={FLYOVER_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="DemoChinaRivers"
        component={DemoChinaRivers}
        durationInFrames={DEMO_CHINA_RIVERS_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CameraShowreel"
        component={CameraShowreel}
        durationInFrames={SHOWREEL.frames}
        fps={SHOWREEL.fps}
        width={SHOWREEL.width}
        height={SHOWREEL.height}
      />
      <Composition
        id="TransitionCheck"
        component={TransitionCheck}
        durationInFrames={SHOWREEL.transitionFrames + 1}
        fps={SHOWREEL.fps}
        width={SHOWREEL.width}
        height={SHOWREEL.height}
      />
      <Composition
        id="ProjectionCheck"
        component={ProjectionCheck}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
