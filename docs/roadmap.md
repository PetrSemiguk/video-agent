# video-agent — Roadmap (steps 1.6 → 6.4)

This file is the work plan for any coding agent. Each step is a self-contained
task with scope, decisions already made, deliverables and acceptance criteria.

Read `AGENTS.md` first. It overrides nothing here; this file never overrides `AGENTS.md`.

---

## 0. Protocol for every step

**Before the step**
1. Read `AGENTS.md`, this step, and the previous step's report in `docs/reports/`.
2. Run `git status`. If the tree is not clean, stop and tell the user.
3. Do the research parts first (read-only), then build.

**During the step**
- Stay inside the step's scope. Do not start the next step.
- Licenses: any new data/media/font/model source gets a row in `docs/licenses.md`
  BEFORE it is used. FORBIDDEN and REFERENCE ONLY sources never appear in a render.
- Styles: every color, font, size, spacing, duration and easing comes from design tokens.
- Heavy jobs (TTS, whisper, Remotion renders) never run concurrently.
- Python: only `uv run …` from `pipeline/`; keep `numpy<2` and `torch==2.6.0+cu126`.
- Node: npm/npx only. Map renders: `--gl=angle`.

**Stop and ask the user when**
- a step item is marked **USER DECISION**;
- a license is unclear or contradicts itself;
- an acceptance criterion still fails after 2 honest attempts;
- the step would require touching something outside its scope.

**After the step**
1. Run all tests: `uv run pytest` (pipeline/), `npm test` and `npm run lint` (studio/).
2. Write `docs/reports/<step>.md` (English): what was built, decisions and deviations
   (with reasons), verification results with numbers, artifact paths, open questions.
3. Show `git status` and propose a Conventional Commit message. Only Claude Code on an
   `auto/*` branch commits, during `/run-roadmap`: see `docs/automation.md`.

**Artifacts**: renders go to `studio/out/` (ignored). The report lists every artifact
the user must look at or listen to, with exact paths.

---

## Decisions already made (do not reopen)

- Map engine: **B** = static 4K plate + CSS camera (`PlateStage`). MapLibre 3D (A) is
  reserved for a future "establishing flyover" shot type; not in this roadmap.
- Basemap: NASA Blue Marble NG (Aug 2004) + AWS Terrain hillshade. **Mapbox is
  FORBIDDEN** (video use not licensed). Sentinel-2 cloudless (EOX) is ON HOLD.
- Vectors: Natural Earth v5.1.2. NE `geography_regions` polygons are schematic:
  labels only, never filled/outlined as shapes.
- Disputed borders: NE default (de facto) unless an episode decides otherwise.
- Font for now: Inter (local woff2, OFL). Headline font chosen in 2.1.
- Language of videos: English. Voice: Chatterbox TTS. Alignment: faster-whisper.
- Git: the user merges and pushes; commits only as `AGENTS.md` allows.

---

## Step 1.6 — Historical borders

**Goal**: reliable, license-clean historical polity layers aligned with the plates.

Known so far (verify, then record in `docs/licenses.md`):
- `aourednik/historical-basemaps`: **GPL-3.0** → REFERENCE ONLY (never rendered).
- OpenHistoricalMap: CC0 by default; individual features may carry `license=*`
  (CC BY / CC BY-SA). Use CC0 / untagged only; report skipped features.
- CShapes 2.0 (ETH Zürich ICR, 1886–2019): license to be verified.

Build:
1. Source table: exact license, commercial video use allowed?, attribution text,
   time/space coverage, format, download method, accuracy issues. Add 1–2 more open
   sources if found.
2. Unified format `data/processed/<plate>/historical/<slug>.geojson`, per feature:
   `id, name_en, valid_from, valid_to (ISO; BCE as negative years), source
   (cshapes|ohm|custom), source_ref, license, confidence (high|medium|low),
   approximate (bool), notes`. Validator in pytest (required fields, no
   REFERENCE ONLY/FORBIDDEN sources). Document in `docs/maps.md` → "Historical layers".
