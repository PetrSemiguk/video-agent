# AGENTS.md

## Project

video-agent is a production pipeline for an English-language YouTube channel of
geo-historical videos (12–14 min each). Videos are built mostly from animated
satellite maps with 3D terrain, region overlays and data graphics, narrated by TTS.
The pipeline goes from topic and sourced script to voice, word timings, a validated
storyboard, a Remotion render, a final ffmpeg mix and a thumbnail.

## Repo map

- `docs/` — pipeline stages, style guide, licenses (source of truth, see below)
- `studio/` — Remotion project: compositions and the reusable component library
- `pipeline/` — Python project on uv: TTS, whisper alignment, geo scripts
- `data/raw/` — downloaded source datasets (git-ignored)
- `data/processed/` — trimmed GeoJSON used by episodes (committed, keep files small)
- `assets/fonts/` — fonts for non-Remotion use; fonts used in renders live in
  `studio/public/fonts/` (committed: Remotion serves only `public/`); `assets/music/`, `assets/broll/` — git-ignored
- `episodes/<slug>/` — script.md, facts.md, storyboard.json, attributions.md, audio/, renders/
- `.claude/` — project settings (permissions, hooks), agents, skills
- `.claude/skills/` — official Remotion Agent Skills (from remotion-dev/skills)

- `.agents/skills/` — project skills for Codex (install separately; from remotion-dev/skills)
- `docs/reports/` — step reports; see the roadmap protocol

## Environment

- Windows 11, native (not WSL). Use Windows-compatible paths and commands.
- Node 26.
- Python ONLY via uv, pinned to 3.11 inside `pipeline/`.
  System python is 3.14 — never use it, never `pip install` globally.
- Keep torch and torchaudio at 2.6.0+cu126 and numpy below 2; see `docs/python-env.md`.
- ffmpeg 9 is in PATH.
- GPU: RTX 4060, 8 GB VRAM — run TTS and whisper sequentially, never concurrently.
- RAM: 16 GB — Remotion render concurrency ≤ 3 (config uses 2).
- **Check free RAM before a heavy render** and lower the concurrency when it is short: out of memory
  a render is killed, not slowed. `vap.episode build` does this itself (`vap.system`): it refuses
  below 6 GB available and passes `--concurrency` to `render-episode.mjs`, which defaults to 1.
  Running a render by hand, pass `--concurrency=1` when anything large is open.
- Remotion 4.0.539 (`studio/`). Render with gl=angle (set in `studio/remotion.config.ts`) — required for GPU WebGL on Windows.

## Git policy

**The user merges and pushes. Claude Code may commit only on `auto/*` branches. Other agents, such as
Codex, never commit.**

- Everyone may read: `git status`, `git diff`, `git log`, `git show`, `git check-ignore`, `git ls-files`.
- Claude Code may also, and only on `auto/*` branches: `git add` and `git commit`.
- Claude Code may also `git switch -c auto/<name> [main]`, `git switch auto/<name>` and `git switch main`.
- Never: push, merge, rebase, reset, restore, stash, clean, cherry-pick, revert, `commit --amend`,
  `branch -d/-D`, tag, worktree, remote changes, or any commit on `main`. Never use `gh`.
- Run git from the repo root without `-C` / `-c`. Run `git switch` and `git add`/`git commit` as separate
  commands.
- In Claude Code, this is enforced by `.claude/hooks/git-guard.mjs` (add, commit, switch, checkout, branch)
  and deny rules in `.claude/settings.json` (the rest). Do not try to work around them. Outside Claude Code
  there is no technical enforcement, and this rule is mandatory.
- On `main`, at the end of each task: show `git status` and propose a Conventional Commit message
  (e.g. `feat(studio): add lower-third component`). Do not run it.

Autonomous runs: `/run-roadmap`, see [docs/automation.md](docs/automation.md).

## Rules

- Never create files containing secrets in the working tree, except `.env` (git-ignored).
  Template lives in `.env.example`.
- Follow [docs/licenses.md](docs/licenses.md). Sources marked FORBIDDEN are never used, in any form.
- Before using a new data or media source, add it to `docs/licenses.md` first.
- Wikimedia Commons: check each file's license and record it in `episodes/<slug>/attributions.md`.
- All colors, fonts, sizes, spacing and motion come from design tokens only:
  `studio/src/design/tokens.ts` (v0 draft; final values in step 2.1).
  No hardcoded visual values in components.

## Overrides for Remotion skills

These rules take precedence over any Remotion skill instructions, including those in `.claude/skills/` and `.agents/skills/`.

- **Package runner:** npm/npx only, never bun/bunx (even if a skill shows only bun).
- **Rendering:** every step ends with a rendered artifact (still or MP4) — this overrides
  "don't render unless asked". Do not leave Remotion Studio running in the background;
  the user starts it manually when needed.
- **Map renders:** `--gl=angle` and `--concurrency=1` until benchmarked otherwise (step 1.1).
  Non-map renders may use the config default (2).
- **Mapbox:** Never use Mapbox styles, tiles or APIs (video use not licensed). For map rendering
  use MapLibre GL JS with our own sources; the remotion-maps Mapbox technique does not apply.
