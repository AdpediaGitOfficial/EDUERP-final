import { defineConfig, devices } from "@playwright/experimental-ct-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Component tests for pure-UI components (no backend). Renders the real React
 * component in a real browser so layout-dependent behaviour — like the
 * responsive tab-bar overflow — is exercised, not mocked.
 */
export default defineConfig({
  testDir: "./tests-ct",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    trace: "on-first-retry",
    // PW_CHROME lets a dev point at a pre-installed Chromium; CI installs its own.
    ...(process.env.PW_CHROME ? { launchOptions: { executablePath: process.env.PW_CHROME } } : {}),
    ctViteConfig: {
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          "@": `${process.cwd()}/src`,
          // Swap the router for a lightweight stub (Link + useLocation only).
          "@tanstack/react-router": `${process.cwd()}/tests-ct/router-stub.tsx`,
        },
      },
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
