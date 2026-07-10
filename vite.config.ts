import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // src/server.ts wraps the framework server entry so catastrophic SSR
      // errors render a friendly page instead of a raw 500.
      // (Per-route code splitting is on by default: each route file becomes its
      // own lazy-loaded chunk, so the role panels don't ship as one payload.)
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    // Server build target. `node-server` produces a self-contained Node app in
    // .output/ (run with `node .output/server/index.mjs`) — deployable to any
    // host or the provided Dockerfile. Swap the preset to target other platforms
    // (e.g. "vercel", "netlify", "cloudflare-module").
    ...(command === "build" ? [nitro({ preset: process.env.NITRO_PRESET || "node-server" })] : []),
    viteReact(),
  ],
  // Vite only runs Lightning CSS at build time by default; using it in dev too
  // keeps the dev preview and production CSS pipeline identical.
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    ignoreOutdatedRequests: true,
  },
  server: { host: "::", port: 8080 },
}));
