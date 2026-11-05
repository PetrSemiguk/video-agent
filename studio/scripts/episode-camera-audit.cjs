// Every-frame camera continuity and on-screen map credits. Run `review:episode` first.
require("./load-ts.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { buildCamera } = require("../src/episode/camera.ts");
const { creditsAt, wordsSchema } = require("../src/episode/plan.ts");
const { metersPerPx } = require("../src/camera/timeline.ts");

const slug = process.argv[2];
if (!slug) throw new Error("Usage: episode-camera-audit.cjs <slug>");
const prepared = JSON.parse(
  fs.readFileSync(`out/${slug}-prepared.json`, "utf8"),
);
const { storyboard, assembly, metas, words } = prepared;
wordsSchema.parse(words);
const timeline = buildCamera(storyboard, assembly, metas, 1920, 1080);
const last = assembly.shots.at(-1);
const total = last.from + last.durationInFrames;
const steps = [];
let naturalEarth = 0;
for (let frame = 0; frame < total; frame++) {
  const credits = creditsAt(storyboard, assembly, metas, frame);
  if (
    !credits.includes("NASA Earth Observatory") ||
    !credits.includes("AWS Terrain Tiles")
  )
    throw new Error(`Missing map credits at frame ${frame}`);
  if (credits.includes("Natural Earth")) naturalEarth++;
  if (frame) {
    const a = timeline.poseAt(frame - 1);
    const b = timeline.poseAt(frame);
    const scale = metersPerPx((a.zoom + b.zoom) / 2);
    steps.push([(b.x - a.x) / scale, (b.y - a.y) / scale]);
  }
}
const speed = steps.map((step) => Math.hypot(...step));
const jumps = steps
  .slice(1)
  .map((step, index) =>
    Math.hypot(step[0] - steps[index][0], step[1] - steps[index][1]),
  );
const evidence = {
  total_frames: total,
  credited_frames: total,
  natural_earth_credit_frames: naturalEarth,
  max_camera_center_step_px: Math.max(...speed),
  max_camera_center_step_change_px: Math.max(...jumps),
  boundaries: timeline.boundaries,
  keys: timeline.keys,
  credits_by_shot: assembly.shots.map((shot) => ({
    id: shot.id,
    from: shot.from,
    credits: creditsAt(storyboard, assembly, metas, shot.from),
  })),
};
const target = path.resolve(`out/episodes/${slug}/camera-and-credits.json`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(evidence, null, 2) + "\n", "utf8");
console.log(
  JSON.stringify({ ...evidence, keys: undefined, credits_by_shot: undefined }),
);
