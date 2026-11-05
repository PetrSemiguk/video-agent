---
name: geo-episode
description: How an episode of this geo-history channel is made - file layout, stage order, build commands, where each rule lives, what is forbidden. Use before writing a script, storyboard or facts ledger, adding map data or media, or running an episode build.
---

# Making an episode

An English 12-14 min video, mostly animated satellite maps with narration by TTS. This page says what to
do in what order and where the rules live. Read the linked document before doing that stage's work:
**the documents win over this summary**. Paths are from the repo root.

## Files

`episodes/<slug>/`, where the slug is lowercase letters, digits and hyphens, starting with a letter:

| File | What it is | In git |
|---|---|---|
| `script.md` | Narration. Headings and HTML comments are not spoken | yes |
| `facts.md` | Ledger: each factual claim, its source URL, its qualification | yes |
| `attributions.md` | Credits for the video description. The build keeps a marked block for historical layers; never edit inside it | yes |
| `voice.job.json` | Optional voice settings | yes |
| `storyboard.json` | Shots and layers, anchored to words | yes |
| `audio/` | `voice.wav`, `words.json`, manifests | no |

Renders and logs go to `studio/out/` (ignored). Map data: `data/processed/<plate>/`, committed. Raw downloads:
`data/raw/`, ignored.

## Stages, in order

1. **Topic and research.** Claims with sources, into `facts.md`.
2. **Script** by [episode-format.md](../../../docs/episode-format.md).
3. **The user approves the script text. No TTS before that.**
4. **Voice and alignment**, from `pipeline/`: `uv run python -m vap.episode build <slug> --stage align`.
   This runs voice first. Stop and report if alignment is incomplete; never force timings.
5. **Storyboard**, needing `words.json`, by [visual-grammar.md](../../../docs/visual-grammar.md),
   [components.md](../../../docs/components.md) and [storyboard.md](../../../docs/storyboard.md). Prepare data first:
   plates, rivers, masks and routes by [maps.md](../../../docs/maps.md), historical layers by
   [historical-sources.md](../../../docs/historical-sources.md).
6. **Validate**, from `studio/`: `npm run validate:storyboard -- ../episodes/<slug>/storyboard.json --check-files`.
7. **Preview**: `--stage preview`, then check `studio/out/<slug>-preview.png`. Review stills: `npm run review:episode -- <slug>`,
   then `uv run python -m vap.qa.episode_sheets <slug>`.
8. **The user approves the preview. No full render before that.**
9. **Render**: `--stage render` gives `studio/out/episode-<slug>-synced.mp4`. Check with
   `uv run python -m vap.qa.episode_audit <slug>`.

Stages include their predecessors and reuse valid caches. The `storyboarder` agent does stages 5-7, `researcher`, `scriptwriter` and `fact-checker` stages 1-2. Music, subtitles, thumbnails and packaging are later
roadmap steps and do not exist yet ([roadmap.md](../../../docs/roadmap.md), stage 6).

## Rules the build enforces

- **Errata:** a layer with a blocker fails unless the storyboard gives an `errataOverride` reason.
- **Still camera:** over 2 s below 0.03 px/frame fails. `hold` passes only with a reason.
- **Fast camera:** over 9 px/frame fails, in any shot.
- **Camera coverage:** a plate edge in frame, or magnification over the plate's limit, fails.
- **Anchors:** a phrase must occur exactly once in the script, and shots of under 2 s fail.

## Forbidden

- **Sources:** anything marked FORBIDDEN or REFERENCE ONLY in [licenses.md](../../../docs/licenses.md) never appears in a
  render: Mapbox, GADM, CShapes, Sentinel-2 cloudless 2018+, historical-basemaps. Sentinel-2 2016 is on hold.
- **New sources:** a new data, media, font or model source gets its `licenses.md` row **before** use. Wikimedia Commons:
  check each file and record it in `attributions.md`. An unclear license stops the work.
- **Invented geography:** never invent a contour or a route. If no source shows it, say so or leave it out. Custom routes
  and masks are `approximate` and credited.
- **Schematic shapes:** Natural Earth `geography_regions` polygons are labels only, never filled.
- **Voice:** no cloning without rights to the recording ([voice.md](../../../docs/voice.md)).
- **Visual values:** colors, fonts, sizes and motion come only from `studio/src/design/tokens.ts`.

## Environment

Windows, native. Python only through `uv run` from `pipeline/`; npm and npx only, from `studio/`. TTS, whisper and renders
run one at a time, never together. Map renders use `--gl=angle` at `--concurrency=1`. Do not leave Remotion Studio running.
Git: only what [AGENTS.md](../../../AGENTS.md) allows.

## Where to look

| Question | Document |
|---|---|
| Structure, length, how to write for the map | [episode-format.md](../../../docs/episode-format.md) |
| What happens on the map under each phrase | [visual-grammar.md](../../../docs/visual-grammar.md) |
| Which components exist, their props and limits | [components.md](../../../docs/components.md) |
| Storyboard format and anchors | [storyboard.md](../../../docs/storyboard.md) |
| Which historical source for which date | [historical-sources.md](../../../docs/historical-sources.md) |
| Plates, rivers, masks, routes, composing a historical map | [maps.md](../../../docs/maps.md) |
| Is a source allowed, what credit does it need | [licenses.md](../../../docs/licenses.md) |
| Voice settings, pauses, pronunciation | [voice.md](../../../docs/voice.md) |
| Look of the channel | [style-guide.md](../../../docs/style-guide.md) |
| Build outputs and failures | [README.md](../../../README.md), "Make an episode" |
