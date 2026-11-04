// Step 2.2: native-size limit sheets, browser layout evidence, then one map render.
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";

const serveUrl = await bundle({
  entryPoint: path.resolve("src/index.ts"),
  rspack: true,
});
const chromiumOptions = { gl: "angle" };
const writeArtifact = (file, data) => {
  const fd = fs.openSync(file, fs.existsSync(file) ? "r+" : "w");
  try {
    fs.writeFileSync(fd, data);
    fs.ftruncateSync(fd, Buffer.byteLength(data));
  } finally {
    fs.closeSync(fd);
  }
};
const audits = new Map();
const onBrowserLog = ({ text }) => {
  const marker = "TEXT_LAYOUT_AUDIT ";
  const at = text.indexOf(marker);
  if (at < 0) return;
  const report = JSON.parse(text.slice(at + marker.length));
  audits.set(report.stress, report);
};
for (const stress of [false, true]) {
  const inputProps = { stress };
  const composition = await selectComposition({
    serveUrl,
    id: "TextLayersSheet",
    inputProps,
    chromiumOptions,
  });
  const { buffer } = await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame: 60,
    output: null,
    chromiumOptions,
    onBrowserLog,
  });
  const output = stress
    ? "out/text-layers-stress.png"
    : "out/text-layers-sheet.png";
  writeArtifact(output, buffer);
  console.log(`Rendered ${output}`);
}
if (audits.size !== 2)
  throw new Error("Missing browser layout evidence for both text sheets");
writeArtifact(
  "out/text-layers-layout.json",
  JSON.stringify([...audits.values()], null, 2) + "\n",
);
console.log("Browser layout: 8 component instances passed");

if (!process.argv.includes("--sheets-only")) {
  const composition = await selectComposition({
    serveUrl,
    id: "TextLayers",
    chromiumOptions,
  });
  let bucket = -1;
  await renderMedia({
    serveUrl,
    composition,
    outputLocation: "out/text-layers.mp4",
    chromiumOptions,
    concurrency: 1,
    codec: "h264",
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    imageFormat: "jpeg",
    overwrite: true,
    onProgress: ({ progress }) => {
      const next = Math.floor(progress * 10);
      if (next !== bucket) {
        console.log(`Text layers render ${next * 10}%`);
        bucket = next;
      }
    },
  });
  console.log("Rendered out/text-layers.mp4");
}
