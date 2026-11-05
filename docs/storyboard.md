# Storyboard authoring contract (v1)

The source of truth is `studio/src/storyboard/schema.ts`. It reuses all
production props schemas from `components/registry.ts`; see `docs/components.md`
for content/layout limits. Input is strict JSON, no functions, React nodes,
arbitrary component names or inline styles. This step defines/validates data;
Episode assembly and automatic voice sync are described below (steps 4.2–4.3).

## Validate and export

From studio, using the existing Node/TypeScript/Zod dependencies:

```powershell
npm run schema:storyboard
npm run validate:storyboard -- ../episodes/_sandbox/tts-test/storyboard.json
npm run validate:storyboard -- ../episodes/_sandbox/tts-test/storyboard.json --check-files
```

The CLI prints JSON (`valid`, `file`, `schemaVersion`, `shots`, `issues`) and exits
0 for valid input, 1 for invalid JSON/schema/assets, 2 for incorrect CLI usage.
Issues use paths such as `$.shots[4].layers[0].props.emphasis`. For raw machine
output without npm banners use `node scripts/storyboard.cjs validate <file>`.

`--check-files` additionally checks local WAV/word references, plate metadata,
complete alignment and the exact WAV SHA-256 referenced by words.json. It does
not resolve anchors or prove camera coverage, visual fit, licenses or facts.
All media still require the project's license/provenance workflow.

Exported `docs/storyboard.schema.json` is Draft 2020-12, input-mode JSON Schema,
with `$id: urn:video-agent:storyboard:1`. Python tooling can load this JSON and
use its own Draft 2020-12 validator; no new Python dependency was installed.
Defaults are optional inputs, not mandatory fields. No custom GeoJSON field is
silently replaced with an unconstrained `{}`: explicit structural map contracts
are exported, and unexpected unrepresentable validators fail the export.

**Full semantic validation remains the Zod CLI.** Standard JSON Schema cannot
express all cross-field checks: id uniqueness/reference integrity, ordered
anchors/bounds, closed polygon rings, cumfrac/coordinate relationships,
TimelineBar chronology, KeyFact emphasis or BRollClip trim budget. The export
lists these in `x-runtime-validation`. Zod trims text before length checks;
portable JSON Schema checks raw strings. Run the CLI after Python authoring.
Tests require the committed schema to match a fresh export and independently
round-trip the structural contract through `z.fromJSONSchema`.

## Document shape

```json
{
  "schemaVersion": 1,
  "episode": { "slug": "tts-test", "title": "China: Landscape and Unity", "language": "en", "fps": 30 },
  "plates": [{ "id": "china", "name": "china-east-hs05" }],
  "audio": { "src": "episodes/_sandbox/tts-test/audio/voice.wav", "words": "episodes/_sandbox/tts-test/audio/words.json" },
  "shots": [{
    "id": "opening", "plate": "china",
    "start": { "time": 0 }, "end": { "word": 10 },
    "camera": { "preset": "establish", "params": { "target": { "center": { "lon": 110, "lat": 32 }, "zoom": 5 } } },
    "layers": [{ "id": "title", "type": "TitleCard", "props": { "title": "CHINA" } }]
  }]
}
```

- Version is exactly 1; language is English and fps is the design-token 30.
- Episode slug, plate aliases, shot ids and layer ids use `[a-z][a-z0-9-]*`, max
  80 characters. Episode title is a single paragraph, max 160 characters.
- `plates[].id` is an alias referenced by `shot.plate`; `name` is the local plate
  basename under studio/public/plates. Plate and shot ids are unique; layer ids
  are unique within each shot. At least one plate and one shot are required.
- `audio.src` and `audio.words` are **repository-relative POSIX paths**, not
  paths relative to the storyboard. No `..`, `.` segments, URLs, Windows drives,
  backslashes or absolute paths. Like every episode, the sandbox keeps its stem
  and words in its own `audio/` folder. Both are ignored: regenerate them with the
  documented voice and alignment CLIs on another machine before using `--check-files`.
  Tests and the composition defaults use the committed copy of those words,
  `studio/src/storyboard/__fixtures__/tts-test-words.json`. Reports are documentation only.
- Every shot has a plate, start/end anchors, camera and layers array (may be
  empty). Unknown object fields are rejected. Layer order is authoring order;
  eventual assembly separates geographic overlays from screen layers according
  to the registry. PlateStage must provide automatic map attribution.

## Anchors and layer windows

An anchor has **exactly one** form:

