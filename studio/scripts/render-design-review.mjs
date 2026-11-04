// Reproducible step 2.1 artifacts; API options mirror remotion.config.ts.
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const serveUrl = await bundle({
  entryPoint: path.resolve("src/index.ts"),
  rspack: true,
});
const chromiumOptions = { gl: "angle" };
// Existing Windows artifacts can reject a truncate-on-open; update through r+.
const writeArtifact = (output, buffer) => {
  const fd = fs.openSync(output, fs.existsSync(output) ? "r+" : "w");
  try {
    fs.writeFileSync(fd, buffer);
    fs.ftruncateSync(fd, buffer.length);
  } finally {
    fs.closeSync(fd);
  }
};
for (const [id, output] of [
  ["StyleSheet", "out/style-sheet.png"],
  ["GradeCompareChina", "out/grade-compare-china.png"],
  ["GradeCompareEurope", "out/grade-compare-europe.png"],
]) {
  const composition = await selectComposition({
    serveUrl,
    id,
    chromiumOptions,
  });
  const { buffer } = await renderStill({
    serveUrl,
    composition,
    output: null,
    chromiumOptions,
  });
  writeArtifact(output, buffer);
  console.log(`Rendered ${output}`);
}
const composition = await selectComposition({
  serveUrl,
  id: "DemoChinaRivers",
  chromiumOptions,
});
await renderStill({
  serveUrl,
  composition,
  output: "out/demo-design-frame.png",
  frame: 570,
  chromiumOptions,
});
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    "out/demo-design-frame.png",
    "-vf",
    "scale=640:360:flags=lanczos",
    "-frames:v",
    "1",
    "out/mobile-check.png",
  ],
  { stdio: "ignore" },
);
await renderMedia({
  serveUrl,
  composition,
  outputLocation: "out/demo-china-rivers-v1.mp4",
  codec: "h264",
  pixelFormat: "yuv420p",
  colorSpace: "bt709",
  imageFormat: "jpeg",
  chromiumOptions,
  concurrency: 1,
  onProgress: ({ progress }) => {
    if (progress === 1) console.log("Video complete");
  },
});
writeArtifact(
  "out/demo-china-rivers.mp4",
  fs.readFileSync("out/demo-china-rivers-v1.mp4"),
);
console.log("Rendered all step 2.1 artifacts");
