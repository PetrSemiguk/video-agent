import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const root = path.resolve("..");
const run = (...args: string[]) =>
  spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });

test("the Git policy hook passes its own tests", () => {
  const result = run("--test", ".claude/hooks/git-guard.test.mjs");
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

const steps = (...args: string[]) =>
  run(".claude/skills/run-roadmap/steps.mjs", ...args);
const ids = (out: string) =>
  [...out.matchAll(/^- (\d+\.\d+[a-z]?):/gm)].map((match) => match[1]);

test("/run-roadmap sees the steps of the roadmap, three at most by default", () => {
  expect(ids(steps("4.5").stdout)).toEqual(["4.5", "4.6", "5.1"]);
  expect(ids(steps("5.1", "6.4").stdout)).toEqual([
    "5.1",
    "5.2",
    "5.3",
    "5.3b",
    "5.4",
    "5.4b",
    "5.5",
    "6.1",
    "6.1b",
    "6.2",
    "6.3",
    "6.4",
  ]);
  expect(ids(steps("6.3").stdout)).toEqual(["6.3", "6.4"]);
});

test("/run-roadmap refuses unknown steps and a reversed range", () => {
  expect(steps("9.9").status).toBe(1);
  expect(steps("5.1", "9.9").status).toBe(1);
  expect(steps("5.2", "5.1").status).toBe(1);
  expect(steps().status).toBe(1);
});

test("deny rules still cover what the hook does not", () => {
  const settings = JSON.parse(
    readFileSync(path.join(root, ".claude/settings.json"), "utf8"),
  );
  const deny: string[] = settings.permissions.deny;
  for (const tool of ["Bash", "PowerShell"]) {
    for (const sub of ["push", "merge", "rebase", "reset", "tag", "remote"])
      expect(deny).toContain(`${tool}(git ${sub} *)`);
    expect(deny).toContain(`${tool}(git worktree *)`);
    expect(deny).toContain(`${tool}(git checkout *)`);
    for (const sub of ["add", "commit", "switch"])
      expect(deny).not.toContain(`${tool}(git ${sub} *)`);
  }
  expect(settings.hooks.PreToolUse[0].matcher).toBe("Bash|PowerShell");
  expect(settings.hooks.PreToolUse[0].hooks[0].onFailure).toBe("block");
});