| Form | Meaning for later resolution |
| --- | --- |
| `{ "word": 35 }` | Zero-based **original script** word index in words.json, not normalized or ASR token index. |
| `{ "phrase": "two great rivers" }` | Original-script phrase; use an unambiguous phrase, otherwise explicit word indices. |
| `{ "time": 11.93 }` | Absolute nonnegative seconds in the voice stem. |

A start word/phrase means its first word's onset; an end word/phrase means its
last word's end. Time endpoints delimit a half-open interval. Same-word start/end
is allowed (one word); reversed same-kind word bounds or nonpositive time spans
are rejected. The authoring validator does not resolve mixed anchors, search
phrases or check word availability. The voice-sync pass below performs those checks.

Layers have `id`, `type`, `props`, optional `start` and optional `end`. Missing
layer endpoints inherit that endpoint of the shot. Anchors always refer to the
global stem, not relative shot time. Voice sync enforces containment and positive
resolved durations. Components use local Sequence frames. Their
`durationInFrames` defaults describe component input, **not shot timing**; assembly
must pass the resolved layer duration to components that have that prop, rather
than using a default to override audio anchors. Example text durations are omitted:
the assembler receives computed layer windows from the voice-sync pass.

## Camera descriptors

Camera has `preset` plus strict `params`. Duration comes from the resolved shot,
not a second independent frame count. This is a serializable description of
the existing presets; it does not create a CameraPath function in JSON.

| Preset | Params |
| --- | --- |
| `establish` | Required `target`; optional push (0–1), drift [dx,dy]. |
| `drift` | Optional dir [x,y], amount (0–1), zoom delta (-4–4). Inherit current pose. |
| `hold` | Optional `reason`; inherit current pose. Over 2 s without a reason fails motion QA, see [visual-grammar.md](visual-grammar.md). |
| `focusOn` | Required bounds [west,south,east,north], positive area; optional padding, tilt, bearing, maxZoom. |
| `flyTo` | Required `to` target; optional `from`, rho>0, farFrames>=0, samples>=2. |
| `followLine` | Required line `{points:[[lon,lat],...],cumfrac:[0,...,1]}` and drawFrames; optional lead, lag, smooth, zoom, every, pitch, blend. |

Target is `{center:{lon,lat},zoom,pitch?,bearing?}`. Lon is -180–180, latitude
inside Web Mercator, absolute zoom 0–24, pitch/tilt 0–60, bearing -180–180.
followLine coordinates/fractions must have equal length, at least two points,
nondecreasing fractions beginning 0 and ending 1. drawFrames describes line-head
progress over local shot frames; other frame options are integer nonnegative,
every/blend positive. Preset defaults remain in camera/presets.ts and motion
tokens; none are simulated by the validator. Initialize camera state from a
target/fit in assembly before using inherited drift/hold. Actual coverage,
magnification, motion joints and followLine/RiverLine progress agreement require
runtime checks in later steps.

## Layers and transitions

Allowed layer types are exactly the production registry: TitleCard, EndCard,
BRollClip, LowerThird, SectionTag, BigDate, KeyFact, BarCompare, TimelineBar,
NumberedList, RecapCards, StatCounter, RegionHighlight, RiverLine, PlaceLabel,
MapAttribution. Each branch uses the component's actual props schema, not a copy.
Infrastructure/QA names such as PlateStage or GeoDebug are not layer types.
Current map props take inline geographic GeoJSON, not file strings or pixel
coordinates. Do not fill schematic Natural Earth geography_regions polygons.

`shot.transition` describes the outgoing transition to the next shot. Omit it
for a cut, or use `{kind:"cut"}`. Animated kinds reuse transitionSchema:
crossfade, dip-to-dark, map-to-graphic-wipe, with optional durationInFrames
(default from tokens). Final shot must omit transition. Runtime must ensure
transition overlap fits both adjacent shots and preserves the absolute audio
timeline; the authoring validator does not compact or resolve that timeline.

## Sandbox and review

`episodes/_sandbox/tts-test/storyboard.json` contains six shots following the
original narration: opening, plateau, desert, rivers, unity, 1644. It demonstrates
all three anchor forms, five camera presets, outgoing transitions and layer
windows. It remains demonstration content. Episode now renders it with automatic
timing and camera coverage checks; current evidence is in report 4.3.

`studio/out/storyboard-schema.png` is the rendered contract review card, not an
assembled episode frame. Report and validation evidence are in docs/reports/4.1/.

## Episode assembler (step 4.2)

The `Episode` composition is registered in Root.tsx. Run from studio:

```powershell
npm run prepare:episode
npm run render:episode
```

