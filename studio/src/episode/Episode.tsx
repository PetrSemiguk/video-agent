import { createElement, useMemo, type ComponentType } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Sequence,
  staticFile,
  useVideoConfig,
  useCurrentFrame,
} from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import { componentRegistry } from "../components/registry";
import { MapAttribution } from "../components/MapAttribution";
import { CombinedAttributionScope } from "../map/AttributionContext";
import { PlateSequence, PlateStage } from "../map/PlateStage";
import { colors } from "../design/tokens";
import { sceneTransition } from "../transitions";
import type { CameraPath } from "../camera/types";
import { buildCamera } from "./camera";
import {
  creditsAt,
  geoLayerTypes,
  layerFrames,
  layerProps,
  transitionFrames,
} from "./plan";
import type { EpisodeProps, PreparedEpisode } from "./metadata";

const Shot: React.FC<{
  data: PreparedEpisode;
  index: number;
  camera: CameraPath;
}> = ({ data, index, camera }) => {
  const { fps } = useVideoConfig();
  const shot = data.storyboard.shots[index],
    window = data.assembly.shots[index];
  const next = data.storyboard.shots[index + 1],
    overlap = transitionFrames(shot);
  const localCamera = useMemo<CameraPath>(
    () => (meta, time, w, h) => camera(meta, time + window.from / fps, w, h),
    [camera, window.from, fps],
  );
  const layers = (geo: boolean) =>
    shot.layers.map((layer, i) => {
      if (geoLayerTypes.has(layer.type) !== geo) return null;
      const slot = window.layers[i];
      const frames = layerFrames(
        layer,
        slot,
        window.durationInFrames,
        overlap,
      );
      const props = layerProps(layer, frames);
      const component = componentRegistry[layer.type]
        .component as ComponentType<Record<string, unknown>>;
      return (
        <Sequence
          key={layer.id}
          name={layer.id}
          from={slot.from}
          durationInFrames={frames}
          layout="none"
        >
          {createElement(component, props)}
        </Sequence>
      );
    });
  const extraAttribution = shot.layers.some((l) => geoLayerTypes.has(l.type))
    ? "Made with Natural Earth"
    : undefined;
  if (next && next.plate !== shot.plate && overlap > 0)
    return (
      <PlateSequence
        plates={[data.metas[shot.plate].name, data.metas[next.plate].name]}
        transitionAt={window.durationInFrames}
        transitionFrames={overlap}
        camera={localCamera}
        geo={layers(true)}
        screen={layers(false)}
        extraAttribution={extraAttribution}
      />
    );
  return (
    <PlateStage
      plate={data.metas[shot.plate].name}
      camera={localCamera}
      geo={layers(true)}
      screen={layers(false)}
      extraAttribution={extraAttribution}
    />
  );
};

const EpisodeAttribution: React.FC<{ data: PreparedEpisode }> = ({ data }) => {
  const frame = useCurrentFrame();
  return (
    <MapAttribution
      text={creditsAt(data.storyboard, data.assembly, data.metas, frame)}
    />
  );
};

export const Episode: React.FC<EpisodeProps> = ({ prepared, audioSrc }) => {
  const { width, height } = useVideoConfig();
  if (!prepared)
    throw new Error(
      "Episode metadata was not prepared; render/select with calculateMetadata",
    );
  const timeline = useMemo(
    () =>
      buildCamera(
        prepared.storyboard,
        prepared.assembly,
        prepared.metas,
        width,
        height,
      ),
    [prepared, width, height],
  );
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background }}>
      {/* One voice track at full level: scene overlaps never shorten or duplicate it. */}
      <Html5Audio src={staticFile(audioSrc)} />
      <CombinedAttributionScope>
        <TransitionSeries>
          {prepared.storyboard.shots.flatMap((shot, i) => {
            const overlap = transitionFrames(shot);
            return [
              <TransitionSeries.Sequence
                key={shot.id}
                name={shot.id}
                durationInFrames={
                  prepared.assembly.shots[i].durationInFrames + overlap
                }
              >
                <Shot data={prepared} index={i} camera={timeline.path} />
              </TransitionSeries.Sequence>,
              ...(shot.transition && shot.transition.kind !== "cut"
                ? [
                    <TransitionSeries.Transition
                      key={`${shot.id}-transition`}
                      {...sceneTransition(shot.transition)}
                    />,
                  ]
                : []),
            ];
          })}
        </TransitionSeries>
      </CombinedAttributionScope>
      <EpisodeAttribution data={prepared} />
    </AbsoluteFill>
  );
};
