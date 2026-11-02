# CLAUDE.md

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
- `assets/fonts/` — fonts (committed); `assets/music/`, `assets/broll/` — git-ignored
- `episodes/<slug>/` — script.md, facts.md, storyboard.json, attributions.md, audio/, renders/
- `.claude/` — project settings (permissions), agents, skills
- `.claude/skills/` — official Remotion Agent Skills (from remotion-dev/skills)

## Environment

- Windows 11, native (not WSL). Use Windows-compatible paths and commands.
- Node 26.
- Python ONLY via uv, pinned to 3.11 inside `pipeline/`.
  System python is 3.14 — never use it, never `pip install` globally.
- ffmpeg 9 is in PATH.
- GPU: RTX 4060, 8 GB VRAM — run TTS and whisper sequentially, never concurrently.
- RAM: 16 GB — Remotion render concurrency ≤ 3 (config uses 2).
- Remotion 4.0.539 (`studio/`). Render with gl=angle (set in `studio/remotion.config.ts`) — required for GPU WebGL on Windows.

## Git policy

**The user makes all commits and pushes. Claude only reads git state.**

- Allowed: `git status`, `git diff`, `git log`, `git show`, `git check-ignore`, `git ls-files`.
- Never stage, commit, push, reset, rebase, merge, checkout, switch, restore, stash,
  clean, tag, or change remotes. Never use `gh`.
- Run git from the repo root without `-C` / `-c` (those forms are denied too).
- These rules are enforced by deny rules in `.claude/settings.json`; do not try to work around them.
- At the end of each task: show `git status` and propose a Conventional Commit message
  (e.g. `feat(studio): add lower-third component`). Do not run it.

## Rules

- Never create files containing secrets in the working tree, except `.env` (git-ignored).
  Template lives in `.env.example`.
- Follow [docs/licenses.md](docs/licenses.md). Sources marked FORBIDDEN are never used, in any form.
- Before using a new data or media source, add it to `docs/licenses.md` first.
- Wikimedia Commons: check each file's license and record it in `episodes/<slug>/attributions.md`.
- All colors, fonts and spacing come from design tokens only (introduced in step 5).
  No hardcoded visual values in components.

## Overrides for Remotion skills

These rules take precedence over any instructions in `.claude/skills/`.

- **Package runner:** npm/npx only, never bun/bunx (even if a skill shows only bun).
- **Rendering:** every step ends with a rendered artifact (still or MP4) — this overrides
  "don't render unless asked". Do not leave Remotion Studio running in the background;
  the user starts it manually when needed.
- **Map renders:** `--gl=angle` and `--concurrency=1` until benchmarked otherwise (step 1.1).
  Non-map renders may use the config default (2).
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
  prefer the top-level `.claude/skills/<name>/` version.

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
- `npm run lint` — eslint + tsc

Python: run from `pipeline/` with `uv run` only. Never activate the venv manually, never use pip.

- `uv sync` — install/update the environment from `uv.lock`
- `uv run python -m vap.gpu_check` — CUDA check + matmul benchmark (must end with `GPU OK: NVIDIA GeForce RTX 4060`)
- `uv run ruff check .` / `uv run ruff format .` — lint / format
- `uv run pytest` — tests

## Reference docs (read instead of duplicating here)

- [docs/pipeline.md](docs/pipeline.md) — the 8 pipeline stages
- [docs/style-guide.md](docs/style-guide.md) — visual style
- [docs/licenses.md](docs/licenses.md) — source licenses and attribution texts
- [docs/python-env.md](docs/python-env.md) — Python/torch/CUDA stack and model cache
