import { brollAssets } from "../src/media/broll.ts";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const asset = brollAssets["pexels-earth-1851190"];
const original = "../assets/broll/pexels-1851190.mp4";
if (!fs.existsSync(original)) {
  const response = await fetch(asset.downloadUrl);
  if (!response.ok) throw new Error(`Pexels CDN: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.originalSha256)
    throw new Error(
      "Media hash changed; review license/source before updating the manifest",
    );
  fs.writeFileSync(original, bytes);
}
if (
  createHash("sha256").update(fs.readFileSync(original)).digest("hex") !==
  asset.originalSha256
)
  throw new Error("Original B-roll does not match approved hash");
fs.mkdirSync("public/broll", { recursive: true });
execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    original,
    "-vf",
    "scale=1920:1080,fps=30",
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-colorspace",
    "bt709",
    `public/${asset.src}`,
  ],
  { stdio: "inherit" },
);
console.log(`Prepared ${asset.src} (approved original SHA-256 verified)`);
