// PreToolUse guard for the Git policy in AGENTS.md. Runs for both Bash and PowerShell.
//
// Claude Code may stage and commit only on auto/* branches, and may switch only to auto/* or
// main. Deny rules in .claude/settings.json cover the rest (push, merge, reset and so on).
// This is a guardrail against mistakes, not a sandbox: a program that shells out to git on its
// own is out of its reach.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const AUTO_BRANCH = /^auto\/(?!.*\.\.)[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const MAIN = "main";
const READ_ONLY_AGENTS = new Set(["step-reviewer"]);
const WRITES = new Set(["add", "commit"]);
const MOVES = new Set(["switch", "checkout"]);
const PLUMBING = new Set(["commit-tree", "update-ref", "fast-import"]);
const REDIRECTS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
const REDIRECTS_WITH_VALUE = /^--(git-dir|work-tree|namespace)=/;
const INTERPRETER =
  /^(bash|sh|zsh|dash|cmd|powershell|pwsh)(\.exe)?$|^(iex|invoke-expression|wsl|wsl\.exe)$/i;
const ENCODED = /^-e(c|nc|ncodedcommand)?$/i;
const GIT = /(^|[\\/])git(\.exe)?$/i;
const SKIP_WORD =
  /^(if|then|else|elif|fi|do|done|while|until|for|in|time|command|exec|env|sudo|nohup|xargs|try|catch|finally|!)$/i;
const NESTED = /\$\(([^()]*)\)|`([^`]*)`/g;

/** Split a command line into segments of tokens, keeping track of quoted tokens. */
export const segments = (text) => {
  const out = [];
  let tokens = [];
  let word = null;
  let quoted = false;
  let quote = null;
  const endWord = () => {
    if (word !== null) tokens.push({ text: word, quoted });
    word = null;
    quoted = false;
  };
  const endSegment = () => {
    endWord();
    if (tokens.length) out.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      // Only \" and \\ are escapes: a Windows path keeps its backslashes.
      if (c === "\\" && quote === '"' && (text[i + 1] === '"' || text[i + 1] === "\\"))
        word += text[++i];
      else if (c === quote) quote = null;
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      quoted = true;
      word ??= "";
    } else if (";&|(){}\n\r`".includes(c)) {
      endSegment();
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      word = (word ?? "") + c;
    }
  }
  endSegment();
  return out;
};

const parseGit = (args) => {
  let redirected = false;
  let i = 0;
  for (; i < args.length; i++) {
    const arg = args[i];
    if (REDIRECTS.has(arg)) {
      redirected = true;
      i++;
    } else if (REDIRECTS_WITH_VALUE.test(arg)) {
      redirected = true;
    } else if (!arg.startsWith("-")) {
      break;
    }
  }
  return { sub: args[i], rest: args.slice(i + 1), redirected };
};

/** Every git invocation in a command, including nested shells and substitutions. */
export const gitCalls = (command) => {
  const calls = [];
  const visit = (text) => {
    for (const match of text.matchAll(NESTED)) visit(match[1] ?? match[2]);
    for (const tokens of segments(text)) {
      let start = 0;
      while (
        start < tokens.length &&
        (SKIP_WORD.test(tokens[start].text) || /^[A-Za-z_]\w*=/.test(tokens[start].text))
      )
        start++;
      const head = tokens[start];
      if (!head) continue;
      if (INTERPRETER.test(head.text)) {
        const rest = tokens.slice(start + 1);
        if (rest.some((t) => ENCODED.test(t.text))) calls.push({ sub: "encoded-shell", rest: [] });
        rest.filter((t) => t.quoted || !t.text.startsWith("-")).forEach((t) => visit(t.text));
        continue;
      }
      const at = tokens.findIndex(
        (t, i) => i >= start && GIT.test(t.text) && (i === start || !t.quoted),
      );
      if (at >= 0) calls.push(parseGit(tokens.slice(at + 1).map((t) => t.text)));
    }
  };
  visit(command);
  return calls;
};

