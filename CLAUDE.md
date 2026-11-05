@AGENTS.md

## Claude Code specifics

- `.claude/` contains project settings (permissions, hooks), agents, and skills.
- The Git policy in `AGENTS.md` is enforced by `.claude/hooks/git-guard.mjs` and deny rules in
  `.claude/settings.json`. Do not change or work around them unless the user explicitly asks.
- `.claude/skills/` contains official Remotion Agent Skills from `remotion-dev/skills`.
  The overrides in `AGENTS.md` take precedence. When nested duplicate skills conflict,
  prefer the top-level `.claude/skills/<name>/` version.
