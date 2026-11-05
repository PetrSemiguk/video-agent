// Content-visible still of every shot, for review sheets. The frames depend on the
// resolved plan, so this needs the Node API; the Remotion CLI cannot compute them.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { prepareEpisode } from "./prepare-episode.mjs";

const require = createRequire(import.meta.url);
require("./load-ts.cjs");
const { motion } = require("../src/design/tokens.ts");

const slug = process.argv[2];
if (!slug) throw new Error("Usage: episode-review.mjs <slug>");
const { inputProps } = prepareEpisode({
  storyboardFile: path.resolve(`../episodes/${slug}/storyboard.json`),
});
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
const { prepared } = composition.props;
fs.writeFileSync(
  `out/${slug}-prepared.json`,
  JSON.stringify(prepared, null, 2) + "\n",
  "utf8",
);
const reviews = [];
for (const shot of prepared.assembly.shots) {
  const content = prepared.storyboard.shots.find((s) => s.id === shot.id);
  // After every layer has finished drawing and settling, before the shot starts to exit.
  const settled = shot.layers.map(
    (layer, index) =>
      layer.from +
      (content.layers[index].props.drawFrames ?? 0) +
      motion.frames.base,
  );
  const latestStart = Math.max(0, ...shot.layers.map((layer) => layer.from));
  const local = Math.min(
    shot.durationInFrames - motion.frames.base - 1,
    Math.max(...settled, latestStart + motion.frames.slow + motion.frames.base),
  );
  const frame = shot.from + local;
  const output = `out/${slug}-review-${shot.id}.png`;
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    chromiumOptions,
    frame,
    output,
  });
  reviews.push({ id: shot.id, frame, image: path.resolve(output) });
  console.log(`Reviewed ${shot.id}: ${frame}`);
}
fs.writeFileSync(
  `out/${slug}-review.json`,
  JSON.stringify(reviews, null, 2) + "\n",
  "utf8",
);