`prepare:episode` validates the sandbox storyboard and local references, checks
the WAV/alignment SHA-256, copies only that WAV into ignored
`studio/public/episodes/tts-test/voice.wav`, and writes ignored
`studio/out/episode-props.json`. Remotion serves public/, not arbitrary repository
paths. The render helper uses the existing Rspack Node API, ANGLE, concurrency 1,
H.264/AAC, yuv420p and limited-range BT.709. Output is
`studio/out/episode-tts-test-synced.mp4`, plus exact first-frame stills, a preview
sheet and metadata.
It does not start Studio. `--stills-only` skips MP4; `--map-smoke` renders a
separate QA variant using an existing alternate plate and Natural Earth river.
Those QA changes are in memory; the authored storyboard is not rewritten.

Input props for `Episode`:

| Prop | Contents |
| --- | --- |
| `storyboard` | Authoring JSON using schemaVersion 1 above. |
| `words` | Complete original-script alignment JSON bound to the exact WAV hash. |
| `audioSrc` | Public-relative local WAV path, e.g. episodes/tts-test/voice.wav. |
| `timing` | Omit or null for automatic voice sync; an explicit plan selects manual compatibility mode. |
| `sync` | Optional `{labelLeadFrames: 3}` override (0–30 frames). |
| `prepared` | Internal calculateMetadata result; callers should omit it. |

`calculateMetadata` fetches and hashes actual WAV bytes, parses the RIFF PCM16
sample contract and computes `ceil(samples * fps / sampleRate)`. It does not infer
duration from the authored last shot or trust alignment duration alone. The
current narration is mono 24 kHz, 593760 samples, 24.74 s -> **743 frames**.
Alignment hash/duration must agree. Input must be nonempty mono PCM16 RIFF WAV;
RF64, float WAV and compressed inputs are rejected rather than mismeasured.
The composition defaults to the sandbox inputs; `prepare:episode` must stage its
audio before selecting it in Studio on a new workspace. If fresh synthesis
changes the WAV hash, re-align and update the storyboard's words reference;
do not silently edit historical report evidence to hide a mismatch.

### Manual frame-plan compatibility

`episodes/_sandbox/tts-test/assembly.json` is a deliberately authored **frame
plan** retained from 4.2 and its regression tests. It is no longer the default.
Pass it explicitly in `timing` for an already compiled schedule. Otherwise the
resolver consumes current anchors, word timestamps and WAV silence. This historical
manual fixture does not describe the current automatically synchronized plan.

```json
{
  "shots": [{
    "id": "opening", "from": 0, "durationInFrames": 101,
    "layers": [{ "id": "title", "from": 0, "durationInFrames": 101 }]
  }]
}
```

Shot `from` is absolute; layer `from` is relative to its shot. Every shot/layer
must appear exactly once in authoring order. Shot windows must be contiguous,
cover the measured frame count and contain their layer windows. Component Zod
schemas validate actual scheduled durations, overriding optional duration defaults
and mismatched authored duration props for the rendered Sequence. EndCard still
requires its exact twenty-second window. Optional `cameraWindow` selects the active
preset window inside a scene; outside it the camera uses drift. Short uncovered
intervals can thus remain subsegments instead of undersized scenes.

The existing camera preset functions feed one C2 global camera timeline. Local
shot camera wrappers preserve absolute time. Plate coverage/magnification is
verified over every frame, including outgoing transition extensions, before
rendering and by PlateStage itself. A valid JSON camera descriptor alone does
not guarantee coverage; unsafe plans fail instead of showing plate edges.

Each shot becomes a TransitionSeries scene containing PlateStage and local
layer Sequences. RegionHighlight/RiverLine use the geo slot; other registered
layers use screen. An animated outgoing plate change uses PlateSequence; a cut
switches PlateStage at the boundary. Geo data is inline as defined by v1. Current
geographic data follows the Natural Earth workflow; provide additional licensed
source credit with a MapAttribution layer when appropriate.

Outgoing scenes extend by the transition duration and TransitionSeries subtracts
the same overlap: subsequent absolute shot starts and total voice duration are
preserved. A single Html5Audio track sits outside all scene overlaps, at unity
volume without trimming, time stretching, final-mix processing or repetition.

Episode renders one combined visible attribution overlay outside transitions.
Inline credit components inside scene scope are suppressed; ordinary standalone
PlateStage/BRollClip behavior is unchanged. During overlaps, union the credits
of both visible scenes, plus Natural Earth, approved B-roll and explicit credit
layers, deduplicating identical strings. This prevents crossfaded source strings
from becoming unreadable and keeps attribution visible during dip-to-dark.

## Automatic voice sync (step 4.3)

Default Episode props now use `timing: null`; no manually maintained frame list
is required. The resolver runs inside calculateMetadata against hash-matched
original word data and the actual PCM waveform. To inspect without rendering:

