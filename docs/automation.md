# Autonomous runs

`/run-roadmap` works through steps of [roadmap.md](roadmap.md) on an `auto/*` branch. An independent
reviewer checks each step, each passed step gets a local commit, and nothing reaches `main` or the
remote until you merge it.

## Start a run

In Claude Code, from the repo root on a clean tree:

```
/run-roadmap 4.6          the step and up to two after it
/run-roadmap 5.1 5.5      exactly this range
```

The steps it would run are listed by `node .claude/skills/run-roadmap/steps.mjs 4.6`.

**Permission mode.** A run stops at every permission prompt until someone answers. Auto mode (Shift+Tab
in the CLI) avoids most of them, and you can answer the rest from your phone. Deny rules and the Git hook
apply in every mode. Avoid `bypassPermissions` outside an isolated machine.

**What stops a run:** a USER DECISION, FAIL after two rounds of fixes, an unclear license, a download over
2 GB, a hook or deny rule in the way, or the end of the range.

## What the parts do

| Part | File | Job |
|---|---|---|
| Reviewer | `.claude/agents/step-reviewer.md` | Gets only a step id, checks everything from scratch, answers PASS, PASS WITH NOTES or FAIL |
| Run loop | `.claude/skills/run-roadmap/` | Branch, step, review, report, commit, next |
| Git guard | `.claude/hooks/git-guard.mjs` | Blocks `git add` and `commit` off `auto/*`, and any switch except to `auto/*` or `main` |
| Deny rules | `.claude/settings.json` | Block push, merge, reset, rebase, tag, worktree and the rest in every mode |
| Notifications | `.claude/hooks/notify.ps1` | Windows toast when Claude needs you or finishes a turn |

The guard catches mistakes; it is not a sandbox. A script that shells out to git by itself is out of its
reach. `git checkout` stays denied by a rule, so runs use `git switch`.

## Read the inbox

When a run stops, it rewrites `docs/reports/_inbox.md`. Git ignores this file, and each run replaces it.

| Section | Meaning |
|---|---|
| Stopped at | The step, and why |
| What I need from you | The decision, its options and a recommendation |
| Look at | Exact paths of the renders, audio and files to check |
| Ready to merge | The branch and its commits |
| Not committed | Unfinished work left in the tree. The next run refuses to start until it is dealt with |

Each step's full result, with the reviewer's verdict, is in `docs/reports/<step>.md`.

## Merge a branch

Look over the work first, then from the repo root:

```powershell
git switch main
git log --oneline main..auto/2026-11-05-4.6
git diff --stat main...auto/2026-11-05-4.6
git merge --ff-only auto/2026-11-05-4.6
git push
```

`--ff-only` refuses if `main` has moved. In that case, update the branch yourself or ask for the step to
be rerun. Delete the branch when you no longer need it: `git branch -d auto/2026-11-05-4.6`.

## Follow from your phone

**Remote Control** continues the session on this machine from the Claude app or
[claude.ai/code](https://claude.ai/code). It needs a Pro, Max, Ultra, Team or Enterprise plan with a
claude.ai login; API keys do not work. Code still runs here, so this computer must stay on and awake.

1. Start it with `claude --remote-control "video-agent"`, or run `/remote-control` in a running session.
2. Open the shown URL, or scan the QR code, in the Claude app. The session is also in the session list.
3. To connect every session, run `/config` and turn on **Enable Remote Control for all sessions**.

**Push notifications** need Remote Control to be active:

1. Install the Claude app for iOS or Android, and sign in with the same account and organization.
2. Allow notifications when the system asks.
3. In the terminal, run `/config` and turn on **Push when actions required** (permission prompts and
   questions), and **Push when Claude decides** (long tasks finishing) if you want those too.

If `/config` shows **No mobile registered**, open the app on the phone and reconnect. Pushes are skipped
while you are typing in or focused on the connected terminal. On iOS, Focus modes can delay them.

Details: [Remote Control](https://code.claude.com/docs/en/remote-control).

## Desktop notifications

The `Notification` and `Stop` hooks show a Windows toast. If none appears, check Windows notification
settings and Focus Assist. To try it by hand from the repo root:

```powershell
'{"hook_event_name":"Notification","title":"Test","message":"It works"}' | powershell -NoProfile -ExecutionPolicy Bypass -File .claude\hooks\notify.ps1
```