3. `vap.geo.hist`:
   - `probe --plate <p> --date <YYYY-MM-DD>` — what each allowed source has in the bbox;
   - `extract --plate <p> --date <…> --source cshapes|ohm [--names …]` — clip to NE
     land 10m (coasts must match the plate), coverage_simplify like `extract`;
   - custom contours: `historical/custom/<slug>.geojson` + mandatory
     `<slug>.sources.md`; snap borders to NE rivers/coasts closer than N km.
4. Test cases: (a) europe 1914-07-01; (b) europe 1815; (c) china-east 1644
   (Ming / Shun / Later Jin–Qing). Never invent a contour: if no reliable source,
   report the gap instead of drawing.
5. `HistDebug` still on `PlateStage`: polygons from a new muted multi-polity palette
   in tokens (8–10 colors), borders, point-on-surface labels, big date, attributions.
   Renders: `out/hist-europe-1914.png`, `out/hist-europe-1815.png`, `out/hist-china-1644.png`.

Accept when: source table + licenses.md rows exist; probe output for 3 dates;
validator passes; coasts of historical layers match the plate; river borders (e.g.
Danube/Dniester 1914) follow the river on the image; gaps are listed honestly.

---

## Step 1.7 — Historical maps v2

**Goal**: usable historical maps for any episode, and a clear rule for where each comes from.

1. OHM with CC BY 4.0 ways and relations (no NC, SA, ND). Attribution assembled from the objects a
   layer really uses: a short on-screen line, and a full list in `<slug>.attribution.md` that
   `vap.episode build` copies into `episodes/<slug>/attributions.md`. Rows in `docs/licenses.md`.
2. Errata: `<layer>.errata.json` beside each layer. Storyboard validation and `vap.episode build`
   fail on a shot using a layer with a blocker, unless the storyboard overrides it with a reason.
3. Cliopatria (CC BY 4.0) in the common format, `source=cliopatria`, clipped to NE land, with the
   same overlap report. Probe, extract and check facts for China 560, 590, 1644 and Europe 1914, 1815.
4. `vap.geo.hist compose --plate <p> --spec <file.yaml>`: a layer from NE units, features of other
   layers and custom polygons, with sources and confidence per state. Overlaps are compile errors.
   Example `specs/china-560.yaml`. Guide in `docs/maps.md`, "Composing historical maps".

Renders: `out/hist-china-560-cliopatria.png`, `out/hist-china-590-cliopatria.png`,
`out/hist-china-1644-cliopatria.png`, `out/hist-europe-1914-compare.png`,
`out/hist-china-560-composed.png`.

Accept when: a table by date compares OHM, Cliopatria and composed maps on coverage and facts, with a
recommendation; the rule is in `docs/historical-sources.md`; a test shows a storyboard with a blocked
layer does not pass; renders and tests exist.

---

## Stage 2 — Design system

### Step 2.1 — Design tokens v1 + plate grade v2

**Goal**: the channel's recognizable look, fixed in one place.

Plate grade changes (from review of `plate-*.png`):
- land midtones +10–15% brighter (south China and eastern Europe currently collapse
  into one olive mass); **sea stays dark** to keep the land/sea contrast;
- soft highlight rolloff for deserts and snow (Taklamakan is the brightest thing in
  frame and steals attention);
- default `--hillshade 0.65`;
- attribution overlay: smaller and lighter, styled like the rest of the UI.

Map component changes (from review of `demo-china-rivers.mp4`):
- `RegionHighlight` fill more transparent so terrain reads through;
- `dimOutside` lighter (sea must not go near-black).

Tokens v1 (`studio/src/design/tokens.ts`, keep it the single source):
- color: base neutrals, semantic (regionA amber, regionB blue, conflict red, neutral),
  multi-polity palette from 1.6, river, border, text, halo, UI surfaces;
- typography: **USER DECISION** — propose 3 pairings of an OFL headline font
  (condensed/bold, for caps labels and big dates) + body font (Inter or other OFL).
  Fonts are stored locally like Inter; each gets a licenses.md row;
