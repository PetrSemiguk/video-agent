# video-agent

Pipeline for producing English-language geo-history YouTube videos (12–14 min)
built on animated satellite maps with 3D terrain.

Topic → script → TTS voice → word timings → storyboard → Remotion render → final mix → thumbnail.
See [docs/pipeline.md](docs/pipeline.md) for the eight stages.

- `studio/` — Remotion project (video composition)
- `pipeline/` — Python tooling via uv (TTS, whisper, geo scripts)
- `episodes/<slug>/` — per-episode script, facts, storyboard, audio, renders
- [docs/style-guide.md](docs/style-guide.md) — visual style
- [docs/licenses.md](docs/licenses.md) — allowed and forbidden data sources

**Status:** 🚧 Work in progress — step 1 (repository skeleton).
