// Helpers for a storyboard generator, kept next to an episode as episodes/<slug>/make-storyboard.cjs.
// A storyboard inlines its geometry, and the same rivers repeat across shots, so it is generated.
// const kit = require("../../studio/scripts/storyboard-kit.cjs");
require("./load-ts.cjs");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const clean = (text) => text.toLowerCase().replace(/[^a-z0-9' -]/g, "");

/** Timing of a phrase from words.json. A phrase must occur exactly once. */
const narration = (wordsFile) => {
  const alignment = readJson(wordsFile);
  if (!alignment.complete)
    throw new Error(`Unresolved alignment: ${wordsFile}`);
  const wordAt = (text) => {
    const query = text.toLowerCase().split(/\s+/);
    const hits = alignment.words.filter((_, i) =>
      query.every(
        (token, j) => clean(alignment.words[i + j]?.text ?? "") === token,
      ),
    );
    if (hits.length !== 1) throw new Error(`Phrase "${text}": ${hits.length}`);
    return hits[0];
  };
  return {
    alignment,
    duration: alignment.duration,
    timeOf: (text) => wordAt(text).start,
    frameOf: (text, fps = 30) => Math.round(wordAt(text).start * fps),
  };
};

const anchor = (value) =>
  typeof value === "number" ? { time: value } : { phrase: value };
const camera = (preset, params = {}) => ({ preset, params });
const fly = (lon, lat, zoom) =>
  camera("flyTo", { to: { center: { lon, lat }, zoom } });
const focus = (bounds, maxZoom, padding) =>
  camera("focusOn", { bounds, maxZoom, ...(padding ? { padding } : {}) });
const layer = (id, type, props, start, end) => ({
  id,
  type,
  props,
  ...(start === undefined ? {} : { start: anchor(start) }),
  ...(end === undefined ? {} : { end: anchor(end) }),
});
const shot = (
  id,
  plate,
  start,
  end,
  cameraMove,
  layers,
  transition = "cut",
) => ({
  id,
  plate,
  start: anchor(start),
  end: anchor(end),
  camera: cameraMove,
  layers,
  ...(transition ? { transition: { kind: transition } } : {}),
});
const label = (id, text, kind, lonLat, start, end, side) =>
  layer(
    id,
    "PlaceLabel",
    { text, kind, lonLat, ...(side ? { anchor: side } : {}) },
    start,
    end,
  );

/** Length fraction of the vertex of a vap.geo.river line nearest to a place. */
const fractionAt = (river, lon, lat) => {
  const { geometry, properties } = river.features[0];
  let [best, distance] = [0, Infinity];
  geometry.coordinates.forEach(([x, y], i) => {
    const d = Math.hypot(x - lon, y - lat);
    if (d < distance) [best, distance] = [i, d];
  });
  return properties.cumfrac[best];
};

/** One reach of a river as a measured line, for camera followLine from a RiverLine's fromFraction. */
const reach = (river, from) => {
  const { geometry, properties } = river.features[0];
  const kept = geometry.coordinates
    .map((point, i) => [point, properties.cumfrac[i]])
    .filter(([, f]) => f >= from);
  const first = kept[0][1];
  const span = kept[kept.length - 1][1] - first;
  return {
    points: kept.map(([point]) => point),
    cumfrac: kept.map(([, f]) => Math.min(1, (f - first) / span)),
  };
};

/** Readable shots, with one line per geometry. */
const writeStoryboard = (file, story) => {
  const inline = [];
  const text = JSON.stringify(
    story,
    (key, item) => {
      if (key !== "geojson" && key !== "line") return item;
      inline.push(JSON.stringify(item));
      return `@@${inline.length - 1}@@`;
    },
    2,
  );
  fs.writeFileSync(
    path.join(root, file),
    text.replace(/"@@(\d+)@@"/g, (_, i) => inline[Number(i)]) + "\n",
    "utf8",
  );
};

module.exports = {
  anchor,
  camera,
  fly,
  focus,
  fractionAt,
  label,
  layer,
  narration,
  reach,
  readJson,
  shot,
  writeStoryboard,
};