- type scale with a hard rule: no on-screen text smaller than 26 px at 1080p;
- spacing grid, safe areas (5% title-safe; keep bottom 12% free of key info because
  of the YouTube progress bar/captions), radii, halos/shadows;
- motion: durations (frames at 30 fps), easing curves, stagger.

Deliverables:
- `out/style-sheet.png`: swatches, type scale, the 3 font pairings with sample labels
  ("THE HEARTLAND", "1644", "Yellow River", "Beijing");
- `out/grade-compare-china.png`, `out/grade-compare-europe.png`: grade v1 vs v2 side by side;
- re-render `out/demo-china-rivers.mp4` with v1 tokens;
- `out/mobile-check.png`: a demo frame downscaled to 640×360 — labels must stay legible.

Stop after the style sheet for the font decision, then finalize tokens with the chosen pair.
Accept when: all components use tokens only (grep for hex colors/px outside tokens
returns nothing except tokens and debug files); deliverables exist; user picked the font.

### Step 2.2 — Text layers

Components (`studio/src/components/text/`), each with a zod props schema, enter and
exit animations from motion tokens, and max-length constraints:
- `LowerThird` — colored bar on the left (semantic color), title + optional subtitle;
- `SectionTag` — small caps label, e.g. "PART 2 · THE RIVERS";
- `BigDate` — large year with a roll/count-up animation, optional era (BCE/CE) and caption;
- `KeyFact` — one short statement with an emphasized number or word.

Deliverables: `out/text-layers-sheet.png` (every component at its longest allowed text),
`out/text-layers.mp4` (~15 s, each component enters and exits over a map).
Accept when: no overflow at max lengths; zod rejects too-long props; tokens only.

### Step 2.3 — Infographics

Components (`studio/src/components/info/`), zod schemas, tokens only:
- `BarCompare` — 2–5 bars, values + units, animated growth, semantic colors;
- `TimelineBar` — span of years, event markers, animated playhead, BCE support;
- `NumberedList` — 3–5 items revealed one by one;
- `RecapCards` — 2–4 summary cards for the end of a section;
- `StatCounter` — one big number counting up with a label.

Deliverables: `out/info-sheet.png` (max-length content), `out/info.mp4` (~20 s).
Accept when: long labels and extreme values (0, very large, negative where allowed)
render without overlap; axis/number formatting is locale-stable (en-US).

### Step 2.4 — Title, end card, B-roll, transitions, catalog

- `TitleCard` (episode title over a map), `EndCard` (layout leaves room for YouTube
  end-screen elements during the last 20 s — research the current element zones);
- `BRollClip` — local video file, slow push-in, color grade matched to the plates,
  small attribution chip; only sources allowed by licenses.md (Pexels/Pixabay rows);
- transitions via `@remotion/transitions`: crossfade, dip-to-dark, map-to-graphic wipe;
- `docs/components.md` — catalog of every component: purpose, props, limits, when to
  use. This file is the main input for the future storyboard agent — keep it exact.

Deliverables: `out/showreel.mp4` (~60 s, all components), catalog doc.
Accept when: the catalog matches the zod schemas (add a test that lists every
registered component and fails if one is missing from `docs/components.md`).

---

## Stage 3 — Voice and timing

### Step 3.1 — Chatterbox TTS: text → WAV

1. Research first: latest `chatterbox-tts` version and pins (torch, numpy,
   transformers…), licenses of code and weights (HF `ResembleAI/chatterbox`), the
   built-in Perth watermark (what it is, does it matter for publishing). Confirm
   compatibility with rasterio/shapely/numpy<2 and that torch stays 2.6.0+cu126 from
   the PyTorch index. Conflict → stop and list options.