- **Map attribution:** built-in `attributionControl` is off per the maps skill, so our own
  visible attribution overlay is mandatory on every map shot (texts from
  [docs/licenses.md](docs/licenses.md)).
- **Styling:** all visual values come from design tokens — ignore remotion-interactivity's
  "inline styles only" guidance.
- **Captions/transcription:** use faster-whisper in `pipeline/`, not `@remotion/whisper-webgpu`.
- **ffmpeg:** system ffmpeg 9 for final mixing; `npx remotion ffmpeg` is fine for ad-hoc probing.
- **Upgrades:** never run `npx remotion upgrade` or `npx skills update` without asking the user;
  skills are updated from the repo root, Remotion packages from `studio/`.
- **Note:** skills contain nested duplicate copies that may diverge; when they conflict,
  prefer the top-level skill in the active agent directory: `.claude/skills/<name>/` for Claude Code or `.agents/skills/<name>/` for Codex.

## Workflow

- The user writes in Russian; reply in Russian.
- Code, comments, docs in the repo and commit messages are in English.
- Every step ends with a verifiable artifact: a still frame, an MP4, or valid JSON.
- Keep changes scoped to the current step; don't install dependencies a step didn't ask for.

## Commands

Run from `studio/`:

- `npm run studio` — open Remotion Studio
- `npm run render:hello` — render the `Hello` composition to `out/hello.mp4`
- `npm run still:hello` — still of `Hello` (frame 90) to `out/hello.png`
- `npm run still:glcheck` — WebGL check still to `out/glcheck.png` (must show ANGLE + RTX 4060)
- `npm run still:plate -- out/plate-<name>.png --props=props/plate-<name>.json` — `PlateCheck`
  still: plate + attribution + lon/lat markers (props files live in `studio/props/`)
- `npm run still:geodebug -- out/geodebug-<name>.png --props=props/geodebug-<name>.json` —
  plate + Natural Earth debug overlay (needs `vap.geo.extract` for that plate first)
- `npm run still:hist -- out/hist-<slug>.png --props=props/hist-<slug>.json` — `HistDebug` still:
  plate + historical polities, labels, big date, attribution (needs `vap.geo.hist extract` first);
  `npm run hist:compare -- <left.png> <right.png> <out.png>` puts two stills side by side
- `npm run render:ab-a` / `npm run render:ab-b` — step 1.2 camera A/B test (MapLibre 3D /
  plate + CSS) to `out/ab-a-maplibre.mp4` / `out/ab-b-plate.mp4`; `npm run ab:side-by-side`
  stacks them into `out/ab-side-by-side.mp4`. Variant A needs `npm run prepare:maplibre`
  (local worker, run by `render:ab-a`) and exported terrain tiles (below).
- `npm run render:demo-china-rivers` — PlateStage demo (rivers, region, labels) to
  `out/demo-china-rivers.mp4`
- `npm run render:camera-showreel` — camera presets + plate transition demo to `out/camera-showreel.mp4`
- `npm run render:episode -- --storyboard=../episodes/<slug>/storyboard.json` — render an episode
  directly (first-frame preview + MP4, ANGLE, concurrency 1) to `out/episode-<slug>-synced.mp4`;
  without `--storyboard` it renders the sandbox. Prefer `vap.episode build` (below), which also runs voice/alignment
- `npm run review:episode -- <slug>` — content-visible still of every shot to
  `out/<slug>-review-<shot-id>.png`, plus `out/<slug>-review.json` and `out/<slug>-prepared.json`
- `npm run audit:episode-camera -- <slug>` — camera smoothness and on-screen credits on every frame to
  `out/episodes/<slug>/camera-and-credits.json` (needs `review:episode` first)
- `npm run pilot:storyboard` — regenerate `episodes/china-unity-pilot/storyboard.json` from its generator
- `npm test` — vitest (toScreen vs CSS matrices, preset joints, plate alignment, showreel plate limits)
- `npm run lint` — eslint + tsc

Python: run from `pipeline/` with `uv run` only. Never activate the venv manually, never use pip.

- `uv sync` — install/update the environment from `uv.lock`
- `uv run python -m vap.gpu_check` — CUDA check + matmul benchmark (must end with `GPU OK: NVIDIA GeForce RTX 4060`)
- `uv run python -m vap.geo.plate --name <name> --bbox=<minLon,minLat,maxLon,maxLat> [--hillshade 0.5] [--grade dark] [--strict]`
  — 3840×2160 map plate to `studio/public/plates/<name>.png` + `.json` (see docs/maps.md)
- `uv run python -m vap.geo.terrain_export --plate <name> --min-zoom 0 --max-zoom 7` — copy
  terrarium tiles for a plate to `studio/public/terrain/` (git-ignored) for MapLibre terrain
- `uv run python -m vap.geo.extract --plate <name> [--layers …] [--min-rank N] [--admin1-countries CHN,…]` — Natural Earth
  layers for a plate to `data/processed/<name>/` (committed) + `studio/public/geo/<name>/`
