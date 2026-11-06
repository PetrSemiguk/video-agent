// Generates episodes/china-unity-pilot/storyboard.json by docs/visual-grammar.md. Needs the align
// stage first: anchors and the moments rivers light up come from the actual narration timing.
require("./load-ts.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { motion, voiceSync } = require("../src/design/tokens.ts");

const root = path.resolve(__dirname, "../..");
const episode = "episodes/china-unity-pilot";
const plate = "data/processed/china-east-hs05";
const read = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const alignment = read(`${episode}/audio/words.json`);
if (!alignment.complete) throw new Error("Unresolved alignment");

const fps = motion.fps;
const clean = (text) => text.toLowerCase().replace(/[^a-z0-9' -]/g, "");
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
const timeOf = (text) => wordAt(text).start;
const frameOf = (text) => Math.round(timeOf(text) * fps);

const phrase = (text) => ({ phrase: text });
const anchor = (value) =>
  typeof value === "number" ? { time: value } : phrase(value);
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
const shot = (id, start, end, cameraMove, layers, transition = "cut") => ({
  id,
  plate: "china",
  start: anchor(start),
  end: anchor(end),
  camera: cameraMove,
  layers,
  ...(transition ? { transition: { kind: transition } } : {}),
});

const geo = {
  plateau: read(`${plate}/terrain/tibetan-plateau.geojson`),
  lowlands: read(`${plate}/terrain/eastern-lowlands.geojson`),
  yangtzeLowlands: read(`${plate}/terrain/yangtze-lowlands.geojson`),
  heartland: read(`${plate}/custom/heartland.geojson`),
  sui: read(`${plate}/routes/grand-canal-sui.geojson`),
  yuan: read(`${plate}/routes/grand-canal-yuan.geojson`),
};
const rivers = Object.fromEntries(
  ["yellow", "yangtze", "hai", "huai", "qiantang"].map((name) => [
    name,
    read(`${plate}/rivers/${name}.geojson`),
  ]),
);
const CANAL_CREDIT =
  "Canal route: approximate, own compilation - see description";
const credit = (slug) =>
  read(`${plate}/historical/${slug}.geojson`).attribution;
const SUI = {
  slug: "china-592-cliopatria",
  credit: credit("china-592-cliopatria"),
  only: ["cliopatria-sui-dynasty-592"],
  color: "regionA",
};
const LOWLAND_BOUNDS = [111.5, 28, 122, 40.5];
// Everything the incentives shot draws, rivers included: a card must not cover the waterways.
const WATERWAY_BOUNDS = [94, 25, 121.9, 41];
const CANAL_FRAME = [113, 30.2, 121.2, 40];
const CANAL_SUBJECT = [94, 25, 121.95, 41];

// Length fraction of the river vertex nearest to a place.
const fractionAt = (name, lon, lat) => {
  const { geometry, properties } = rivers[name].features[0];
  let best = 0;
  let distance = Infinity;
  geometry.coordinates.forEach(([x, y], i) => {
    const d = Math.hypot(x - lon, y - lat);
    if (d < distance) [best, distance] = [i, d];
  });
  return properties.cumfrac[best];
};
// One reach of a river as a measured line, for the camera to follow.
const reach = (name, from) => {
  const { geometry, properties } = rivers[name].features[0];
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
const YELLOW_FROM = fractionAt("yellow", 113.6, 34.9); // Zhengzhou, where it enters the plain
const YANGTZE_FROM = fractionAt("yangtze", 114.3, 30.6); // Wuhan, on the middle reach
const river = (id, name, props = {}, start, end) =>
  layer(
    id,
    "RiverLine",
    {
      geojson: rivers[name],
      drawFrames: motion.frames.draw,
      glow: true,
      ...props,
    },
    start,
    end,
  );
const shownRiver = (id, name, from, start) =>
  river(
    id,
    name,
    { drawFrames: motion.frames.slow, fromFraction: from },
    start,
  );
// A state's label fades with its map: its Sequence starts labelLeadFrames before the anchor.
const stateLabel = (id, text, kind, lonLat, start) =>
  layer(
    id,
    "PlaceLabel",
    {
      text,
      kind,
      lonLat,
      exitAt:
        frameOf("before the sui") -
        (frameOf(start) - voiceSync.labelLeadFrames),
    },
    start,
    "reunified",
  );
const label = (id, text, kind, lonLat, start, end, anchorSide) =>
  layer(
    id,
    "PlaceLabel",
    { text, kind, lonLat, ...(anchorSide ? { anchor: anchorSide } : {}) },
    start,
    end,
  );

// The canal lights each river as its head reaches it: fraction of the route at that crossing.
const yuanNodes = geo.yuan.features[0].properties.nodes;
const nodeFraction = (name) => {
  const hit = yuanNodes.find((node) => node.name === name);
  if (!hit) throw new Error(`No Yuan node ${name}`);
  return hit.fraction;
};
const yuanStart = timeOf("by the thirteenth century");
const yuanSeconds = timeOf("carrying grain") - yuanStart;
const whenCanalReaches = (fraction) => yuanStart + fraction * yuanSeconds;
const crossings = [
  // The modern Yellow River in the data runs between these Shandong nodes.
  ["qiantang", 0, 0, "Qiantang", [120.75, 30.05], "right"],
  [
    "yangtze",
    nodeFraction("Zhenjiang"),
    0.72,
    "Yangtze",
    [117.5, 31.2],
    "left",
  ],
  ["huai", nodeFraction("Huai'an"), 0, "Huai", [115.5, 32.75], "top"],
  [
    "yellow",
    (nodeFraction("Dongping") + nodeFraction("Liaocheng")) / 2,
    0.72,
    "Yellow",
    [113.6, 35.3],
    "top",
  ],
  ["hai", nodeFraction("Tianjin"), 0, "Hai", [117.9, 39.1], "right"],
];

const division = frameOf("after the han collapsed");

const story = {
  schemaVersion: 1,
  episode: {
    slug: "china-unity-pilot",
    title: "Why China's geography pushes it toward unity",
    language: "en",
    fps,
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
        target: { center: { lon: 111, lat: 34 }, zoom: 4.82 },
        push: 0.1,
      }),
      [
        layer(
          "heartland",
          "RegionHighlight",
          {
            geojson: geo.heartland,
            color: "regionA",
          },
          "China's heartland",
        ),
        label(
          "heartland-name",
          "The heartland",
          "region",
          [113.6, 36.2],
          "China's heartland",
        ),
        layer("title", "TitleCard", {
          title: "CHINA",
          subtitle: "The geography of unity",
        }),
      ],
      "crossfade",
    ),
    shot(
      "plateau",
      "In the west",
      "four thousand meters",
      focus([86, 27, 111, 38], 5.45, 20),
      [
        layer(
          "plateau-mask",
          "RegionHighlight",
          {
            geojson: geo.plateau,
            color: "regionB",
            dimOutside: true,
          },
          "the Tibetan Plateau",
        ),
        label(
          "plateau-name",
          "Tibetan Plateau",
          "region",
          [90, 33.4],
          "the Tibetan Plateau",
        ),
        label(
          "plateau-height",
          "Above 4,000 m",
          "region",
          [91, 31],
          "above four thousand",
        ),
      ],
    ),
    shot(
      "eastern-lowlands",
      "Farther east",
      "dense settlement",
      fly(113.6, 33.6, 5.14),
      [
        layer(
          "lowlands-mask",
          "RegionHighlight",
          {
            geojson: geo.lowlands,
            color: "regionA",
            dimOutside: true,
          },
          "into plains",
        ),
        label(
          "lowlands-name",
          "Eastern lowlands",
          "region",
          [115.3, 33.2],
          "into plains",
        ),
        label(
          "lowlands-use",
          "Intensive farming",
          "region",
          [115.8, 30.9],
          "intensive farming",
        ),
      ],
    ),
    (() => {
      const frames = 145;
      return shot(
        "yellow-river",
        "The Yellow River",
        "an ancient agricultural heartland",
        camera("followLine", {
          line: reach("yellow", YELLOW_FROM),
          drawFrames: frames,
          zoom: 5.4,
          lead: 0.08,
          blend: 70,
        }),
        [
          river("yellow-line", "yellow", {
            drawFrames: frames,
            fromFraction: YELLOW_FROM,
          }),
          label(
            "yellow-name",
            "Yellow River",
            "river",
            [112.2, 35.2],
            "The Yellow River",
          ),
          label(
            "plain-name",
            "North China Plain",
            "region",
            [117.2, 34.3],
            "the North China Plain",
          ),
          layer(
            "heartland-callback",
            "RegionHighlight",
            {
              geojson: geo.heartland,
              color: "regionA",
            },
            "an ancient agricultural heartland",
          ),
        ],
      );
    })(),
    (() => {
      const frames = 327;
      return shot(
        "yangtze",
        "To the south",
        "connect them",
        camera("followLine", {
          line: reach("yangtze", YANGTZE_FROM),
          drawFrames: frames,
          zoom: 5.45,
          lead: 0.05,
          blend: 120,
        }),
        [
          river("yangtze-line", "yangtze", {
            drawFrames: frames,
            fromFraction: YANGTZE_FROM,
          }),
          label(
            "yangtze-name",
            "Yangtze",
            "river",
            [110.5, 31.1],
            "the Yangtze",
          ),
          layer(
            "yangtze-farmland",
            "RegionHighlight",
            {
              geojson: geo.yangtzeLowlands,
              color: "regionA",
            },
            "middle and lower reaches",
          ),
          label(
            "yangtze-region",
            "Middle and lower Yangtze",
            "region",
            [115.6, 29.1],
            "middle and lower reaches",
          ),
          shownRiver(
            "yellow-callback",
            "yellow",
            YELLOW_FROM,
            "different landscapes",
          ),
        ],
      );
    })(),
    shot(
      "grand-canal",
      "That connection took work",
      "maintained and expanded it",
      focus(CANAL_FRAME, 5.5),
      [
        shownRiver("yellow-context", "yellow", YELLOW_FROM),
        shownRiver("yangtze-context", "yangtze", YANGTZE_FROM),
        layer(
          "sui-route",
          "RouteLine",
          {
            geojson: geo.sui,
            credit: CANAL_CREDIT,
            drawFrames: 150,
            style: "dashed",
            arrows: true,
            label: { text: "Sui · 7th century", lonLat: [124.6, 35.6] },
            nodeAnchors: { Luoyang: "left" },
          },
          "the seventh century",
        ),
        layer(
          "canal-name",
          "LowerThird",
          {
            title: "Grand Canal",
            subtitle: "Imperial transport system",
            placement: "auto",
            subject: CANAL_SUBJECT,
          },
          "an imperial transport system",
        ),
      ],
      "crossfade",
    ),
    shot(
      "five-basins",
      "By the thirteenth century",
      "population and troops",
      fly(113, 33.8, 5),
      [
        ...crossings.flatMap(([name, fraction, from, text, lonLat, side]) => {
          const at = whenCanalReaches(fraction);
          return [
            river(
              `${name}-lit`,
              name,
              { drawFrames: motion.frames.slow, fromFraction: from },
              at,
            ),
            label(`${name}-name`, text, "river", lonLat, at, undefined, side),
          ];
        }),
        layer("yuan-route", "RouteLine", {
          geojson: geo.yuan,
          credit: CANAL_CREDIT,
          drawFrames: Math.round(yuanSeconds * fps),
          arrows: true,
          label: { text: "Yuan · 13th century", lonLat: [124.2, 34.6] },
          nodeAnchors: { Beijing: "left", Jining: "left" },
        }),
        layer(
          "basins",
          "StatCounter",
          {
            value: 5,
            unit: "river systems",
            label: "linked by the Grand Canal",
            date: "By the 13th century",
            placement: "upper-left",
          },
          "five major river basins",
        ),
      ],
    ),
    shot(
      "division-and-reunion",
      "Geography did not guarantee unity",
      "five eighty-nine",
      fly(111, 33, 4.72),
      [
        layer("unity-fading", "RegionHighlight", {
          geojson: geo.heartland,
          color: "neutral",
          exitAt: motion.frames.slow + motion.frames.base,
        }),
        layer(
          "divided-map",
          "HistoricalLayer",
          {
            slug: "china-560",
            credit: credit("china-560"),
            exitAt: frameOf("before the sui") - division,
            exitFrames: motion.frames.fast * 2,
          },
          "After the Han collapsed",
          "reunified",
        ),
        layer(
          "divided-date",
          "SectionTag",
          { text: "The division, about 560 CE" },
          "After the Han collapsed",
          "followed",
        ),
        stateLabel(
          "northern-zhou",
          "Northern Zhou",
          "region",
          [107.1, 35.6],
          "centuries of political",
        ),
        stateLabel(
          "northern-qi",
          "Northern Qi",
          "region",
          [115.2, 37],
          "centuries of political",
        ),
        stateLabel("chen", "Chen", "region", [115.6, 28], "political division"),
        stateLabel(
          "western-liang",
          "Western Liang",
          "city",
          [110.2, 31.04],
          "political division",
        ),
        layer("sui-map", "HistoricalLayer", SUI, "the Sui reunified"),
        label(
          "sui-name",
          "Sui",
          "region",
          [112.2, 33.3],
          "reunified the empire",
        ),
        layer(
          "reunification",
          "BigDate",
          {
            year: 589,
            fromYear: 560,
            era: "CE",
            caption: "Sui, as mapped in 592",
            placement: "lower-left",
          },
          "reunified the empire",
        ),
      ],
    ),
    shot(
      "incentives",
      "But productive plains",
      "bring regions together",
      fly(116.2, 34.5, 5.05),
      [
        layer(
          "plains",
          "RegionHighlight",
          {
            geojson: geo.lowlands,
            color: "regionA",
          },
          "productive plains",
        ),
        label(
          "plains-name",
          "Productive plains",
          "region",
          [115.2, 33.2],
          "productive plains",
        ),
        shownRiver(
          "yellow-waterway",
          "yellow",
          YELLOW_FROM,
          "connected waterways",
        ),
        shownRiver(
          "yangtze-waterway",
          "yangtze",
          YANGTZE_FROM,
          "connected waterways",
        ),
        layer(
          "canal-waterway",
          "RouteLine",
          {
            geojson: geo.yuan,
            credit: CANAL_CREDIT,
            drawFrames: motion.frames.slow * 2,
          },
          "connected waterways",
        ),
        layer(
          "incentive",
          "LowerThird",
          {
            title: "Reasons to unite",
            subtitle: "Incentive, not guarantee",
            placement: "auto",
            subject: WATERWAY_BOUNDS,
          },
          "reasons to bring",
        ),
      ],
      "crossfade",
    ),
    shot(
      "closing",
      "The landscape offered opportunities",
      alignment.duration,
      fly(107.5, 33, 4.75),
      [
        layer(
          "recap-plateau",
          "RegionHighlight",
          {
            geojson: geo.plateau,
            color: "regionB",
          },
          "The landscape offered",
        ),
        layer(
          "recap-lowlands",
          "RegionHighlight",
          {
            geojson: geo.lowlands,
            color: "regionA",
            exitAt:
              frameOf("into an empire") - frameOf("the landscape offered"),
          },
          "The landscape offered",
        ),
        shownRiver(
          "recap-yellow",
          "yellow",
          YELLOW_FROM,
          "The landscape offered",
        ),
        shownRiver(
          "recap-yangtze",
          "yangtze",
          YANGTZE_FROM,
          "The landscape offered",
        ),
        layer(
          "recap-canal",
          "RouteLine",
          {
            geojson: geo.yuan,
            credit: CANAL_CREDIT,
            drawFrames: motion.frames.slow * 2,
          },
          "canals administration",
        ),
        layer("recap-empire", "HistoricalLayer", SUI, "into an empire"),
        label(
          "empire-name",
          "An empire",
          "region",
          [112.2, 33.3],
          "into an empire",
        ),
      ],
      null,
    ),
  ],
};

// What each shot is about, as lon/lat bounds. The build checks the subject settles in the
// middle third of the frame (docs/visual-grammar.md).
const SUBJECTS = {
  opening: [105.5, 31.4, 122.7, 42.6], // the heartland mask's own bounds
  plateau: [86, 27, 111, 38],
  "eastern-lowlands": [112, 30, 122, 41],
  "yellow-river": [110, 33, 119, 38],
  yangtze: [110, 28, 122, 33],
  "grand-canal": [113, 30.2, 121.2, 40],
  "five-basins": [112, 28, 122, 40],
  "division-and-reunion": [105, 22, 122, 42],
  incentives: [112, 30, 122, 40],
  closing: [100, 22, 122, 42],
};
for (const item of story.shots) {
  if (!SUBJECTS[item.id]) throw new Error(`No subject for shot ${item.id}`);
  item.subject = SUBJECTS[item.id];
}

// Text stating a fact on screen, and the ids of facts.md behind it.
const CLAIMS = {
  "plateau-height": ["F01", "M01"],
  "sui-route": ["F04", "M02"],
  "canal-name": ["F04"],
  "yuan-route": ["F05", "M02"],
  basins: ["F05", "M03"],
  "divided-date": ["M04"],
  reunification: ["F06", "M04"],
  incentive: ["I01"],
};
for (const { layers } of story.shots)
  for (const item of layers) if (CLAIMS[item.id]) item.claims = CLAIMS[item.id];

// Readable shots, but one line per geometry: the same rivers repeat across shots.
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
  path.join(root, episode, "storyboard.json"),
  text.replace(/"@@(\d+)@@"/g, (_, i) => inline[Number(i)]) + "\n",
  "utf8",
);
console.log(
  JSON.stringify({
    words: alignment.words.length,
    duration: alignment.duration,
    shots: story.shots.length,
    crossings: crossings.map(([name, fraction]) => [
      name,
      Number(whenCanalReaches(fraction).toFixed(2)),
    ]),
  }),
);
