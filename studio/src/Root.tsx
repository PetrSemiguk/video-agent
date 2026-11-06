import { Showreel } from "./demo/Showreel";
import { Episode } from "./episode/Episode";
import { calculateEpisodeMetadata } from "./episode/metadata";
import sandboxStoryboard from "../../episodes/_sandbox/tts-test/storyboard.json";
import sandboxWords from "./storyboard/__fixtures__/tts-test-words.json";
import { CardCheck } from "./qa/CardCheck";
import { InfoDemo, InfoSheet } from "./demo/Info";
import { TextLayersDemo, TextLayersSheet } from "./demo/TextLayers";
import {
  cards,
  infoLayer,
  motion,
  textLayer,
  voiceSync,
} from "./design/tokens";
import { GradeCompare } from "./design/GradeCompare";
import { StyleSheet } from "./design/StyleSheet";
import { Composition, Still } from "remotion";
import "./design/fonts";
import { ProjectionCheck } from "./qa/ProjectionCheck";
import {
  ARROW_CHECK_FRAMES,
  ArrowCheck,
  arrowCheckDefaults,
} from "./qa/ArrowCheck";
import {
  RETREAT_CHECK_FRAMES,
  RetreatCheck,
  retreatCheckDefaults,
} from "./qa/RetreatCheck";
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
import { HIST_DEBUG_FRAMES, HistDebug, histDebugDefaults } from "./HistDebug";
import { Hello } from "./Hello";
import { PlateCheck, plateCheckDefaults } from "./PlateCheck";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Episode"
        component={Episode}
        durationInFrames={motion.fps}
        fps={motion.fps}
        width={cards.showreel.width}
        height={cards.showreel.height}
        calculateMetadata={calculateEpisodeMetadata}
        defaultProps={{
          storyboard: sandboxStoryboard,
          words: sandboxWords,
          timing: null,
          sync: { labelLeadFrames: voiceSync.labelLeadFrames },
          audioSrc: "episodes/tts-test/voice.wav",
        }}
      />
      <Composition
        id="Showreel"
        component={Showreel}
        durationInFrames={cards.showreel.duration}
        fps={motion.fps}
        width={cards.showreel.width}
        height={cards.showreel.height}
      />
      <Composition
        id="CardCheck"
        component={CardCheck}
        durationInFrames={cards.endDuration}
        fps={motion.fps}
        width={cards.showreel.width}
        height={cards.showreel.height}
        defaultProps={{ kind: "title" as const, stress: false }}
      />
      <Composition
        id="InfoSheet"
        component={InfoSheet}
        durationInFrames={infoLayer.defaultDuration}
        fps={motion.fps}
        width={infoLayer.review.width}
        height={infoLayer.review.height}
        defaultProps={{ stress: false }}
      />
      <Composition
        id="Info"
        component={InfoDemo}
        durationInFrames={infoLayer.demo.duration}
        fps={motion.fps}
        width={infoLayer.demo.width}
        height={infoLayer.demo.height}
      />
      <Composition
        id="TextLayersSheet"
        component={TextLayersSheet}
        durationInFrames={textLayer.defaultDuration}
        fps={motion.fps}
        width={textLayer.review.width}
        height={textLayer.review.height}
        defaultProps={{ stress: false }}
      />
      <Composition
        id="TextLayers"
        component={TextLayersDemo}
        durationInFrames={textLayer.demo.duration}
        fps={motion.fps}
        width={textLayer.demo.width}
        height={textLayer.demo.height}
      />
      <Still
        id="GradeCompareChina"
        component={GradeCompare}
        width={3840}
        height={1080}
        defaultProps={{ plate: "china" as const }}
      />
      <Still
        id="GradeCompareEurope"
        component={GradeCompare}
        width={3840}
        height={1080}
        defaultProps={{ plate: "europe" as const }}
      />
      <Still
        id="StyleSheet"
        component={StyleSheet}
        width={1920}
        height={1080}
      />
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
        id="HistDebug"
        component={HistDebug}
        durationInFrames={HIST_DEBUG_FRAMES}
        fps={motion.fps}
        width={cards.showreel.width}
        height={cards.showreel.height}
        defaultProps={histDebugDefaults}
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
        id="ArrowCheck"
        component={ArrowCheck}
        durationInFrames={ARROW_CHECK_FRAMES}
        fps={motion.fps}
        width={cards.showreel.width}
        height={cards.showreel.height}
        defaultProps={arrowCheckDefaults}
      />
      <Composition
        id="RetreatCheck"
        component={RetreatCheck}
        durationInFrames={RETREAT_CHECK_FRAMES}
        fps={motion.fps}
        width={cards.showreel.width}
        height={cards.showreel.height}
        defaultProps={retreatCheckDefaults}
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