- `uv run python -m vap.geo.compose --plate <p> --name <slug> [--countries CHN,...] [--admin1 "Henan,..." --admin1-country CHN]`
  — union of units into `data/processed/<p>/custom/<slug>.geojson`
- `uv run python -m vap.geo.river --plate <p> --name "Yellow" [--also "..."] [--from lon,lat --to lon,lat --slug s]`
  — main stem source→mouth (extended to the sea) with `cumfrac` into `data/processed/<p>/rivers/<slug>.geojson`
- `uv run python -m vap.geo.find "<name>" [--layer rivers|regions|places|countries|admin1|lakes]`
  — look up Natural Earth ids by name
- `uv run python -m vap.geo.terrainregion --plate <p> --name <slug> (--min-elev M | --max-elev M) [--seed lon,lat] [--smooth km] [--bbox w,s,e,n]`
  — connected terrain mask, clipped to NE land, to `data/processed/<p>/terrain/<slug>.geojson`
- `uv run python -m vap.geo.route --plate <p> --spec <file.yaml>` — custom route from sourced nodes to
  `data/processed/<p>/routes/<slug>.geojson` + `<slug>.sources.md`; see "Custom routes" in docs/maps.md
- `uv run python -m vap.geo.hist probe --plate <p> --date <YYYY-MM-DD> [--search "<regex>"]` — what
  OHM holds on a date; `--search` looks worldwide by name. Evidence in `docs/reports/1.7/`
- `uv run python -m vap.geo.hist extract --plate <p> --date <YYYY-MM-DD> --slug <slug>` — state polygons
  (CC0 and CC BY 4.0 relations and ways, clipped to NE land) to `data/processed/<p>/historical/<slug>.geojson`
- `uv run python -m vap.geo.hist extract --source cliopatria --plate <p> --date <YYYY-MM-DD> --slug <slug> [--frame-year <y>]`
  — the same from Cliopatria; `probe --source cliopatria` lists a frame
- `uv run python -m vap.geo.hist compose --plate <p> --spec <file.yaml>` — compile a composed map; see
  "Composing historical maps" in docs/maps.md and the source rule in docs/historical-sources.md
- `uv run python -m vap.geo.hist_qa` — historical layers against known facts, rivers and coverage
- `uv run python -m vap.episode build <slug> [--stage voice|align|preview|render|all]` — sequential, cached
  episode build (each stage includes its predecessors); see "Make an episode" in README.md
- `uv run python -m vap.qa.episode_sheets <slug>` — review sheet and 640/384 px mobile sheets to `studio/out/`
  (needs `review:episode` and the preview stage first)
- `uv run python -m vap.qa.episode_audit <slug> [--check-cache]` — words, cuts, label leads, MP4 and decoded
  audio checks to `studio/out/episodes/<slug>/audit.json`; `--check-cache` also proves all stages stay cached
- `uv run python -m vap.qa.rhythm <slug>` — cuts per minute, scales, shot kinds, graphic share to `studio/out/episodes/<slug>/rhythm.json`,
  with warnings; the preview stage runs it too (needs its camera plan)
- `uv run python -m vap.qa.flicker <mp4> --from 9.2 --to 12` — luma flicker on a static section
- `uv run python -m vap.qa.contact <mp4>... --times 0,2,4 --out <png>` — contact sheet
- `uv run python -m vap.qa.motion <mp4> [--marks 4,9.5]` — camera smoothness: shift speed per frame
  (phase correlation), max jump, chart `<video>-motion.png`; `--plan <slug>-camera-plan.json --check` applies
  the build rule on still stretches (docs/visual-grammar.md)
- `uv run ruff check .` / `uv run ruff format .` — lint / format
- `uv run pytest` — tests

## Codex

`.agents/` is git-ignored and installed locally. To reinstall the skills, run from the repo root
(ask the user first, as with any skills update):

```
npx skills add remotion-dev/skills --agent codex --skill "*" --yes
```

This fetches the latest upstream skills and can rewrite the tracked `skills-lock.json`, which the
Claude Code skills also use. Check `git diff skills-lock.json` afterwards and let the user decide.

## Reference docs (read instead of duplicating here)

- [docs/pipeline.md](docs/pipeline.md) — the 8 pipeline stages
- [docs/style-guide.md](docs/style-guide.md) — visual style
- [docs/licenses.md](docs/licenses.md) — source licenses and attribution texts
- [docs/python-env.md](docs/python-env.md) — Python/torch/CUDA stack and model cache
- [docs/maps.md](docs/maps.md) — map plates: sources, lon/lat → px contract, adding a region
- [docs/episode-format.md](docs/episode-format.md) — episode structure, length, map-first writing, script markup
- [docs/visual-grammar.md](docs/visual-grammar.md) — how a storyboard uses the map: rules, pattern table, anti-patterns
- [docs/backlog.md](docs/backlog.md) — decided, not yet scheduled
- [docs/roadmap.md](docs/roadmap.md) — work plan and the step report protocol
- [docs/automation.md](docs/automation.md) — autonomous runs, notifications, merging `auto/*`
