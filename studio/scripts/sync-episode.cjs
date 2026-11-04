require("./load-ts.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { storyboardSchema } = require("../src/storyboard/schema.ts");
const { wordsSchema } = require("../src/episode/plan.ts");
const { resolveStoryboard, detectPauses } = require("../src/episode/sync.ts");
const { pcmWavInfo, pcmWavSamples } = require("../src/episode/wav.ts");
const { motion } = require("../src/design/tokens.ts");
const root = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const filename =
  args.find((arg) => !arg.startsWith("--")) ??
  path.join(root, "episodes/_sandbox/tts-test/storyboard.json");
const read = (file) =>
  JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const storyboard = storyboardSchema.parse(read(filename));
const words = wordsSchema.parse(read(path.join(root, storyboard.audio.words)));
const buffer = fs.readFileSync(path.join(root, storyboard.audio.src));
const bytes = buffer.buffer.slice(
  buffer.byteOffset,
  buffer.byteOffset + buffer.byteLength,
);
const audio = pcmWavInfo(bytes);
if (
  crypto.createHash("sha256").update(buffer).digest("hex") !==
    words.audio_sha256 ||
  Math.abs(audio.duration - words.duration) > 1 / audio.sampleRate
)
  throw new Error("WAV/words mismatch");
const lead = args.find((arg) => arg.startsWith("--lead-frames="));
const options = lead ? { labelLeadFrames: Number(lead.split("=")[1]) } : {};
const result = resolveStoryboard(
  storyboard,
  words,
  detectPauses(pcmWavSamples(bytes), audio.sampleRate),
  Math.ceil((audio.samples * motion.fps) / audio.sampleRate),
  options,
);
const out = path.join(root, "studio/out");
fs.mkdirSync(out, { recursive: true });
for (const [suffix, value] of [
  ["sync", result.syncReport],
  ["assembly", result.assembly],
  ["runtime-storyboard", result.storyboard],
])
  fs.writeFileSync(
    path.join(out, `${storyboard.episode.slug}-${suffix}.json`),
    JSON.stringify(value, null, 2) + "\n",
  );
console.log(
  JSON.stringify(
    {
      shots: result.assembly.shots.length,
      pauses: result.syncReport.pauses.length,
      cuts: result.syncReport.cuts,
      leads: result.syncReport.leads,
    },
    null,
    2,
  ),
);
