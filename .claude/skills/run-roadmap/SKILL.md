---
name: run-roadmap
description: Run steps of docs/roadmap.md autonomously, each reviewed by step-reviewer and committed to an auto/* branch.
argument-hint: <from> [to]
disable-model-invocation: true
allowed-tools: Bash(node *steps.mjs *)
---

Run the roadmap steps below, in order, with no further instructions. Arguments: `$ARGUMENTS`.

## Steps in this run

!`node "${CLAUDE_SKILL_DIR}/steps.mjs" $ARGUMENTS`

Without `[to]` a run is at most three steps. With `[to]` it is the whole range.

## Before the first step

1. `git status --short` must be empty. Otherwise stop (see "Stopping").
2. The branch is `auto/<YYYY-MM-DD>-<from>`, with today's date and the first step's id:
   - Already on it: continue.
   - It exists: `git switch <branch>`.
   - On `main`: `git switch -c <branch> main`.
   - On a different `auto/*` branch: stop and ask. Later steps may need its unmerged commits, and
     only the owner merges.

## For each step

1. Do the step by section 0 "Protocol" of `docs/roadmap.md`, and only that step.
2. Run the `step-reviewer` subagent. Its whole prompt is the step id, nothing else: it must not hear
   how the work went.
3. Act on the verdict:
   - `FAIL`: fix each finding, then run `step-reviewer` again. At most two rounds of fixes. If it still
     fails, stop.
   - `PASS WITH NOTES`: fix what is cheap and inside the step. Keep the rest in the report.
   - `PASS`: go on.
4. Write `docs/reports/<step>.md` by the protocol, with the reviewer's last verdict quoted in full,
   its rounds, and which notes stayed open.
5. Confirm the reviewer left nothing behind: `git status --short` shows only this step's files.
6. Commit, as separate commands, not joined with `&&`: `git add -A`, then
   `git commit -m "<type>(<scope>): <summary>"`. Use Conventional Commits, with no trailers.
7. Next step.

Never push, merge, rebase, reset, amend or delete a branch. A hook blocks most of this, but do not
try to get around a block: a block means stop and report it.

## Stopping

Stop at once, without committing unfinished work, on any of these:

- an item marked **USER DECISION**;
- `FAIL` after two rounds of fixes;
- a license that is unclear or contradicts itself;
- a download over 2 GB;
- a hook or deny rule blocking something the step needs;
- a dirty tree before starting;
- the end of the range.

Then rewrite `docs/reports/_inbox.md` (ignored by git, so it never dirties the tree):

```markdown
# Inbox — <date and time>

**Stopped at:** step <id>: <reason in one line>

## What I need from you
<The decision. Options with their trade-offs, then my recommendation.>

## Look at
- <exact paths of the files, renders and audio to check>

## Ready to merge
<Branch name. Commits as `hash subject`. Or "nothing yet".>

## Not committed
<Files left in the tree and why. Or "nothing".>
```

The final message of the run is this inbox file's summary in Russian: what was done, what is needed.
