// Lists the roadmap steps of a /run-roadmap call: node steps.mjs <from> [to]
// Without [to] a run holds at most DEFAULT_LIMIT steps. Exits 1 on an unknown step id.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LIMIT = 3;
const HEADING = /^#{2,3} Step (\d+\.\d+) — (.+)$/gm;

export const parseSteps = (text) =>
  [...text.matchAll(HEADING)].map((match) => ({ id: match[1], title: match[2].trim() }));

export const selectSteps = (steps, from, to) => {
  const start = steps.findIndex((step) => step.id === from);
  if (start < 0) throw new Error(`Unknown step: ${from}`);
  if (to === undefined) return steps.slice(start, start + DEFAULT_LIMIT);
  const end = steps.findIndex((step) => step.id === to);
  if (end < 0) throw new Error(`Unknown step: ${to}`);
  if (end < start) throw new Error(`Step ${to} comes before ${from}`);
  return steps.slice(start, end + 1);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const roadmap = readFileSync(path.join(here, "../../../docs/roadmap.md"), "utf8");
  const steps = parseSteps(roadmap);
  const [from, to] = process.argv.slice(2);
  if (!from) {
    console.error(`Usage: /run-roadmap <from> [to]. Steps: ${steps.map((s) => s.id).join(" ")}`);
    process.exit(1);
  }
  try {
    for (const step of selectSteps(steps, from, to)) console.log(`- ${step.id}: ${step.title}`);
  } catch (error) {
    console.error(`${error.message}. Steps: ${steps.map((s) => s.id).join(" ")}`);
    process.exit(1);
  }
}
