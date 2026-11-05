// Generates episodes/pilot-agent/storyboard.json: node episodes/pilot-agent/make-storyboard.cjs
// A from-scratch storyboard of the pilot narration. See shot-plan.md.
const kit = require("../../studio/scripts/storyboard-kit.cjs");

const { camera, fly, focus, fractionAt, label, layer, reach, shot } = kit;
const AUDIO = "episodes/china-unity-pilot/audio";
const DATA = "data/processed/china-east-hs05";
const PLATE = "china";
const voice = kit.narration(`${AUDIO}/words.json`);
const f = (phrase) => voice.frameOf(phrase);
const data = (name) => kit.readJson(`${DATA}/${name}.geojson`);

const plateau = data("terrain/tibetan-plateau");
const lowlands = data("terrain/eastern-lowlands");
const north = data("terrain/north-china-lowlands");
const south = data("terrain/yangtze-lowlands");
const yellow = data("rivers/yellow");
const yangtze = data("rivers/yangtze");
const hai = data("rivers/hai");
const huai = data("rivers/huai");
const qiantang = data("rivers/qiantang");
const sui = data("routes/grand-canal-sui");
const yuan = data("routes/grand-canal-yuan");
const branch = (route, id) => ({
  ...route,
  features: route.features.filter((item) => item.properties.id === id),
});
const SUI_SOUTH = branch(sui, "south");
const SUI_NORTH = branch(sui, "north");
const nodeFraction = (route, name) =>
  route.features[0].properties.nodes.find((n) => n.name === name).fraction;

const SUI_CREDIT = "Canal routes: approximate, see description";
const YUAN_CREDIT = SUI_CREDIT;
const HIST_560 = kit.readJson(`${DATA}/historical/china-560.geojson`).attribution;
const HIST_592 = kit.readJson(
  `${DATA}/historical/china-592-cliopatria.geojson`,
).attribution;
const SUI_ID = "cliopatria-sui-dynasty-592";

// Crossfade length for a layer carried over a cut, and the lead of a label's window.
const FADE = 24;
const LEAD = 3;

const mask = (id, geojson, color, start, end, options = {}) =>
  layer(id, "RegionHighlight", { geojson, color, ...options }, start, end);
/** A mask already on screen at the cut: same look, no re-entrance. */
const kept = (id, geojson, color, options = {}) =>
  mask(id, geojson, color, undefined, undefined, { enterFrames: 1, ...options });
/** A mask leaving at the cut, fading out under the new shot. */
const leaving = (id, geojson, color, options = {}) =>
  kept(id, geojson, color, { exitAt: 0, exitFrames: FADE, ...options });
const river = (id, geojson, start, drawFrames, options = {}) =>
  layer(id, "RiverLine", { geojson, drawFrames, ...options }, start);
const keptRiver = (id, geojson, options = {}) => river(id, geojson, undefined, 1, options);
/** A label whose window starts on `start` and that fades out at `leave`, with its map. */
const leavingLabel = (id, text, kind, lonLat, start, leave, side) => {
  const item = label(id, text, kind, lonLat, start, undefined, side);
  item.props.exitAt = f(leave) - f(start) + LEAD;
  return item;
};
const route = (id, geojson, credit, start, drawFrames, options = {}) =>
  layer(id, "RouteLine", { geojson, credit, drawFrames, ...options }, start);

// Shot 4: the river's reach across the plain. Its draw, and the camera's progress over it.
const YELLOW_FROM = fractionAt(yellow, 113.0, 34.9);
const YELLOW_DRAW = 96;
// Shot 5: from Sichuan, inland, to the sea on "coast".
const YANGTZE_FROM = fractionAt(yangtze, 104.6, 28.8);

// Shot 7: both branches at one speed, south first, so that the head reaches Luoyang on "Canal".
const suiStart = voice.timeOf("From the seventh");
const suiEnd = voice.timeOf("transport system") + 0.9;
const suiLengths = sui.features.map((item) => item.properties.length_km);
const suiShare = suiLengths[0] / (suiLengths[0] + suiLengths[1]);
const suiFrames = Math.round((suiEnd - suiStart) * 30);
const suiSouthFrames = Math.round(suiFrames * suiShare);

