// Reuse the installed TypeScript compiler; no additional runner dependency.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(
      fs.readFileSync(filename, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2020,
        },
      },
    );
    module._compile(outputText, filename);
  };
}
const root = path.resolve(__dirname, "../..");
const { storyboardSchema } = require("../src/storyboard/schema.ts");
const { exportStoryboardSchema } = require("../src/storyboard/jsonSchema.ts");
const args = process.argv.slice(2);
if (args[0] === "export" && args.length === 1) {
  const target = path.join(root, "docs/storyboard.schema.json");
  fs.writeFileSync(
    target,
    JSON.stringify(exportStoryboardSchema(), null, 2) + "\n",
    "utf8",
  );
  console.log("Exported docs/storyboard.schema.json");
} else if (
  args[0] === "validate" &&
  args[1] &&
  args.length <= 3 &&
  (args.length === 2 || args[2] === "--check-files")
) {
  const filename = path.resolve(args[1]);
  const issues = [];
  let data;
  try {
    const input = JSON.parse(
      fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""),
    );
    const parsed = storyboardSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          path:
            "$" +
            issue.path
              .map((v) => (typeof v === "number" ? `[${v}]` : `.${String(v)}`))
              .join(""),
          message: issue.message,
        });
      }
    } else data = parsed.data;
    if (data && args.includes("--check-files")) {
      for (const [at, file] of [
        ["$.audio.src", data.audio.src],
        ["$.audio.words", data.audio.words],
        ...data.plates.map((p, i) => [
          `$.plates[${i}].name`,
          `studio/public/plates/${p.name}.json`,
        ]),
      ]) {
        if (!fs.existsSync(path.join(root, file)))
          issues.push({ path: at, message: `Missing local file: ${file}` });
      }
      if (!issues.length) {
        const words = JSON.parse(
          fs.readFileSync(path.join(root, data.audio.words), "utf8"),
        );
        const hash = crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(root, data.audio.src)))
          .digest("hex");
        if (words.complete !== true || words.audio_sha256 !== hash)
          issues.push({
            path: "$.audio.words",
            message:
              "Word alignment must be complete and reference this exact WAV hash",
          });
      }
    }
  } catch (error) {
    issues.push({ path: "$", message: error.message });
  }
  const report = {
    valid: issues.length === 0,
    file: path.relative(root, filename).replaceAll("\\", "/"),
    schemaVersion: data?.schemaVersion ?? null,
    shots: data?.shots.length ?? 0,
    issues,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} else {
  console.error(
    "Usage: node scripts/storyboard.cjs export | validate <file> [--check-files]",
  );
  process.exitCode = 2;
}
