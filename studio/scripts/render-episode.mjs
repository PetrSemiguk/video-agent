import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { prepareEpisode } from "./prepare-episode.mjs";

const require = createRequire(import.meta.url);
require("./load-ts.cjs");
const { styleReview, type, colors } = require("../src/design/tokens.ts");
const leadArgument = process.argv.find((arg) =>
  arg.startsWith("--lead-frames="),
);
const { inputProps, audioSha256 } = prepareEpisode({
  sync: leadArgument
    ? { labelLeadFrames: Number(leadArgument.split("=")[1]) }
    : {},
});
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
  if (inputProps.timing)
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
  sync: composition.props.prepared.syncReport,
};
fs.writeFileSync(
  smoke ? "out/episode-map-smoke-metadata.json" : "out/episode-metadata.json",
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(JSON.stringify(metadata));
const prepared = composition.props.prepared;
const slug = prepared.storyboard.episode.slug;
const previewShots = [];
const firstFrames = prepared.assembly.shots.map((s) => s.from);
const smokeStart = prepared.assembly.shots[1].from;
for (const frame of smoke ? [smokeStart + 12, smokeStart + 49] : firstFrames) {
  const index = firstFrames.indexOf(frame);
  const id = index < 0 ? `review-${frame}` : prepared.assembly.shots[index].id;
  const image = smoke
    ? `out/episode-map-smoke-${frame}.png`
    : `out/${slug}-first-${id}.png`;
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame,
    output: image,
    chromiumOptions,
  });
  console.log(`Rendered episode frame ${frame}`);
  if (!smoke) {
    const window = prepared.assembly.shots[index];
    const text = prepared.words.words
      .filter(
        (w) =>
          w.end > window.from / composition.fps &&
          w.start < (window.from + window.durationInFrames) / composition.fps,
      )
      .map((w) => w.text)
      .join(" ");
    previewShots.push({ id, from: frame, text, image: path.resolve(image) });
  }
}
if (!smoke) {
  const payload = {
    slug,
    width: composition.width,
    height: composition.height,
    shots: previewShots,
    style: {
      width: styleReview.width,
      padding: styleReview.padding,
      gap: styleReview.gap,
      inset: styleReview.cardPadding,
      font: path.resolve("public", type.headlineFile),
      titleSize: type.size.title,
      labelSize: type.size.labelRegion,
      bodySize: type.size.subtitle,
      lineHeight: type.lineHeight,
      background: colors.background,
      surface: colors.surface,
      text: colors.labelText,
      accent: colors.regionA,
    },
  };
  fs.writeFileSync(
    `out/${slug}-preview-input.json`,
    JSON.stringify(payload, null, 2) + "\n",
  );
  fs.writeFileSync(
    `out/${slug}-assembly.json`,
    JSON.stringify(prepared.assembly, null, 2) + "\n",
  );
  fs.writeFileSync(
    `out/${slug}-sync.json`,
    JSON.stringify(prepared.syncReport, null, 2) + "\n",
  );
  const stdout = execFileSync(
    "uv",
    [
      "run",
      "--no-sync",
      "python",
      "-m",
      "vap.qa.storyboard_preview",
      "--input",
      path.resolve(`out/${slug}-preview-input.json`),
      "--out",
      path.resolve(`out/${slug}-preview.png`),
    ],
    {
      cwd: path.resolve("../pipeline"),
      encoding: "utf8",
      env: {
        ...process.env,
        UV_CACHE_DIR: process.env.UV_CACHE_DIR ?? path.resolve("out/uv-cache"),
      },
    },
  );
  console.log(stdout.trim());
}
if (!process.argv.includes("--stills-only") && !smoke) {
  let previous = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    outputLocation: `out/episode-${slug}-synced.mp4`,
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
  console.log(`Rendered out/episode-${slug}-synced.mp4`);
}