2. Install via uv only. licenses.md row.
3. `pipeline/src/vap/voice/`:
   - `normalize.py` — years read as years ("1644" → "sixteen forty-four", "1900s"),
     numbers with separators and units ("3,000 km" → "three thousand kilometers"),
     BCE/CE/BC/AD, centuries, abbreviations (e.g., U.S., St.). ≥15 pytest cases;
   - `chunk.py` — paragraphs → sentences → chunks with a max length (justify default);
   - `tts.py` CLI: `uv run python -m vap.voice.tts --script <md|txt> --out <dir>
     [--voice <ref.wav>] [--exaggeration 0.5] [--cfg 0.5] [--seed 42]`:
     model loaded once, GPU; per-chunk cache keyed by hash(normalized text + params +
     voice + model version); join with sentence/paragraph pauses and short fades;
     outputs `voice.wav` + `voice.manifest.json` (per chunk: original and normalized
     text, paragraph, start/end samples and seconds, seed, params); free VRAM at exit.
   - Voice cloning (`--voice`) only from recordings we have rights to (own voice or
     licensed). Never clone a real person without consent — rule in `docs/voice.md`.
4. Test script `episodes/_sandbox/tts-test/script.md`:

   > Look at a map of China, and one thing stands out. In the west, the Tibetan Plateau
   > rises nearly five kilometers into the sky. In the north, the Gobi Desert stretches
   > for a thousand miles.
   >
   > And in between, two great rivers carve their way east, toward the sea. For more than
   > 2,000 years, this landscape has pushed its people together. But in 1644, a small army
   > from beyond the Great Wall would test that unity like never before.

   Three variants, same seed: exaggeration 0.3 / 0.5 / 0.7 →
   `audio/voice-ex03.wav`, `-ex05.wav`, `-ex07.wav`. A repeat run must hit the cache.
5. `docs/voice.md`: pipeline, parameters, cache, voice-rights rule.

Report: versions, RTF and peak VRAM per variant, cache re-run time, normalized text.
**USER DECISION**: which variant (listen to all three) — record the choice as defaults.

### Step 3.2 — Voice post-processing and pronunciation

- Trim leading/trailing silence of each chunk before joining; consistent pauses:
  sentence, paragraph, section; explicit markup in scripts: `[pause 1.0]`.
