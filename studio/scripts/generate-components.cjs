// Local TS/TSX loading for documentation generation; no new runtime dependency.
const fs = require("node:fs");
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
const { renderComponentCatalog } = require("../src/components/catalog.ts");
fs.writeFileSync("../docs/components.md", renderComponentCatalog());
console.log("Generated docs/components.md");
