// Run with `node --test .claude/hooks/git-guard.test.mjs`; `npm test` in studio/ runs it too.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { decide } from "./git-guard.mjs";

const AUTO = "auto/2026-11-05-4.6";

const blocked = (command, branch = "main", agent) =>
  assert.ok(decide(command, branch, agent), `expected a block: ${command} on ${branch}`);
const allowed = (command, branch = "main", agent) =>
  assert.equal(decide(command, branch, agent), null, `expected to pass: ${command} on ${branch}`);

test("add and commit only on auto/* branches", () => {
  for (const command of ["git add .", "git add -A", 'git commit -m "x"', "git commit --dry-run"]) {
    blocked(command, "main");
    blocked(command, "feature");
    blocked(command, "");
    allowed(command, AUTO);
  }
});

test("git hidden behind shell syntax is still seen, on both shells", () => {
  for (const command of [
    'cd studio && git commit -m "x"',
    'npm test; git commit -m "x"',
    'npm test; if ($?) { git commit -m "x" }',
    'git --no-pager commit -m "x"',
    'GIT_AUTHOR_NAME=x git commit -m "x"',
    '& git commit -m "x"',
    'git.exe commit -m "x"',
    '"C:\\Program Files\\Git\\bin\\git.exe" commit -m "x"',
    'bash -c "git commit -m x"',
    "powershell -Command \"git commit -m x\"",
    'cmd /c "git commit -m x"',
    "echo $(git commit -m x)",
    'echo "$(git commit -m x)"',
    "echo `git commit -m x`",
    "find . -name x | xargs git add",
    "Invoke-Expression 'git commit -m x'",
  ])
    blocked(command);
});

test("text that merely mentions git is not a command", () => {
  for (const command of [
    'grep -n "git commit" AGENTS.md',
    'echo "git add ."',
    "cat docs/automation.md",
    "npm test",
    "git status --short",
    "git log --oneline -n 3",
    "git diff HEAD",
    "git branch --show-current",
    "git branch -vv",
    "git branch --list auto/*",
  ])
    allowed(command);
});

test("a commit message may contain anything", () => {
  allowed('git commit -m "docs: never run git push; git reset && rm -rf"', AUTO);
  blocked('git commit -m "docs: mention of auto/x"', "main");
});

test("switching reaches only main and auto/*", () => {
  for (const command of [
    "git switch main",
    `git switch ${AUTO}`,
    `git switch -c ${AUTO}`,
    `git switch -c ${AUTO} main`,
    `git switch --create ${AUTO} main`,
    `git switch -q ${AUTO}`,
    `git checkout -b ${AUTO}`,
    "git checkout main",
    `git checkout ${AUTO}`,
  ])
    allowed(command);
  for (const command of [
    "git switch develop",
    "git switch -c feature/x",
    `git switch -c ${AUTO} develop`,
    `git switch -C ${AUTO}`,
    `git switch --force-create ${AUTO}`,
    "git switch --discard-changes main",
    "git switch -f main",
    "git switch --detach main",
    "git switch --orphan auto/x",
    "git switch -",
    "git switch auto/",
    "git switch auto/../main",
    "git checkout -- file.txt",
    "git checkout .",
    "git checkout main -- file.txt",
    "git checkout -f main",
    `git checkout -B ${AUTO}`,
    "git checkout HEAD~1",
  ])
    blocked(command);
});

test("a switch and a write cannot share one command", () => {
  blocked(`git switch main && git commit -m x`, AUTO);
  blocked(`git switch -c ${AUTO}; git add .`, "main");
});

test("redirecting git and plumbing are refused", () => {
  blocked("git -C ../other commit -m x", AUTO);
  blocked("git -c user.name=x commit -m x", AUTO);
  blocked("git --git-dir=.git add .", AUTO);
  blocked("git commit-tree abc -m x", AUTO);
  blocked("git update-ref refs/heads/main abc", AUTO);
});

test("history rewriting and branch changes are refused, even on auto/*", () => {
  blocked("git commit --amend -m x", AUTO);
  for (const command of [
    "git branch -d auto/x",
    "git branch -D auto/x",
    "git branch --delete auto/x",
    "git branch -m auto/x",
    "git branch -f main abc",
    "git branch auto/x",
  ])
    blocked(command, AUTO);
});

test("encoded shells cannot be read, so they are refused", () => {
  blocked("powershell -EncodedCommand ZwBpAHQA", AUTO);
  blocked("pwsh -enc ZwBpAHQA", AUTO);
});

test("the reviewer cannot change anything, wherever it runs", () => {
  for (const command of ["git add .", "git commit -m x", `git switch ${AUTO}`, "git branch -d x"])
    blocked(command, AUTO, "step-reviewer");
  for (const command of ["git status", "git diff HEAD", "git log -n 3", "git branch --show-current"])
    allowed(command, AUTO, "step-reviewer");
  allowed("git add .", AUTO, "another-agent");
});

const script = fileURLToPath(new URL("./git-guard.mjs", import.meta.url));
const runHook = (input) =>
  spawnSync(process.execPath, [script], { input, encoding: "utf8" });

test("the hook process blocks with exit code 2 and says why", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "guard-"));
  try {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const payload = (command) =>
      JSON.stringify({ cwd: dir, tool_name: "Bash", tool_input: { command } });
    const denied = runHook(payload('git commit -m "x"'));
    assert.equal(denied.status, 2);
    assert.match(denied.stderr, /only on auto/);
    assert.equal(runHook(payload("npm test")).status, 0);
    spawnSync("git", ["switch", "-q", "-c", "auto/test"], { cwd: dir });
    assert.equal(runHook(payload('git commit -m "x"')).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the hook fails closed on input it cannot read", () => {
  const result = runHook("not json");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /blocked/);
});
