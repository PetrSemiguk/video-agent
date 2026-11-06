// Generates episodes/egypt-nile/storyboard.json: node episodes/egypt-nile/make-storyboard.cjs
// See shot-plan.md. Everything is on two plates: `egypt` (6950 px, sharp to zoom about 6.78) and
// `basin` (nile-basin). A crossfade between them needs a frame both cover: zoom near 5.5, lat near 24.
const kit = require("../../studio/scripts/storyboard-kit.cjs");

const { camera, fly, label, layer, shot } = kit;
const SLUG = "egypt-nile";
const AUDIO = `episodes/${SLUG}/audio`;
const voice = kit.narration(`${AUDIO}/words.json`);
const EGYPT = "egypt";
const BASIN = "basin";
const onEgypt = (name) => kit.readJson(`data/processed/egypt/${name}.geojson`);
const onBasin = (name) => kit.readJson(`data/processed/nile-basin/${name}.geojson`);

const OUTLINE_E = onEgypt("custom/egypt");
const OUTLINE_B = onBasin("custom/egypt");
const NILE_E = onEgypt("rivers/nile-aswan-sea");
const NILE_FULL_E = onEgypt("rivers/nile");
const DAMIETTA_E = onEgypt("rivers/damietta");
const NILE_B = onBasin("rivers/nile");
const DAMIETTA_B = onBasin("rivers/damietta");
const BLUE = onBasin("rivers/blue-nile");
const WHITE = onBasin("rivers/white-nile");
const ATBARA = onBasin("rivers/atbara");
const HIGHLANDS = onBasin("terrain/ethiopian-highlands");
const lakes = onEgypt("lakes");
const NASSER = {
  type: "FeatureCollection",
  features: lakes.features.filter((f) => f.properties.name_en === "Nasser"),
};

// Our own coordinate, checked against the north tip of Natural Earth's Lake Nasser (32.88, 23.99).
const DAM = [32.88, 23.97];
const ASWAN = [32.8989, 24.0875]; // Natural Earth populated places
const CAIRO = [31.248, 30.0519]; // Natural Earth populated places
const KHARTOUM = [32.5322, 15.59]; // Natural Earth populated places

/** The Aswan-to-sea line up to a latitude, for a camera that follows it but stays on the plate. */
const upToLat = (river, north) => {
  const { geometry, properties } = river.features[0];
  const kept = geometry.coordinates
    .map((point, i) => [point, properties.cumfrac[i]])
    .filter(([point]) => point[1] <= north);
  const span = kept[kept.length - 1][1] - kept[0][1];
  return {
    points: kept.map(([point]) => point),
    cumfrac: kept.map(([, f], i) =>
      i === kept.length - 1 ? 1 : Math.min(1, (f - kept[0][1]) / span),
    ),
  };
};
const follow = (north, zoom, drawFrames) =>
  camera("followLine", {
    line: upToLat(NILE_E, north),
    drawFrames,
    zoom,
    lead: 0.04,
    lag: 8,
    smooth: 24,
    blend: 40,
  });

const mask = (id, geojson, color, start, options = {}) =>
  layer(id, "RegionHighlight", { geojson, color, ...options }, start);
const keptMask = (id, geojson, color, options = {}) =>
  mask(id, geojson, color, undefined, { enterFrames: 1, ...options });
// Every line continues in the next shot's picture, so none of them dips at a shot change.
const river = (id, geojson, start, drawFrames, options = {}) =>
  layer(
    id,
    "RiverLine",
    { geojson, drawFrames, exitFrames: 0, ...options },
    start,
  );
const keptRiver = (id, geojson) => river(id, geojson, undefined, 1);
const glow = (id, geojson, start, drawFrames = 40) =>
  river(id, geojson, start, drawFrames, { glow: true });
const nileE = () => [
  keptRiver("nile", NILE_E),
  keptRiver("damietta", DAMIETTA_E),
];
const nileB = () => [
  keptRiver("nile", NILE_B),
  keptRiver("damietta", DAMIETTA_B),
];
const nileGlow = (start, drawFrames) => [
  glow("nile-lit", NILE_E, start, drawFrames),
  glow("damietta-lit", DAMIETTA_E, start, drawFrames),
];
const tag = (text, end) =>
  layer(
    `tag-${text.toLowerCase().replace(/\W+/g, "-")}`,
    "SectionTag",
    { text },
    undefined,
    end,
  );