- Pronunciation lexicon `pipeline/src/vap/voice/lexicon.yaml` (respellings for names:
  Qing, Xi'an, Chongqing, Wrocław…), applied in normalize; tests.
- Loudness: voice stem normalized with ffmpeg loudnorm (two-pass) to −16 LUFS
  integrated, true peak ≤ −1.5 dBTP (final mix target −14 LUFS comes in stage 6).
- De-click check at joins (no discontinuities).
- Report measured LUFS/true peak before and after; `out` listening file of the test script.

### Step 3.3 — faster-whisper alignment

- Install faster-whisper; verify GPU on Windows (DLL search: import torch first; if
  needed nvidia-cublas-cu12 + `os.add_dll_directory`) — this risk is noted in
  `docs/python-env.md`; record what actually worked.
- `vap.align.words`: transcribe `voice.wav` with word timestamps (choose model by
  accuracy/VRAM, justify), then align recognized words to the **original script
  words** (via normalized forms, sequence alignment). Output `words.json`: every
  script word with start/end, plus sentence and paragraph spans.
- TTS error detection: script words missing in audio (skips) and extra words
  (hallucinations) → list affected chunk ids; option `--fix` regenerates those chunks
  with a new seed (max 3 tries) and re-aligns. Never keep TTS and whisper in VRAM together.
- Accuracy check: for 10 random words, compare timestamps with the waveform
  (onset detection) — report median/max error in ms.

---

## Stage 4 — Storyboard and assembly

### Step 4.1 — Storyboard schema

- zod schema in `studio/src/storyboard/schema.ts` + exported JSON Schema for Python.
- Structure: `schemaVersion`, episode meta, plates, audio + words refs, `shots[]`:
  `id`, start/end anchors (`{word: index}`, `{phrase: "two great rivers"}`, or
  `{time: s}`), camera preset + params, `layers[]` (discriminated union by component
  `type` with that component's props schema), transition to next shot.
- Unknown component type or bad props → validation error with a clear path.
- CLI validator (`uv run python -m vap.storyboard.validate <file>` or npm script).
- Example `episodes/_sandbox/tts-test/storyboard.json` for the test script.
- Document in `docs/storyboard.md` (input for the future storyboard agent).

### Step 4.2 — Assembler

- Remotion composition `Episode` reading storyboard + words + audio through props;
  duration from audio via `calculateMetadata`.
- Shot → `PlateStage` (+ `PlateSequence` when plates change) + layers as Sequences;
  voice track attached.
- Render the sandbox episode to MP4.

### Step 4.3 — Voice sync

- Anchor resolution phrase → word times; configurable lead (labels appear ~3 frames
  before the word); shot cuts snap to the nearest pause; checks: no shot shorter than
  a token minimum, no overlaps, gaps are filled with `drift`.
- Preview sheet `out/<slug>-preview.png`: first frame of every shot with its text line.

### Step 4.4 — Pilot (60–90 s)

- Draft a ~180-word pilot script on "why China's geography pushes it toward unity",
  well-established facts only, with `facts.md` (claim → source URL).
  **USER DECISION**: the user approves the text before any TTS.
- Full chain by hand: TTS → post → align → storyboard (written by the agent using
  `docs/components.md`) → render.
- Review list in the report: sync of labels to words, camera smoothness
  (`vap.qa.motion`), legibility on mobile, attribution present on every map shot.

### Step 4.5 — One command

- `uv run python -m vap.episode build <slug> --stage voice|align|preview|render|all`:
  idempotent, cached, logs per stage, fails loudly with the stage name.
- Preview sheet + `README` section "Make an episode".

### Step 4.6 — Visual grammar and pilot polish

**Diagnosis (pilot v1 review sheet + motion measurement):** the map barely takes part in
the story. In 8 of 10 shots the frame is the same wide view of East China with no map
action; meaning is carried by lower-left cards. The narration says "plateau", "plains",
"canal", "five river systems", "division" — nothing happens on the map. A card covers the
Yangtze; cards are wide and empty; the StatCounter "5 / 13th century / Major river basins
linked" reads as nonsense; TitleCard is small. Camera speed by 5 s windows: 0–15 s
0.5–1.1 px/frame, 30–45 s 0.1–0.15, **45–55 s 0.007–0.014 (a 10-second freeze)**.

#### 1. `docs/visual-grammar.md` (main deliverable — rules for the future storyboard agent)
- The map is the protagonist: every shot has ≥1 map action (highlight, draw, on-map label,
  camera move to the subject) synced to the key word of the narration.
- Camera moves in every shot; framing follows the subject (`focusOn`); two adjacent shots
  never share the same framing. `hold` only explicitly, with a reason in the storyboard.
- Text: on-map `PlaceLabel` beats a card; `LowerThird` only for concepts that cannot be
  pointed at; max one text card at a time; text never covers the shot's subject or the
  bottom 12%.
- Pattern table "narration says → map does": relief/plateau/mountains → elevation-mask
  reveal; plains/lowlands → lowland mask; river flows/crosses → `RiverLine` + `followLine`;
  route/canal/campaign/trade path → `RouteLine` with era label; "linked/united X" → items
  light up in order + the connection draws; division → unification → historical layers
  (source rule in `docs/historical-sources.md`); number/date → `BigDate`/`StatCounter`
  over a map that shows what the number is about; recap → callbacks to elements already shown.
- Anti-patterns with examples from pilot v1 (shots 2, 3, 6, 7, 9, 10) and the 45–55 s freeze.

#### 2. Data and components
- Terrain masks: `vap.geo.terrainregion --plate <p> --name <slug> (--min-elev M | --max-elev M)
  [--seed lon,lat] [--smooth km]` → connected region from terrarium tiles, smoothed, clipped
  to NE land; properties: method, threshold, `approximate: true`. Pilot: `tibetan-plateau`
  (threshold ~3500–4000 m, tuned so the contour matches the visible plateau edge) and
  `eastern-lowlands` (≤ ~200 m).
- `RouteLine` (studio/src/components/map/): progressive draw, dashed/solid from tokens,
  optional direction arrows and node labels — the generic component for canals,
  campaigns, trade routes.
- Grand Canal: two custom routes with `<slug>.sources.md` and `approximate: true` — the Sui
  system (7th c., Y-shaped, hub near Luoyang: Hangzhou → Yangzhou → Luoyang, plus the
  northern branch towards the Beijing area) and the straightened Yuan route (13th c.,
  Hangzhou → Beijing via Shandong). Nodes from well-known sources (list them); snap to NE
  rivers where the route follows a river. Unconfirmed segments → simplify to nodes and say so.
- The five river systems the canal linked (Hai, Yellow, Huai, Yangtze, Qiantang): check the
  HydroSHEDS/HydroBASINS license for commercial video first; clean → basin polygons; not
  clean → light up the rivers themselves (`RiverLine`) in order. Record in licenses.md.
- `LowerThird`: width from content (min/max tokens); auto-placement — receives the shot
  subject's screen bbox (via `toScreen`) and picks a corner that does not cover it,
  respecting the bottom 12%. Overlap test.
- `StatCounter` layout: number + unit + one line of meaning ("5 river systems linked");
  the date on its own line or in a `SectionTag`.
- `TitleCard` v2: larger, cinematic (title on the map, slow push-in), tokens only.
- Motion as a build rule: `vap.episode build` (preview stage) runs `vap.qa.motion` and
  fails with a clear message on any window > 2 s below the speed threshold (`drift` passes,
  `hold` does not unless explicit with a reason). Add the rule to visual-grammar.md.

#### 3. Re-storyboard the pilot
Voice and timings unchanged. Rewrite the storyboard by visual-grammar.md: each shot gets a
subject on the map, framing and an action. Shot 8 (division → 589): use the composed
`china-560` layer (Cliopatria frame 561 based) for Northern Zhou / Northern Qi / Chen /
Western Liang, then Cliopatria frame 592 for Sui; respect errata (no blocker layers).
Render `out/episode-china-unity-pilot-v2.mp4`, a new review sheet (same format) and the
640-px mobile check. Report: table "shot → map action → framing", v1/v2 comparison,
`vap.qa.motion` plots for v1 and v2.

**Accept when:** visual-grammar.md has the pattern table and anti-patterns; every one of the
10 shots in v2 has a map action (list them); LowerThird overlaps no shot subject (test);
motion QA passes on v2 (no window > 2 s without motion except explicit holds); new sources
in licenses.md; canal routes have sources.md; all tests green.

---

## Stage 5 — Agent layer for episode production (Claude Code)

Goal: one topic in → an approved script and a previewed episode out, with the user touching
only two checkpoints: script approval and preview approval.

### Step 5.1 — Episode knowledge pack
- `.claude/skills/geo-episode/SKILL.md`: how an episode is made here — file layout,
  pipeline commands, the order of stages, where the rules live (visual-grammar.md,
  components.md, storyboard.md, historical-sources.md, maps.md, licenses.md, voice.md),
  what is forbidden. Short; links instead of copies.
- `docs/episode-format.md`: the channel's episode structure — cold open hook (≤30 s) with
  the central question; geography setup; 3–5 acts, each with one map-driven idea; a twist or
  counter-argument; recap; outro. Target 12–14 min ≈ 1900–2200 words at ~160 wpm. Spoken
  English, short sentences, every paragraph has a mappable subject ("map-first writing").
  Markup: `[pause s]`, `## Section` headers that become SectionTags and YouTube chapters.
- Accept when: a fresh subagent given only the skill answers 10 questions about making an
  episode correctly (write the questions and expected answers into the report).

### Step 5.2 — Researcher, scriptwriter, fact-checker
- `.claude/agents/researcher.md`: topic → `episodes/<slug>/research.md` — claims with URLs,
  source tier (peer-reviewed / reference work / reputable press / other), contested points
  with both sides. Key claims need ≥2 independent sources; Wikipedia alone is not enough.
- `.claude/agents/scriptwriter.md`: research.md + episode-format.md → `script.md` +
  `facts.md` (each factual sentence → claim id → source). Writes for the map.
- `.claude/agents/fact-checker.md`: independent; checks every factual sentence of script.md
  against sources (opens them), numbers and dates exactly; verdict per claim:
  supported / needs-softening / unsupported / contested; overall PASS/FAIL. Fix loop ≤2
  rounds, then stop.
- **USER DECISION**: topic for the test run (default: "Why does almost all of Egypt live
  along the Nile?", a 3–4 min mini-episode) and approval of the script.
- Accept when: test mini-episode script + facts.md + fact-check verdict PASS; every factual
  sentence has a claim id.

### Step 5.3 — Storyboarder
- `.claude/agents/storyboarder.md`: script.md + words.json → storyboard.json using
  visual-grammar.md and components.md; chooses/creates plates (within oversampling limits),
  prepares data (rivers, terrain masks, compose, historical layers with errata), sets
  cameras; loop: validator → `vap.qa.motion` → preview sheet → self-check against the
  pattern table; ≤2 revision rounds.
- Accept when: (a) the agent re-storyboards the pilot from scratch and step-reviewer rates it
  at least as good as the manual v2 on the visual-grammar checklist; (b) the test
  mini-episode from 5.2 gets a valid storyboard and preview sheet.

**Editing rhythm.** Before building the storyboarder, add a "Rhythm" section to `docs/visual-grammar.md` and make
the storyboarder follow it:
- cuts: 1–3 per minute on average (style guide); a cut only at a sentence or paragraph pause;
- alternate scales: wide (continent) → regional → detail → graphic; never 3 shots in a row at
  the same scale or of the same kind (e.g. three graphics);
- a graphic-only shot (no map) at most ~10–20% of runtime (B-roll included);
- a dramatic beat may use a voice-less pause of 0.6–1.5 s with a slow camera move (`[pause s]`
  in the script) — at most ~1 per section;
- every section opens with a `SectionTag` and a scale change;
- the build reports per-minute statistics (cuts, shot kinds, graphic share) and warns when out
  of range.
Accept addition: rhythm stats for pilot v2 and for the 5.2 mini-episode in the report.

### Step 5.3b — Full-length test episode
Goal: a stress test of the whole chain on a real 12–14 min episode, without music or packaging.
- **USER DECISION**: topic (default: "Why did China stay united while Europe never did?" —
  existing plates and data for both China and Europe).
- Run research → script → fact-check → **USER DECISION: script approval** → voice → align →
  storyboarder → preview → episode-qa → full render.
- Measure and report: render time (total, ms/frame), peak RAM/VRAM, disk used, number of shots,
  rhythm stats, episode-qa verdict, components that were missing (list for scene-builder),
  data gaps (plates, historical layers, errata hits), and usage consumed per stage
  (approximate: number of agent turns/subagent calls per stage).
- **USER DECISION: preview approval** before the full render.
- Accept when: a 12–14 min MP4 exists, episode-qa has no blocker, the report has all
  measurements and a prioritized list of what to improve.

### Step 5.4 — Scene-builder and episode QA
- `.claude/agents/scene-builder.md`: when the catalog lacks a needed visual, builds it:
  component + zod schema + registry + components.md entry + tests + sheet render. Never edits
  existing components' behavior without saying so.
- `.claude/agents/episode-qa.md`: shot-by-shot check of a rendered episode — map action per
  shot, label-to-word sync, mobile legibility (640 px), attributions on every map shot,
  errata, motion QA, loudness, licenses (no FORBIDDEN/UNVERIFIED in a publish build).
  Verdict + fix list.
- Accept when: scene-builder delivers one missing component on request (test:
  `ArrowAdvance` — animated military/migration advance arrows) end to end; episode-qa runs on
  pilot v2 and on the mini-episode.

### Step 5.4b — B-roll and archival image agent
- `.claude/agents/broll-scout.md`: reads script.md + storyboard.json, finds shots marked as
  B-roll or graphic-only, proposes 2–3 candidates per slot from sources allowed in
  licenses.md (Pexels, Pixabay; Wikimedia Commons — per-file license check, only licenses
  allowing commercial use; public-domain archives such as NASA, Library of Congress where
  the item is marked no known restrictions). Never people's faces as the subject of a
  shot without a clear license; no logos/brands as subject.
- Per candidate: URL, license, author, required attribution text, resolution/duration,
  why it fits the narration. Downloads go to `assets/broll/<slug>/` (git-ignored);
  `episodes/<slug>/broll.json` (committed) records choice + license + attribution and feeds
  attributions.md.
- **USER DECISION** per episode: approve candidates (the `_inbox.md` shows thumbnails/contact
  sheet). Option `--auto-pick` for drafts.
- `BRollClip` gains still-image support (Ken Burns on archival images) if not present.
- Accept when: for the 5.3b episode every B-roll/graphic slot has an approved or auto-picked
  asset with a complete license record; the publish gate (6.4) reads broll.json.

### Step 5.5 — Slash commands
- `/new-episode "<topic>"` → research → script → fact-check → stop for approval (_inbox).
- `/voice <slug>` → TTS → post → align (with `--fix`).
- `/storyboard <slug>` → storyboarder → preview → episode-qa → stop for preview approval.
- `/render <slug>` → full render → episode-qa (final).
- Accept when: the mini-episode goes topic → rendered MP4 with exactly two user touchpoints
  (script approval, preview approval); timings of each stage in the report.

---

## Stage 6 — Packaging

### Step 6.1 — Music and final mix
- **USER DECISION**: music source (license must allow monetized YouTube; record in
  licenses.md; per-track attribution if required).
- Music cues by section from the storyboard; sidechain ducking under the voice; final mix
  −14 LUFS integrated, true peak ≤ −1 dBTP; music never masks words (check: whisper on the
  final mix still matches the script ≥ 98%).

### Step 6.1b — Sound design
- **USER DECISION**: SFX source with a license that allows monetized YouTube (record in
  licenses.md).
- Small curated library in `assets/sfx/` (git-ignored) + `assets/sfx/catalog.json` (committed):
  whoosh (camera fly/zoom-through), soft tick/pop (labels, list items), low swell/drone
  (dramatic beats, big dates), paper/map rustle (historical layers), subtle impact (section
  starts).
- Automatic placement from storyboard events (camera presets, component enter frames,
  `[pause]` beats) with density limits (no more than N per 10 s; none over key words of the
  narration).
- Mixed under the voice: SFX never louder than the voice; whisper on the final mix still
  matches the script ≥ 98% (same check as 6.1).
- Accept when: pilot v2 and the 5.3b episode have a sound-design pass; report lists events
  placed per minute and the loudness check.

### Step 6.2 — Subtitles
- SRT and VTT from words.json: ≤42 characters per line, ≤2 lines, ≤17 characters/second,
  cuts at sentence/phrase boundaries; uses the original script spelling (not whisper's).

### Step 6.3 — Thumbnails
- Remotion still templates: map + highlight + ≤4 bold words; 3 variants per episode
  (for YouTube test & compare); 1280×720, < 2 MB; legibility check at 168×94.
- `/thumbnail <slug>`.

### Step 6.4 — Description, chapters and publish gate
- Chapters from `## Section` headers with timestamps (first at 00:00, ≥3 chapters, each
  ≥10 s); sources from facts.md; full attributions from attributions.md; tags.
- Publish gate: fails if any used source is FORBIDDEN, REFERENCE ONLY or UNVERIFIED, or any
  blocker errata lacks an override.
- `/package <slug>` → `episodes/<slug>/upload/` (video, subtitles, thumbnails, description.txt,
  checklist.md). Upload stays manual.

---

## Where to stop
Stop after 6.4. Stage 7 (first full 12–14 min episode) runs through the slash commands with
the user at the two checkpoints; it is not a roadmap step.
