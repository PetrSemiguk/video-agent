import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(studio);
export const prepareEpisode = ({
  storyboardFile = path.join(
    root,
    "episodes/_sandbox/tts-test/storyboard.json",
  ),
  timingFile = null,
  sync = {},
} = {}) => {
  const report = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/storyboard.cjs", "validate", storyboardFile, "--check-files"],
      { cwd: studio, encoding: "utf8" },
    ),
  );
  if (!report.valid) throw new Error("Invalid storyboard");
  const storyboard = JSON.parse(fs.readFileSync(storyboardFile, "utf8"));
  const words = JSON.parse(
    fs.readFileSync(path.join(root, storyboard.audio.words), "utf8"),
  );
  const timing = timingFile
    ? JSON.parse(fs.readFileSync(timingFile, "utf8"))
    : null;
  const bytes = fs.readFileSync(path.join(root, storyboard.audio.src));
  const audioSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (audioSha256 !== words.audio_sha256) throw new Error("Voice hash changed");
  const audioSrc = `episodes/${storyboard.episode.slug}/voice.wav`;
  const destination = path.join(studio, "public", audioSrc);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
  fs.mkdirSync(path.join(studio, "out"), { recursive: true });
  const inputProps = { storyboard, words, timing, sync, audioSrc };
  fs.writeFileSync(
    path.join(studio, "out/episode-props.json"),
    JSON.stringify(inputProps, null, 2) + "\n",
    "utf8",
  );
  return { inputProps, audioSha256 };
};
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = prepareEpisode();
  console.log(
    `Prepared out/episode-props.json; voice SHA-256 ${result.audioSha256}`,
  );
}