const fact = (id, statement, emphasis, placement, start, end) =>
  layer(id, "KeyFact", { statement, emphasis, placement }, start, end);

const FLOOD_FRAMES = Math.round(
  (voice.timeOf("But follow") - voice.timeOf("That river once")) * 30,
);
const STRIP_FRAMES = Math.round(
  (voice.timeOf("NASA's figure") - voice.timeOf("By our reasoning")) * 30,
);
const READING_END = voice.between("than mud does", "So why does");
// The glow runs from the key word to the end of the shot, so the head keeps moving.
const READING_GLOW = Math.round((READING_END - voice.timeOf("water explains")) * 30);

const shots = [
  // The Strip
  shot(
    "open",
    EGYPT,
    0,
    "you see is desert",
    camera("establish", {
      target: { center: { lon: 30.0, lat: 26.2 }, zoom: 5.85 },
      push: 0.06,
      drift: [0.006, 0],
    }),
    [
      tag("The Strip", "million square"),
      mask("egypt-outline", OUTLINE_E, "neutral", "This is Egypt", {
        enterFrames: 60,
      }),
      label("egypt-name", "Egypt", "region", [28.4, 29.2], "This is Egypt"),
      label("desert-open", "Desert", "region", [27.5, 25.2], "you see is desert"),
    ],
  ),
  shot(
    "line",
    EGYPT,
    "Now look at this",
    "Delta at its end",
    fly(31.4, 27.6, 6.5),
    [
      keptMask("egypt-outline", OUTLINE_E, "neutral", {
        exitAt: 0,
        exitFrames: 30,
      }),
      river("nile-draw", NILE_E, "That is the Nile", 72, { glow: true }),
      river("damietta-draw", DAMIETTA_E, "Delta at its end", 20),
      label("nile-name", "Nile", "river", [32.1, 26.0], "That is the Nile"),
      label("delta-name", "Delta", "region", [29.5, 30.35], "Delta at its end"),
    ],
  ),
  shot("why", EGYPT, "Why here", "almost nowhere else", fly(30.6, 26.8, 6.1), [
    ...nileE(),
    ...nileGlow("Why here", 30),
    mask("egypt-outline-why", OUTLINE_E, "neutral", "almost nowhere else", {
      enterFrames: 24,
    }),
  ]),
  shot("cairo", EGYPT, "Most Egyptians", "south of Cairo", fly(31.4, 28.4, 6.5), [
    ...nileE(),
    label("delta-2", "Delta", "region", [29.5, 30.35], "live in the Delta"),
    label("valley", "Narrow valley", "region", [30.6, 26.9], "narrow valley", undefined, "left"),
    label("cairo-name", "Cairo", "city", CAIRO, "south of Cairo", undefined, "left"),
  ]),
  shot(
    "shares",
    EGYPT,
    "Together the valley",
    "of its people there",
    fly(30.4, 27.4, 6.5),
    [
      ...nileE(),
      ...nileGlow("Together the valley", 60),
      label("valley-2", "Valley", "region", [32.4, 27.6], "Together the valley", undefined, "right"),
      label("delta-3", "Delta", "region", [29.5, 30.35], "Together the valley"),
      fact("share-land", "About 4% of the land", "About 4%", "lower-left", "about four percent of Egypt's", "percent of Egypt's land"),
      fact("share-people", "About 4% of the land. About 97% of the people", "About 97%", "lower-left", "about ninety-seven percent of its"),
    ],
  ),
  shot(
    "differ",
    EGYPT,
    "Sources differ",
    "holds almost everyone",
    fly(29.2, 27.2, 6.3),
    [
      ...nileE(),
      label("valley-2b", "Valley", "region", [32.4, 27.6], undefined, undefined, "right"),
      label("delta-3b", "Delta", "region", [29.5, 30.35]),
      fact("share-differ", "About 4% of the land. About 97% of the people. Sources differ on the exact shares", "Sources differ", "lower-left", "Sources differ"),
    ],
  ),
  shot(
    "density",
    EGYPT,
    "In the nineteen nineties",
    "tiny fraction of that",
    fly(28.5, 26.6, 6.05),
    [
      ...nileE(),
      layer(
        "density-valley",
        "StatCounter",
        {
          value: 1500,
          unit: "people per km²",
          label: "Around this in the valley and Delta",
          date: "1990s",
          placement: "lower-left",
        },
        "around fifteen hundred",
      ),
      label("density-desert", "A tiny fraction of that", "region", [26.2, 29.0], "tiny fraction of that"),
    ],
  ),
  // The Water
  shot(
    "desert",
    EGYPT,
    "Move out over",
    "almost no rain falls here",
    fly(27.2, 26.6, 6.7),
    [
      tag("The Water", "reason starts to show"),
      ...nileE(),
      label("desert-name", "Desert", "region", [27.2, 27.4], "over the desert"),
      label("no-rain", "Almost no rain (FAO estimate)", "region", [27.2, 26.1], "almost no rain falls"),
    ],
  ),
  shot(
    "coast",
    EGYPT,
    "The north coast",
    "leans on one river",
    fly(29.4, 29.2, 6.62),
    [
      ...nileE(),
      label("north-coast", "North coast: the most rain", "region", [27.2, 30.5], "The north coast"),
      ...nileGlow("on one river", 36),
    ],
  ),
  shot("source", EGYPT, "The FAO calls", "water for Egypt", fly(31.9, 27.2, 6.25), [
    ...nileE(),
    label("main-source", "Nile: main source of water (FAO)", "region", [32.7, 27.3], "main source of water", undefined, "right"),
  ]),
  shot(
    "flood",
    EGYPT,
    "That river once",
    "fields beside it",
    follow(28.0, 6.0, FLOOD_FRAMES),
    [
      keptRiver("damietta", DAMIETTA_E),
      river("nile-redraw", NILE_E, "Its great flood", 118, { glow: true }),
      label("fertile-mud", "Fertile mud (before the dam)", "region", [32.95, 26.1], "spread fertile mud", undefined, "right"),
    ],
  ),
  shot(
    "south",
    EGYPT,
    "But follow the river",
    "beyond Egypt's border",
    fly(32.6, 21.6, 5.5),
    [
      ...nileE(),
      river("nile-upstream", NILE_FULL_E, "far beyond", 40),
      mask("egypt-border", OUTLINE_E, "neutral", "far beyond", {
        enterFrames: 24,
      }),
    ],
    "crossfade",
  ),
  shot(
    "highlands",
    BASIN,
    "Here are the highlands",
    "of Ethiopia",
    fly(34.6, 16.8, 5.25),
    [
      ...nileB(),
      keptMask("egypt-border", OUTLINE_B, "neutral"),
      mask("highlands-mask", HIGHLANDS, "regionB", "highlands of Ethiopia", {
        enterFrames: 24,
      }),
      label("highlands-name", "Ethiopian highlands (approximate)", "region", [38.4, 11.6], "highlands of Ethiopia"),
    ],
  ),
  shot(
    "share-86",
    BASIN,
    "By a common estimate",
    "which rivers are counted",
    fly(38.7, 17.3, 4.99),
    [
      ...nileB(),
      keptMask("egypt-border", OUTLINE_B, "neutral", { exitAt: 0, exitFrames: 30 }),
      keptMask("highlands-kept", HIGHLANDS, "regionB"),
      label("highlands-name-2", "Ethiopian highlands (approximate)", "region", [38.4, 10.0]),
      fact("share-86-card", "Around 86% of the flow starts here", "Around 86%", "upper-right", "around eighty-six percent"),
    ],
  ),
  shot(
    "rivers",
    BASIN,
    "The Blue Nile alone",
    "bring the rest",
    fly(34.5, 16, 5.42),
    [
      keptMask("highlands-kept", HIGHLANDS, "regionB"),
      keptRiver("nile", NILE_B),
      keptRiver("damietta", DAMIETTA_B),
      label("khartoum", "Khartoum", "city", KHARTOUM, "The Blue Nile alone", undefined, "left"),
      river("blue", BLUE, "The Blue Nile alone", 66, { glow: true }),
      label("blue-name", "Blue Nile", "river", [34.7, 12.4], "The Blue Nile alone", undefined, "right"),
      label("blue-half", "Blue Nile: more than half of the water", "river", [31.9, 13.7], "carries more than half", undefined, "left"),
      river("white", WHITE, "The White Nile", 36, { glow: true }),
      label("white-name", "White Nile", "river", [32.1, 11.4], "The White Nile", undefined, "left"),
      river("atbara", ATBARA, "the Atbara bring", 24, { glow: true }),
      label("atbara-name", "Atbara", "river", [35.2, 16.6], "the Atbara bring", undefined, "right"),
    ],
  ),
  shot(
    "another",
    BASIN,
    "So most of Egypt's",
    voice.between("river starts in another country", "Now come back"),
    fly(32.3, 23.8, 5.5),
    [
      keptRiver("blue-kept", BLUE),
      keptRiver("white-kept", WHITE),
      keptRiver("atbara-kept", ATBARA),
      keptMask("highlands-kept", HIGHLANDS, "regionB"),
      mask("egypt-arrival", OUTLINE_B, "neutral", "river starts in another", { enterFrames: 24 }),
      keptRiver("nile", NILE_B),
      river("nile-into-egypt", NILE_B, "Egypt's river starts", 72, { glow: true }),
      keptRiver("damietta", DAMIETTA_B),
    ],
    "crossfade",
  ),
  // The Dam
  shot(
    "aswan",
    EGYPT,
    "Now come back",
    "completed in nineteen seventy",
    fly(32.7, 24.2, 6.55),
    [
      tag("The Dam", "Work on the"),
      ...nileE(),
      label("aswan-name", "Aswan", "city", ASWAN, "back to Aswan", undefined, "left"),
      label("dam-name", "High Dam", "city", DAM, "the High Dam began", undefined, "right"),
      layer("date-1960", "BigDate", { year: 1960, fromYear: 1940, era: "CE", caption: "Work on the High Dam began", placement: "lower-left" }, "nineteen sixty", voice.timeOf("It was completed")),
      layer("date-1970", "BigDate", { year: 1970, fromYear: 1960, era: "CE", caption: "High Dam completed", placement: "lower-left" }, "completed in nineteen"),
    ],
  ),
  shot("lake", EGYPT, "Behind it lies", "floods to an end", fly(32.2, 23.0, 6.65), [
    ...nileE(),
    label("dam-2", "High Dam", "city", DAM, undefined, undefined, "right"),
    mask("lake-mask", NASSER, "regionA", "Lake Nasser", { enterFrames: 20 }),
    label("lake-name", "Lake Nasser", "region", [31.75, 22.55], "Lake Nasser", undefined, "left"),
    label("floods-ended", "Floods ended (one account)", "region", [33.5, 24.6], "devastating floods", undefined, "right"),
  ]),
  shot("sediment", EGYPT, "An older study", voice.between("to more fertilizer", "By our reasoning"), fly(32.6, 25.3, 6.38), [
    ...nileE(),
    keptMask("lake-kept", NASSER, "regionA"),
    label("dam-3", "High Dam", "city", DAM, undefined, undefined, "right"),
    label("sediment-kept", "Sediment retained (older study)", "region", [31.0, 22.8], "river's sediment", undefined, "left"),
    label("less-silt", "Less silt, more fertilizer (FAO)", "region", [33.0, 26.7], "less silt downstream", undefined, "right"),
  ]),
  shot("strip", EGYPT, "By our reasoning", "It did not", follow(29.2, 6.7, STRIP_FRAMES), [
    keptRiver("damietta", DAMIETTA_E),
    river("nile-strip", NILE_E, "By our reasoning", 130, { glow: true }),
    label("the-strip", "This strip", "region", [30.6, 27.6], "this strip should", undefined, "left"),
  ]),
  shot("nasa", EGYPT, "NASA's figure", "decades after the dam", fly(30.2, 27.6, 6.3), [
    ...nileE(),
    layer(
      "nasa-97",
      "StatCounter",
      {
        value: 97,
        unit: "% of the people",
        label: "Roughly this, in the valley and Delta",
        date: "NASA, published 2012",
        placement: "lower-left",
      },
      "roughly ninety-seven",
    ),
  ]),
  // On "water" the glow runs the whole length of the river for the rest of the shot, and the
  // label sits against the valley it is about, not out in the Eastern Desert.
  shot("reading", EGYPT, "Our reading", READING_END, fly(31.1, 29, 6.62), [
    ...nileE(),
    ...nileGlow("water explains", READING_GLOW),
    label("water-word", "Water (our reading)", "region", [30.76, 28.1], "water explains", undefined, "left"),
  ]),
  // The Answer
  shot("question", EGYPT, READING_END, "along the Nile", fly(30.6, 26.4, 5.95), [
    tag("The Answer", "along the Nile"),
    ...nileE(),
    mask("egypt-question", OUTLINE_E, "neutral", "all of Egypt", { enterFrames: 20 }),
    ...nileGlow("along the Nile", 30),
    label("nile-question", "Nile", "river", [32.1, 26.0], "along the Nile"),
  ]),
  shot("answer", EGYPT, "Our answer is", "reliable water", fly(31.2, 27.2, 6.05), [
    ...nileE(),
    label("valley-3", "Valley", "region", [32.4, 27.6], "valley and Delta are the", undefined, "right"),
    label("delta-4", "Delta", "region", [29.5, 30.35], "valley and Delta are the"),
    ...nileGlow("reliable water", 36),
  ]),
  shot(
    "rest",
    EGYPT,
    "The rest is mostly",
    "very little rain",
    fly(32, 23.6, 5.52),
    [...nileE(), label("desert-rest", "Desert", "region", [26.5, 26], "mostly desert")],
    "crossfade",
  ),
  // Wide: this is where The Answer places Egypt's water in the whole basin, one scale above
  // the rest of the section (the rule of a wide shot per section, docs/visual-grammar.md).
  shot("ethiopia", BASIN, "The river brings", "mostly from Ethiopia", fly(36, 17.4, 4.95), [
    ...nileB(),
    river("blue-back", BLUE, "far to the south", 40, { glow: true }),
    label("blue-back-name", "Blue Nile", "river", [35.2, 12.2], "far to the south", undefined, "left"),
    mask("highlands-back", HIGHLANDS, "regionB", "mostly from Ethiopia", {
      enterFrames: 20,
    }),
    label("highlands-back-name", "Ethiopian highlands (approximate)", "region", [38.4, 10.0], "mostly from Ethiopia"),
  ]),
  shot(
    "recap",
    BASIN,
    "By recent estimates",
    "ninety-seven percent of the people",
    fly(34.6, 24, 5.5),
    [
      ...nileB(),
      keptRiver("blue-kept", BLUE),
      keptMask("highlands-kept", HIGHLANDS, "regionB"),
      fact("recap-shares", "About 4% of land, about 97% of people", "about 97%", "upper-right", "about four percent of the land"),
    ],
    "crossfade",
  ),
  shot(
    "green",
    EGYPT,
    "Look at that",
    voice.duration,
    fly(30.0, 26.2, 5.85),
    [
      ...nileE(),
      ...nileGlow("green line once", 36),
      mask("egypt-close", OUTLINE_E, "neutral", "Egypt's map of people", {
        enterFrames: 30,
      }),
      river("nile-upstream-close", NILE_FULL_E, "mostly starts in another", 40),
      label("from-south", "From far to the south", "river", [33.2, 21.6], "mostly starts in another", undefined, "right"),
    ],
    null,
  ),
];

