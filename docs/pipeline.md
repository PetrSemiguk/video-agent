# Production pipeline

Eight stages, from topic to upload-ready package. Each stage ends with a checkable artifact.

## 1. Topic → script + facts
Research the topic and write `episodes/<slug>/script.md` (12–14 min of narration).
Every factual claim goes into `episodes/<slug>/facts.md` with its source.
Artifact: script.md + facts.md.

## 2. Script → voice (TTS)
Chatterbox synthesizes the narration into WAV files in `episodes/<slug>/audio/`.
Runs on the GPU; never in parallel with whisper.
Artifact: WAV per section / full episode.

## 3. Voice → word timings
faster-whisper aligns the WAV and produces word-level timestamps as JSON.
Artifact: `audio/words.json` (or similar).

## 4. Script + timings → storyboard
Build `episodes/<slug>/storyboard.json`: scenes, camera moves, overlays, all tied to word timings.
Validated against a zod schema.
Artifact: storyboard.json that passes validation.

## 5. Storyboard → Remotion composition
The `studio/` project turns storyboard.json into a composition from the shared component library
(map camera, region fills, lower thirds, timelines, bar charts, cards).
Artifact: composition that opens in Remotion Studio.

## 6. Stills → QA → full render
Render stills at key moments, review them, fix, then do the full render.
Artifact: QA stills, then the full render in `episodes/<slug>/renders/`.

## 7. Final mix
ffmpeg combines voice, music with ducking under speech and B-roll into the final MP4, plus an SRT.
Artifact: final MP4 + SRT.

## 8. Thumbnail + description
Thumbnail rendered as a Remotion still; video description includes all attributions
(see [licenses.md](licenses.md) and `episodes/<slug>/attributions.md`).
Artifact: thumbnail PNG + description text.
