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
const write = (file, data) => {
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
  const marker = "CARD_LAYOUT_AUDIT ",
    at = text.indexOf(marker);
  if (at < 0) return;
  const report = JSON.parse(text.slice(at + marker.length));
  audits.set(`${report.kind}-${report.stress}`, report);
};
for (const kind of ["title", "end"])
  for (const stress of [false, true]) {
    const inputProps = { kind, stress };
    const composition = await selectComposition({
      serveUrl,
      id: "CardCheck",
      inputProps,
      chromiumOptions,
    });
    const { buffer } = await renderStill({
      serveUrl,
      composition,
      inputProps,
      output: null,
      frame: 60,
      chromiumOptions,
      onBrowserLog,
    });
    const file = `out/${kind}-card${stress ? "-stress" : ""}.png`;
    write(file, buffer);
    console.log(`Rendered ${file}`);
  }
if (audits.size !== 4) throw Error("Missing card layout evidence");
write(
  "out/cards-layout.json",
  JSON.stringify([...audits.values()], null, 2) + "\n",
);
if (!process.argv.includes("--checks-only")) {
  const composition = await selectComposition({
    serveUrl,
    id: "Showreel",
    chromiumOptions,
  });
  let bucket = -1;
  await renderMedia({
    serveUrl,
    composition,
    outputLocation: "out/showreel.mp4",
    chromiumOptions,
    concurrency: 1,
    codec: "h264",
    imageFormat: "jpeg",
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    overwrite: true,
    onProgress: ({ progress }) => {
      const b = Math.floor(progress * 10);
      if (b !== bucket) {
        console.log(`Showreel ${b * 10}%`);
        bucket = b;
      }
    },
  });
  console.log("Rendered out/showreel.mp4");
}
