# Raw answers of the fresh subagent (step 5.1)

Verbatim. The questions and expected answers are in [../5.1.md](../5.1.md). Model: Sonnet. Asked before the mini-episode word budget was added to
`docs/episode-format.md`, which none of these answers depends on.

1. Order (SKILL.md): topic and research (facts.md), script, voice and alignment, storyboard, validate, preview, render. The user must approve at two points. The first is the script text, before any TTS. The second is the preview, before any full render. (SKILL.md "Stages, in order"; the stage list is SKILL.md's own, docs not needed.)

2. Not yet. Stage 3 of SKILL.md says the user approves the script text and no TTS runs before that. episode-format.md has a pre-approval checklist you should pass first (word count, facts.md lines, a mappable subject per paragraph).

3. Per episode-format.md, an episode is 12-14 min, about 1,900-2,200 words at about 160 wpm. The cold open is up to 30 s, with a budget of about 70 words. The doc also notes a test mini-episode of 3-4 min.

4. Run it from `pipeline/`: `uv run python -m vap.episode build nile-delta --stage align` (SKILL.md). It runs voice first, so it only applies after the script is approved. If alignment is incomplete, stop and report. Never force timings. voice.md says the align CLI exits 2 when the output is unresolved.

5. No to both. licenses.md marks Mapbox (all products) FORBIDDEN, because video use is not licensed. It marks GADM FORBIDDEN as non-commercial. SKILL.md "Forbidden" repeats this. The documents do not name an allowed substitute for a province boundary. AGENTS.md (in context, not linked) points to Natural Earth admin1 layers, but I did not open licenses.md's coverage of that beyond the Natural Earth row, which is public domain.

6. Before use, check that file's license, and never use NC or ND files. Then record it in `episodes/<slug>/attributions.md` with file URL, author, license and required credit. If the license is unclear, work stops. (licenses.md, SKILL.md)

7. Per historical-sources.md, China before 1000 should be a composed map on the Cliopatria frame right after the event. Frame 561 is right for 560, and frame 555 is stale. OHM has none of these states. For compositions, see maps.md "Composing historical maps". I did not open maps.md. If no source shows one state's extent, never invent a contour (SKILL.md). Say so or leave it out. Do not treat an absence as proof the state did not exist. Record findings in `<slug>.errata.json`, where a `blocker` stops the build unless the storyboard gives an `errataOverride` reason.

8. A hold over 2 s without a reason fails the build (visual-grammar.md, SKILL.md). The options are to add `{"preset":"hold","params":{"reason":"..."}}`, or to use a moving preset such as `drift`, `focusOn`, `flyTo` or `followLine`. visual-grammar.md prefers movement, since the camera should move in every shot. For "the Yellow River crosses the plain", the map should draw the river with a `RiverLine` while the camera uses `followLine`. Light the lowlands too, with a lowland mask from `vap.geo.terrainregion --max-elev` and a `RegionHighlight`, on the word "plain". Anchor each action to its key word with a `phrase`.

9. In script.md (episode-format.md), write `[pause 1.0]` on its own line for exactly 1 s. It accepts 0-30 s, lowercase, with a decimal point. Start a section with `## Section name`, which is not spoken and adds a 1.00 s pause. A section opens with a `SectionTag` of that name in the storyboard, and later becomes a YouTube chapter. Use at least 3 sections, with short names and no trailing punctuation.

10. No. TTS, whisper and renders run one at a time, never together (SKILL.md, AGENTS.md). Python runs only through `uv run` from `pipeline/`; never use pip or activate the venv. npm and npx run from `studio/`. Renders and logs go to `studio/out/`, which is git-ignored. For example, the final MP4 is `studio/out/episode-<slug>-synced.mp4`. Map renders use `--gl=angle` and `--concurrency=1`.

Not settled by the documents I read: the README "Make an episode" section, maps.md and storyboard.md were not opened, so build output details and the exact composing procedure are unconfirmed.
