// List the actual local media inputs before Python decides whether rendering is cached.
require("./load-ts.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { storyboardSchema } = require("../src/storyboard/schema.ts");
const { brollAssets } = require("../src/media/broll.ts");
const root = path.resolve(__dirname, "../..");
const publicDir = path.join(root, "studio/public");
const story = storyboardSchema.parse(
  JSON.parse(fs.readFileSync(process.argv[2], "utf8")),
);
const files = new Set();
const asset = (name) => {
  const file = path.resolve(publicDir, name);
  if (
    path.relative(publicDir, file).startsWith("..") ||
    !fs.statSync(file).isFile()
  )
    throw new Error(`Invalid local media input: ${name}`);
  files.add(file);
  return file;
};
for (const plate of story.plates) {
  const meta = JSON.parse(
    fs.readFileSync(asset(`plates/${plate.name}.json`), "utf8"),
  );
  asset(meta.image);
}
for (const shot of story.shots)
  for (const layer of shot.layers)
    if (layer.type === "BRollClip") asset(brollAssets[layer.props.assetId].src);
    else if (layer.type === "HistoricalLayer")
      asset(
        `geo/${story.plates.find((p) => p.id === shot.plate).name}/historical/${layer.props.slug}.geojson`,
      );
const fonts = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) fonts(file);
    else files.add(file);
  }
};
fonts(path.join(publicDir, "fonts"));
console.log(
  JSON.stringify(
    [...files].sort().map((f) => path.relative(root, f).replaceAll("\\", "/")),
  ),
);
