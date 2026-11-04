import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { plateLookJson, type } from "./tokens";

test("production typography respects the 1080p minimum and selected family", () => {
  for (const size of Object.values(type.size))
    expect(size).toBeGreaterThanOrEqual(26);
  expect(type.headlineFamily).toBe("Barlow Condensed");
  expect(JSON.parse(plateLookJson).hillshade).toBe(0.65);
});

test("render components contain no literal colors or pixel dimensions outside tokens/debug", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(file) : [file];
    });
  const files = walk(path.resolve("src")).filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !/tokens\.ts$|\.test\.|Debug|Check|[/\\]qa[/\\]/.test(file),
  );
  for (const file of files) {
    expect(readFileSync(file, "utf8"), file).not.toMatch(
      /#[\da-fA-F]{3,8}\b|rgba?\(|\b\d+(?:\.\d+)?px\b/,
    );
  }
});
