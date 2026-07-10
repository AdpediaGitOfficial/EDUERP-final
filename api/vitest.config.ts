import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

// NestJS DI relies on decorator metadata, which esbuild (vitest's default
// transformer) does not emit. Route .ts files through the TypeScript compiler.
import ts from "typescript";

const tsconfig = JSON.parse(readFileSync(new URL("./tsconfig.json", import.meta.url), "utf8"));

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    pool: "forks",
  },
  plugins: [
    {
      name: "tsc-decorator-metadata",
      enforce: "pre",
      transform(code, id) {
        if (!id.endsWith(".ts") || id.includes("node_modules")) return null;
        const out = ts.transpileModule(code, {
          compilerOptions: {
            ...tsconfig.compilerOptions,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            sourceMap: false,
          },
          fileName: id,
        });
        return { code: out.outputText, map: null };
      },
    },
  ],
});