const isAllowedTarget = (name) => name === MAIN || AUTO_BRANCH.test(name);

const moveProblem = ({ sub, rest }) => {
  const args = rest.filter((a) => a !== "-q" && a !== "--quiet");
  const createFlags = sub === "switch" ? ["-c", "--create"] : ["-b"];
  if (createFlags.includes(args[0])) {
    const [, name, from, ...extra] = args;
    if (!name || !AUTO_BRANCH.test(name))
      return `git ${sub} may only create auto/* branches, not ${name ?? "(none)"}`;
    if (extra.length || (from !== undefined && from !== MAIN))
      return `git ${sub}: a new auto/* branch may only start from ${MAIN}`;
    return null;
  }
  if (args.length !== 1 || args[0].startsWith("-") || !isAllowedTarget(args[0]))
    return `git ${sub} is allowed only to reach ${MAIN} or an auto/* branch: ${rest.join(" ")}`;
  return null;
};

const branchProblem = ({ rest }) => {
  const changing = rest.find((a) =>
    ["-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-f", "--force"].includes(
      a,
    ),
  );
  if (changing) return `git branch ${changing} is forbidden by the Git policy`;
  const listing = rest.some((a) => ["--list", "-l"].includes(a));
  const named = rest.some((a) => !a.startsWith("-"));
  return named && !listing ? "git branch may only list; use git switch -c auto/<name>" : null;
};

/** Why a command must not run on this branch, or null. Pure, so it can be tested. */
export const decide = (command, branch, agentType) => {
  const calls = gitCalls(command);
  if (calls.some((c) => c.sub === "encoded-shell"))
    return "An encoded shell command cannot be checked against the Git policy";
  const guarded = calls.filter(
    (c) => WRITES.has(c.sub) || MOVES.has(c.sub) || c.sub === "branch" || PLUMBING.has(c.sub),
  );
  if (!guarded.length) return null;
  const changing = guarded.filter((c) => c.sub !== "branch" || branchProblem(c));
  if (READ_ONLY_AGENTS.has(agentType) && changing.length)
    return `${agentType} is read-only: it may not run git ${changing[0].sub}`;
  const redirected = guarded.find((c) => c.redirected);
  if (redirected)
    return `git ${redirected.sub} with -C, -c or --git-dir is forbidden by the Git policy`;
  const plumbing = guarded.find((c) => PLUMBING.has(c.sub));
  if (plumbing) return `git ${plumbing.sub} is forbidden by the Git policy`;
  const hasWrite = guarded.some((c) => WRITES.has(c.sub));
  if (hasWrite && guarded.some((c) => MOVES.has(c.sub)))
    return "Run git switch and git add or commit as separate commands, so the branch can be checked";
  for (const call of guarded) {
    if (MOVES.has(call.sub)) {
      const problem = moveProblem(call);
      if (problem) return problem;
    } else if (call.sub === "branch") {
      const problem = branchProblem(call);
      if (problem) return problem;
    } else {
      if (!branch || !branch.startsWith("auto/"))
        return `git ${call.sub} is allowed only on auto/* branches; the current branch is ${branch || "detached HEAD"}`;
      if (call.sub === "commit" && call.rest.includes("--amend"))
        return "git commit --amend rewrites history, which the Git policy forbids";
    }
  }
  return null;
};

const currentBranch = (cwd) =>
  execFileSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

const main = () => {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const command = payload.tool_input?.command ?? "";
  let branch = "";
  try {
    branch = currentBranch(payload.cwd);
  } catch {
    // Detached HEAD or not a repository: treated as "not an auto/* branch".
  }
  const problem = decide(command, branch, payload.agent_type);
  if (problem) {
    process.stderr.write(`Blocked by the Git policy (see AGENTS.md): ${problem}\n`);
    process.exit(2);
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`git-guard failed, so the command is blocked: ${error.message}\n`);
    process.exit(2);
  }
}