```powershell
npm run sync:episode
npm run sync:episode -- ../episodes/_sandbox/tts-test/storyboard.json --lead-frames=0
npm run render:episode -- --lead-frames=3
npm run render:episode -- --stills-only
```

The CPU sync command writes `out/<slug>-sync.json`, `<slug>-assembly.json` and
`<slug>-runtime-storyboard.json`. Rendering also writes the effective plan/report,
first-frame PNGs and **`out/<slug>-preview.png`**. Run the default sync command
again after experimenting with an override if you want its disk reports restored
to the default configuration. Generated artifacts never overwrite authored JSON.

### Anchor matching and label lead

Word anchors address the original zero-based words. Phrase matching uses contiguous
original lexical tokens, case-insensitive NFKC text, normalized apostrophes and
numeric grouping commas; `2,000 years` and `2000 years` select the same words.
Punctuation/hyphens do not create false mismatches. Start maps to the first word's
start; end to the last word's end. Multiple matches are an error: use explicit
word indices. Missing words/phrases, out-of-audio times and reversed ranges fail
with paths such as `$.shots[1].layers[0].start`.

Explicit starts for text/infographic labels and PlaceLabel receive
`sync.labelLeadFrames` (default **3**, 0–30). TitleCard, EndCard, geo drawing,
B-roll and source-credit layers keep their own timing. An omitted layer start
inherits the snapped shot start. Lead moves only the entrance, never the end,
and is clamped inside the scene. This is the animation's first frame, not the
point where its fade/count-up becomes fully opaque/settled. Reported lead is
relative to the rounded aligned-word frame; ASR phonetic accuracy remains subject
to the limitations in report 3.3.

The sandbox now supplies explicit phrase starts for Tibetan Plateau, Gobi Desert
and 2,000 years, alongside the existing rivers/date cues. All five use exactly
three frames of lead, without changing the narration or displayed text.

### Acoustic cut policy and gaps

Policy lives in `design/tokens.ts` -> `voiceSync`:

| Token | Default |
| --- | --- |
| labelLeadFrames | 3 |
| minShotFrames | 60 (2 s at 30 fps) |
| minPauseFrames | 3 |
| snapWindowFrames | 18 |
| silenceWindowMs / silenceThresholdDbfs | 10 ms / -45 dBFS RMS |

Detect non-overlapping quiet runs on the actual mastered PCM samples, not only
gaps in Whisper timestamps. Eligible pauses contain at least three frame starts.
For short pauses, use their integer midpoint; for pauses longer than twice the
snap window, use the nearest quiet frame, retaining long uncovered time for drift.
Choose the closest admissible candidate to the rounded anchor, breaking ties
toward the earlier frame. Require it within 18 frames of that rounded anchor;
media start/end stay exact. These are configurable token defaults, not a claim
that one RMS threshold identifies every perceptual pause in arbitrary audio.
Failure to find a candidate is explicit; the resolver does not silently cut speech.

Reject overlapping/out-of-order authored ranges before snapping, then reject
overlapping snapped ranges and source shots shorter than the token minimum.
Long gaps (>=60 frames) become generated `sync-gap-NNN` drift scenes, with collision
free ids and inherited plate. Move an outgoing transition to the gap's end so it
still leads into the next authored scene. Shorter gaps are drift camera tails of
the preceding scene; short leading time becomes a drift prefix. Original label
windows end before padding. Every resulting scene meets the minimum; a short
drift subsegment is not a separate shot. Leading/trailing gaps are covered too.

The incoming scene's snapped start remains its actual cut. If a preceding end
candidate leaves a short gap, that scene carries drift until this incoming cut;
the source end candidate still marks the end of its active camera/content window.
Nominal windows cover the WAV frame count exactly without overlaps. Intentional
visual transition extensions remain handled by the assembler and do not shift
the single voice track. Component-specific duration/geometry/coverage checks still
apply; this pass does not automatically stretch an unreadably short label.

### Review sheet and current sandbox

The preview sheet uses the exact final composition frame at each scheduled shot's
start, with its original-script narration underneath. During a transition that
frame can show the outgoing image; no midpoint is substituted to make labels look
visible. Generated drift scenes are included and empty narration is labelled
`Pause / drift`. Captions preserve the whole selected narration line and typography
comes from design tokens. The sheet is a diagnostic artifact, not a video overlay.

Current source-first frames are **0,97,235,349,465,577**, ending at 743. All five
internal boundaries independently measured zero RMS in a 10 ms window of the WAV.
The first scene has an **8-frame drift tail**; there is no undersized generated
scene. See report 4.3 and its JSON evidence for the complete cut/lead/coverage data.
