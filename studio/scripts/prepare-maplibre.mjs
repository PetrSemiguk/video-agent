// Copies the MapLibre worker bundle into public/maplibre/ (git-ignored) so the map loads it
// locally via staticFile() instead of from a CDN. Run after `npm install` / maplibre upgrades.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("maplibre-gl/package.json"));
const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "maplibre",
);
mkdirSync(outDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs"]) {
  copyFileSync(join(pkgDir, "dist", file), join(outDir, file));
  console.log(`copied ${file} -> public/maplibre/`);
}
