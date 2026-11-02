// out/ab-side-by-side.mp4: A (MapLibre) left, B (plate + CSS) right, each 960x540, labelled.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const A = "out/ab-a-maplibre.mp4";
const B = "out/ab-b-plate.mp4";
const OUT = "out/ab-side-by-side.mp4";
for (const f of [A, B]) {
  if (!existsSync(f)) {
    console.error(`missing ${f}; render it first`);
    process.exit(1);
  }
}

// ffmpeg filter escaping: the drive colon in the font path must be escaped.
const font = "C\\:/Windows/Fonts/arial.ttf";
const label = (text) =>
  `drawtext=fontfile='${font}':text='${text}':x=16:y=16:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8`;
const filter = [
  `[0:v]scale=960:540:flags=lanczos,${label("A · MapLibre 3D")}[a]`,
  `[1:v]scale=960:540:flags=lanczos,${label("B · Plate + CSS")}[b]`,
  `[a][b]hstack=inputs=2[v]`,
].join(";");

const res = spawnSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-y",
    "-i",
    A,
    "-i",
    B,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "18",
    OUT,
  ],
  { stdio: "inherit" },
);
if (res.status !== 0) {
  process.exit(res.status ?? 1);
}
console.log(`wrote ${OUT}`);
