// Two HistDebug stills side by side: node scripts/hist-compare.mjs <left> <right> <output>.
import { execFileSync } from "node:child_process";

const [left, right, output] = process.argv.slice(2);
if (!output)
  throw new Error(
    "Usage: hist-compare.mjs <left.png> <right.png> <output.png>",
  );
execFileSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  left,
  "-i",
  right,
  "-filter_complex",
  "hstack=inputs=2",
  output,
]);
console.log(`Wrote ${output}`);