for (const id of ["south", "rest"])
  shots.find((item) => item.id === id).transition.durationInFrames = 14;

// Text stating a fact on screen, and the ids of facts.md behind it.
const CLAIMS = {
  "share-land": ["C01"],
  "share-people": ["C01", "C02"],
  "share-differ": ["C01", "C02", "C05"],
  "density-valley": ["C03"],
  "density-desert": ["C03"],
  "no-rain": ["C07"],
  "north-coast": ["C07"],
  "main-source": ["C08"],
  "fertile-mud": ["C11"],
  "share-86-card": ["C09"],
  "blue-half": ["C10"],
  "date-1960": ["C12"],
  "date-1970": ["C12"],
  "floods-ended": ["C12"],
  "sediment-kept": ["C13"],
  "less-silt": ["C13"],
  "nasa-97": ["C02"],
  "recap-shares": ["C01", "C02"],
  "from-south": ["C09"],
};
for (const { layers } of shots)
  for (const item of layers)
    if (CLAIMS[item.id]) item.claims = CLAIMS[item.id];

kit.writeStoryboard(`episodes/${SLUG}/storyboard.json`, {
  schemaVersion: 1,
  episode: {
    slug: SLUG,
    title: "Why almost all of Egypt lives along the Nile",
    language: "en",
    fps: 30,
  },
  plates: [
    { id: EGYPT, name: "egypt" },
    { id: BASIN, name: "nile-basin" },
  ],
  audio: { src: `${AUDIO}/voice.wav`, words: `${AUDIO}/words.json` },
  shots,
});
