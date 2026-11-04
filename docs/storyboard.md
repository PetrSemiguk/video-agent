# Storyboard authoring contract (v1)

The source of truth is `studio/src/storyboard/schema.ts`. It reuses all sixteen
production props schemas from `components/registry.ts`; see `docs/components.md`
for content/layout limits. Input is strict JSON, no functions, React nodes,
arbitrary component names or inline styles. This step defines/validates data;
Episode assembly and anchor resolution belong to steps 4.2 and 4.3.

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
  "audio": { "src": "studio/out/voice-3.2/voice.wav", "words": "docs/reports/3.3/words.json" },
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
  backslashes or absolute paths. The sandbox references the measured step 3.2
  stem, paired with checked step 3.3 words. WAV is ignored: regenerate it with
  the documented voice CLI on another machine before using `--check-files`.
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
are rejected. Mixed anchors remain declarative until 4.3; this validator does
not search phrases, check word-index availability or compute overlaps/gaps.

Layers have `id`, `type`, `props`, optional `start` and optional `end`. Missing
layer endpoints inherit that endpoint of the shot. Anchors always refer to the
global stem, not relative shot time. Future resolution must enforce containment
and positive resolved durations. Components use local Sequence frames. Their
`durationInFrames` defaults describe component input, **not shot timing**; assembly
must pass the resolved layer duration to components that have that prop, rather
than using a default to override audio anchors. Frame quantization and pause
snapping are deferred; example text durations are intentionally omitted.

## Camera descriptors

Camera has `preset` plus strict `params`. Duration comes from the resolved shot,
not a second independent frame count. This is a serializable description of
the existing presets; it does not create a CameraPath function in JSON.

| Preset | Params |
| --- | --- |
| `establish` | Required `target`; optional push (0–1), drift [dx,dy]. |
| `drift` | Optional dir [x,y], amount (0–1), zoom delta (-4–4). Inherit current pose. |
| `hold` | Empty object; inherit current pose. |
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
windows. It is a schema example, not a sourced publication-ready episode or a
validated camera render. Step 4.2 will build Episode; 4.3 will resolve/check timing.

`studio/out/storyboard-schema.png` is the rendered contract review card, not an
assembled episode frame. Report and validation evidence are in docs/reports/4.1/.
