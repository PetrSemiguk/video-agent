// Generates episodes/china-unity-pilot/storyboard.json. Needs the align stage first:
// the closing shot ends at the actual narration duration.
require("./load-ts.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { motion } = require("../src/design/tokens.ts");

const root = path.resolve(__dirname, "../..");
const episode = "episodes/china-unity-pilot";
const read = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const alignment = read(`${episode}/audio/words.json`);
if (!alignment.complete) throw new Error("Unresolved alignment");

const phrase = (text) => ({ phrase: text });
const camera = (preset, params = {}) => ({ preset, params });
const fly = (lon, lat, zoom) =>
  camera("flyTo", { to: { center: { lon, lat }, zoom } });
const layer = (id, type, props, start) => ({
  id,
  type,
  props,
  ...(start ? { start: phrase(start) } : {}),
});
const river = (name) =>
  layer(`${name}-line`, "RiverLine", {
    geojson: read(`data/processed/china-east-hs05/rivers/${name}.geojson`),
    drawFrames: motion.frames.draw,
    glow: true,
  });
const lower = (id, title, subtitle, start) =>
  layer(id, "LowerThird", { title, subtitle }, start);
const anchor = (value) =>
  typeof value === "number" ? { time: value } : phrase(value);
const shot = (id, start, end, cameraMove, layers, transition = "cut") => ({
  id,
  plate: "china",
  start: anchor(start),
  end: anchor(end),
  camera: cameraMove,
  layers,
  ...(transition ? { transition: { kind: transition } } : {}),
});

const story = {
  schemaVersion: 1,
  episode: {
    slug: "china-unity-pilot",
    title: "Why China's geography pushes it toward unity",
    language: "en",
    fps: motion.fps,
  },
  plates: [{ id: "china", name: "china-east-hs05" }],
  audio: {
    src: `${episode}/audio/voice.wav`,
    words: `${episode}/audio/words.json`,
  },
  shots: [
    shot(
      "opening",
      0,
      "Start with the landscape",
      camera("establish", {
        target: { center: { lon: 110, lat: 33 }, zoom: 4.9 },
      }),
      [
        layer("title", "TitleCard", {
          title: "CHINA",
          subtitle: "The geography of unity",
          kicker: "PILOT",
        }),
      ],
      "crossfade",
    ),
    shot(
      "plateau",
      "In the west",
      "four thousand meters",
      camera("focusOn", { bounds: [96, 28, 105, 36], maxZoom: 5.2 }),
      [
        lower(
          "plateau-name",
          "Tibetan Plateau",
          "Above 4,000 m",
          "Tibetan Plateau",
        ),
      ],
    ),
    shot(
      "eastern-lowlands",
      "Farther east",
      "dense settlement",
      fly(111, 33, 5.1),
      [
        lower(
          "eastern-name",
          "Eastern lowlands",
          "Plains, river valleys and farming",
          "plains and river valleys",
        ),
      ],
    ),
    shot(
      "yellow-river",
      "The Yellow River",
      "an ancient agricultural heartland",
      fly(111, 35, 5.2),
      [
        river("yellow"),
        lower(
          "yellow-name",
          "Yellow River",
          "Across the North China Plain",
          "The Yellow River",
        ),
      ],
    ),
    shot("yangtze", "To the south", "connect them", fly(111, 30.5, 5.15), [
      river("yangtze"),
      lower(
        "yangtze-name",
        "Yangtze",
        "Linking inland regions and the coast",
        "the Yangtze",
      ),
    ]),
    shot(
      "grand-canal",
      "That connection took work",
      "maintained and expanded it",
      fly(114, 33, 5.05),
      [
        layer(
          "canal-name",
          "LowerThird",
          { title: "Grand Canal", subtitle: "An imperial transport system" },
          "Grand Canal",
        ),
        layer(
          "sui-era",
          "SectionTag",
          { text: "Sui dynasty · 7th century" },
          "the seventh century",
        ),
      ],
      "crossfade",
    ),
    shot(
      "five-basins",
      "By the thirteenth century",
      "population and troops",
      camera("drift"),
      [
        layer(
          "basins",
          "StatCounter",
          {
            value: 5,
            label: "Major river basins linked",
            unit: "13th century",
          },
          "five major river basins",
        ),
      ],
    ),
    shot(
      "division-and-reunion",
      "Geography did not guarantee unity",
      "five eighty-nine",
      camera("hold"),
      [
        layer(
          "division",
          "SectionTag",
          { text: "Unity was not inevitable" },
          "Geography did not guarantee unity",
        ),
        layer(
          "reunification",
          "BigDate",
          { year: 589, fromYear: 589, era: "CE", caption: "Sui reunification" },
          "in five eighty-nine",
        ),
      ],
    ),
    shot(
      "incentives",
      "But productive plains",
      "bring regions together",
      camera("drift"),
      [
        layer(
          "incentive-fact",
          "KeyFact",
          {
            statement: "Geography created incentives for unity",
            emphasis: "incentives",
          },
          "productive plains",
        ),
      ],
      "crossfade",
    ),
    shot(
      "closing",
      "The landscape offered opportunities",
      alignment.duration,
      fly(110, 33, 4.9),
      [
        layer(
          "recap",
          "NumberedList",
          {
            title: "Turning opportunity into empire",
            items: [
              "Productive plains",
              "Connected waterways",
              "Canals and administration",
            ],
          },
          "The landscape offered opportunities",
        ),
      ],
      null,
    ),
  ],
};

fs.writeFileSync(
  path.join(root, episode, "storyboard.json"),
  JSON.stringify(story, null, 2) + "\n",
  "utf8",
);
console.log(
  JSON.stringify({
    words: alignment.words.length,
    duration: alignment.duration,
    shots: story.shots.length,
  }),
);
