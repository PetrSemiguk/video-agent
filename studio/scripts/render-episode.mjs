import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { prepareEpisode } from "./prepare-episode.mjs";

const { inputProps, audioSha256 } = prepareEpisode();
const smoke = process.argv.includes("--map-smoke");
if (smoke) {
  inputProps.storyboard.plates.push({
    id: "alternate",
    name: "china-east-hs0",
  });
  inputProps.storyboard.shots[1].plate = "alternate";
  inputProps.storyboard.shots[1].layers.push({
    id: "yellow-test",
    type: "RiverLine",
    props: {
      geojson: JSON.parse(
        fs.readFileSync(
          "../data/processed/china-east-hs05/rivers/yellow.geojson",
          "utf8",
        ),
      ),
    },
  });
  inputProps.timing.shots[1].layers.push({
    id: "yellow-test",
    from: 0,
    durationInFrames: inputProps.timing.shots[1].durationInFrames,
  });
}
const serveUrl = await bundle({
  entryPoint: path.resolve("src/index.ts"),
  rspack: true,
});
const chromiumOptions = { gl: "angle" };
const composition = await selectComposition({
  serveUrl,
  id: "Episode",
  inputProps,
  chromiumOptions,
});
const metadata = {
  durationInFrames: composition.durationInFrames,
  fps: composition.fps,
  width: composition.width,
  height: composition.height,
  audioSha256,
  storyboard: inputProps.storyboard.episode.slug,
  coverage: composition.props.prepared.coverage,
};
fs.writeFileSync(
  smoke ? "out/episode-map-smoke-metadata.json" : "out/episode-metadata.json",
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(JSON.stringify(metadata));
// Only illustrative review frames, not the step 4.3 first-frame/text preview sheet.
for (const frame of smoke ? [113, 150] : [60, 150, 290, 410, 520, 650]) {
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame,
    output: smoke
      ? `out/episode-map-smoke-${frame}.png`
      : `out/episode-${frame}.png`,
    chromiumOptions,
  });
  console.log(`Rendered episode frame ${frame}`);
}
if (!process.argv.includes("--stills-only") && !smoke) {
  let previous = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    outputLocation: "out/episode-tts-test.mp4",
    chromiumOptions,
    concurrency: 1,
    codec: "h264",
    audioCodec: "aac",
    imageFormat: "jpeg",
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    overwrite: true,
    onProgress: ({ progress }) => {
      const bucket = Math.floor(progress * 10);
      if (bucket !== previous) {
        console.log(`Episode ${bucket * 10}%`);
        previous = bucket;
      }
    },
  });
  console.log("Rendered out/episode-tts-test.mp4");
}