// Shot 8: the canal draws in the words "by the thirteenth ... basins"; each river lights on arrival.
const yuanStart = voice.timeOf("By the thirteenth");
const yuanFrames = 101;
const reached = (name) =>
  yuanStart + (nodeFraction(yuan, name) * yuanFrames) / 30;
const RIVER_DRAW = 24;

const shots = [
  shot(
    "open",
    PLATE,
    0,
    "with the landscape",
    camera("establish", {
      target: { center: { lon: 109.9, lat: 32.5 }, zoom: 4.68 },
      push: 0.08,
      drift: [-0.012, 0],
    }),
    [
      layer(
        "title",
        "TitleCard",
        {
          title: "CHINA'S HEARTLAND",
          subtitle: "Why its geography pushes toward unity",
        },
        undefined,
        "Start with",
      ),
    ],
  ),
  shot("plateau", PLATE, "In the west", "four thousand meters", fly(100, 33, 5.32), [
    mask("plateau-mask", plateau, "neutral", "Tibetan Plateau", undefined, {
      dimOutside: true,
      enterFrames: 24,
    }),
    label("plateau-name", "Tibetan Plateau", "region", [91.5, 33.6], "Tibetan Plateau"),
    label("plateau-height", "above 4,000 m", "region", [91.5, 31.6], "four thousand"),
  ]),
  shot("lowlands", PLATE, "Farther east", "dense settlement", fly(109.5, 32.7, 4.76), [
    leaving("plateau-dim", plateau, "neutral", { dimOutside: true }),
    mask("plateau-lit", plateau, "neutral", undefined, undefined, {
      enterFrames: FADE,
    }),
    mask("lowland-mask", lowlands, "regionA", "into plains"),
    label("lowland-name", "Lowlands below 200 m", "region", [116.7, 33.5], "into plains"),
  ]),
  shot(
    "yellow",
    PLATE,
    "The Yellow River",
    "agricultural heartland",
    camera("followLine", {
      line: reach(yellow, YELLOW_FROM),
      drawFrames: YELLOW_DRAW + 12,
      zoom: 5.4,
      lead: 0.04,
      lag: 8,
      smooth: 24,
      blend: 40,
    }),
    [
      leaving("plateau-out", plateau, "neutral"),
      leaving("lowlands-out", lowlands, "regionA"),
      mask("plain-mask", north, "regionA", "North China Plain"),
      river("yellow-line", yellow, "The Yellow River", YELLOW_DRAW, {
        fromFraction: YELLOW_FROM,
        glow: true,
      }),
      label("yellow-name", "Yellow River", "river", [114.6, 35.1], "The Yellow River"),
      label("plain-name", "North China Plain", "region", [116.6, 34.2], "North China Plain"),
    ],
  ),
  shot(
    "yangtze",
    PLATE,
    "To the south",
    "major farming region",
    focus([104, 26.5, 122.2, 33.5], 5.36),
    [
      kept("plain-kept", north, "regionA"),
      keptRiver("yellow-kept", yellow),
      river("yangtze-line", yangtze, "the Yangtze links", 60, {
        fromFraction: YANGTZE_FROM,
        glow: true,
      }),
      label("yangtze-name", "Yangtze", "river", [108.5, 30.2], "the Yangtze links"),
      mask("yangtze-mask", south, "regionB", "middle and lower"),
      label(
        "yangtze-region",
        "Middle and lower Yangtze",
        "region",
        [115.2, 29],
        "middle and lower",
      ),
    ],
  ),
  shot("connect", PLATE, "These are different", "connect them", fly(110, 32.6, 4.8), [
    kept("plain-kept", north, "regionA"),
    kept("yangtze-kept", south, "regionB"),
    keptRiver("yellow-kept", yellow),
    keptRiver("yangtze-kept-line", yangtze),
    label("plain-again", "North China Plain", "region", [116.2, 33.7], "different landscapes"),
    label("yangtze-again", "Middle and lower Yangtze", "region", [115, 28.1], "different landscapes"),
    river("yellow-glow", yellow, "waterways offered", 30, { glow: true }),
    river("yangtze-glow", yangtze, "waterways offered", 30, { glow: true }),
  ]),
  shot(
    "sui",
    PLATE,
    "That connection",
    "transport system",
    focus([112, 30, 121, 40.5], 5.38),
    [
      leaving("plain-out", north, "regionA"),
      leaving("yangtze-out", south, "regionB"),
      keptRiver("yellow-kept", yellow),
      keptRiver("yangtze-kept", yangtze),
      route("sui-south", SUI_SOUTH, SUI_CREDIT, "From the seventh", suiSouthFrames, {
        label: { text: "Sui canals, 7th century", lonLat: [108.6, 32.4] },
        nodeAnchors: { Luoyang: "left" },
      }),
      route(
        "sui-north",
        SUI_NORTH,
        SUI_CREDIT,
        suiStart + suiSouthFrames / 30,
        suiFrames - suiSouthFrames,
        { style: "dashed" },
      ),
    ],
  ),
  shot(
    "yuan",
    PLATE,
    "Successive dynasties",
    "population and troops",
    fly(117.6, 34.7, 5.2),
    [
      keptRiver("yellow-kept", yellow),
      keptRiver("yangtze-kept", yangtze),
      layer(
        "sui-south-kept",
        "RouteLine",
        {
          geojson: SUI_SOUTH,
          credit: SUI_CREDIT,
          drawFrames: 1,
          nodeAnchors: { Luoyang: "left" },
        },
        undefined,
        "thirteenth century",
      ),
      layer(
        "sui-north-kept",
        "RouteLine",
        { geojson: SUI_NORTH, credit: SUI_CREDIT, drawFrames: 1, style: "dashed" },
        undefined,
        "thirteenth century",
      ),
      river("qiantang-line", qiantang, reached("Hangzhou"), RIVER_DRAW, { glow: true }),
      river("yangtze-lit", yangtze, reached("Zhenjiang"), RIVER_DRAW, { glow: true }),
      river("huai-line", huai, reached("Huai'an"), RIVER_DRAW, { glow: true }),
      river("yellow-lit", yellow, reached("Dongping"), RIVER_DRAW, { glow: true }),
      river("hai-line", hai, reached("Tianjin"), RIVER_DRAW, { glow: true }),
      route("yuan-line", yuan, YUAN_CREDIT, "By the thirteenth", yuanFrames, {
        label: { text: "Yuan canal, 13th century", lonLat: [111.2, 33.95] },
        nodeAnchors: { Beijing: "left" },
      }),
      label("qiantang-name", "Qiantang", "river", [118.7, 29.9], reached("Hangzhou"), undefined, "bottom"),
      label("yangtze-name", "Yangtze", "river", [116.8, 30.7], reached("Zhenjiang"), undefined, "bottom"),
      label("huai-name", "Huai", "river", [116.2, 32.6], reached("Huai'an"), undefined, "bottom"),
      label("yellow-name", "Yellow", "river", [113.4, 35], reached("Dongping")),
      label("hai-name", "Hai", "river", [113.2, 39.9], reached("Tianjin")),
      layer(
        "five-systems",
        "StatCounter",
        {
          value: 5,
          unit: "river systems",
          label: "linked by the Grand Canal",
          date: "by the 13th century",
          placement: "lower-right",
        },
        "five major",
      ),
    ],
  ),
  shot(
    "division",
    PLATE,
    "Geography did not",
    "five eighty-nine",
    fly(107.5, 33.3, 4.74),
    [
      layer(
        "states-560",
        "HistoricalLayer",
        {
          slug: "china-560",
          credit: HIST_560,
          enterFrames: 24,
          exitAt: f("the Sui reunified") - f("After the Han"),
          exitFrames: 18,
        },
        "After the Han",
      ),
      leavingLabel("zhou", "Northern Zhou", "region", [106.6, 35], "After the Han", "the Sui reunified"),
      leavingLabel("qi", "Northern Qi", "region", [115.2, 37], "After the Han", "the Sui reunified"),
      leavingLabel("chen", "Chen", "region", [115.6, 27.2], "After the Han", "the Sui reunified"),
      leavingLabel("liang", "Western Liang", "region", [110.6, 31.1], "After the Han", "the Sui reunified"),
      layer(
        "date-560",
        "BigDate",
        {
          year: 560,
          era: "CE",
          caption: "Map of one moment",
          placement: "lower-right",
        },
        "After the Han",
        "political division followed",
      ),
      layer(
        "sui-state",
        "HistoricalLayer",
        {
          slug: "china-592-cliopatria",
          credit: HIST_592,
          only: [SUI_ID],
          color: "regionA",
          enterFrames: 18,
        },
        "the Sui reunified",
      ),
      label("sui-name", "Sui", "region", [111.5, 33.3], "the Sui reunified"),
      layer(
        "date-589",
        "BigDate",
        {
          year: 589,
          fromYear: 560,
          era: "CE",
          caption: "Borders as of 592",
          placement: "lower-right",
        },
        "the Sui reunified",
      ),
    ],
  ),
  shot(
    "reasons",
    PLATE,
    "But productive",
    "regions together",
    fly(115, 33.1, 4.93),
    [
      mask("plains-lit", lowlands, "regionA", "productive plains"),
      river("yellow-back", yellow, "connected waterways", 30, { glow: true }),
      river("yangtze-back", yangtze, "connected waterways", 30, { glow: true }),
      route("canal-back-south", SUI_SOUTH, SUI_CREDIT, "connected waterways", 30, {
        color: "neutral",
        nodeAnchors: { Luoyang: "left" },
      }),
      route("canal-back-north", SUI_NORTH, SUI_CREDIT, "connected waterways", 30, {
        color: "neutral",
        style: "dashed",
      }),
    ],
  ),
  shot(
    "close",
    PLATE,
    "The landscape offered",
    voice.duration,
    fly(109.6, 32.5, 4.78),
    [
      layer(
        "sui-close",
        "HistoricalLayer",
        {
          slug: "china-592-cliopatria",
          credit: HIST_592,
          only: [SUI_ID],
          color: "regionA",
          enterFrames: 20,
        },
        "into an empire",
      ),
      mask("plateau-back", plateau, "neutral", "The landscape offered", undefined, {
        enterFrames: 24,
        exitAt: f("into an empire") - f("The landscape offered"),
        exitFrames: 20,
      }),
      kept("plains-kept", lowlands, "regionA", {
        exitAt: f("into an empire") - f("The landscape offered"),
        exitFrames: 20,
      }),
      keptRiver("yellow-kept", yellow),
      keptRiver("yangtze-kept", yangtze),
      layer("canal-kept-south", "RouteLine", {
        geojson: SUI_SOUTH,
        credit: SUI_CREDIT,
        drawFrames: 1,
        color: "neutral",
        nodeAnchors: { Luoyang: "left" },
      }),
      layer("canal-kept-north", "RouteLine", {
        geojson: SUI_NORTH,
        credit: SUI_CREDIT,
        drawFrames: 1,
        color: "neutral",
        style: "dashed",
      }),
      route("canal-lit-south", SUI_SOUTH, SUI_CREDIT, "canals", 40, {
        nodeAnchors: { Luoyang: "left" },
      }),
      route("canal-lit-north", SUI_NORTH, SUI_CREDIT, "administration", 24, {
        style: "dashed",
      }),
      label("sui-end", "Sui", "region", [111.5, 33.3], "into an empire"),
    ],
    null,
  ),
];

// Text stating a fact on screen, and the ids of the pilot's facts.md behind it.
const CLAIMS = {
  "plateau-height": ["F01", "M01"],
  "lowland-name": ["M01"],
  "sui-south": ["F04", "M02"],
  "yuan-line": ["F05", "M02"],
  "five-systems": ["F05", "M03"],
  "date-560": ["M04"],
  "date-589": ["F06", "M04"],
};
const withClaims = (story) => {
  for (const { layers } of story.shots)
    for (const item of layers)
      if (CLAIMS[item.id]) item.claims = CLAIMS[item.id];
  return story;
};

kit.writeStoryboard("episodes/pilot-agent/storyboard.json", withClaims({
  schemaVersion: 1,
  episode: {
    slug: "pilot-agent",
    title: "Why China's geography pushes it toward unity",
    language: "en",
    fps: 30,
  },
  plates: [{ id: PLATE, name: "china-east-hs05" }],
  audio: { src: `${AUDIO}/voice.wav`, words: `${AUDIO}/words.json` },
  shots,
}));
