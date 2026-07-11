// PM2 process configuration for the Greenwood School ERP.
// Usage: pm2 start ecosystem.config.cjs [--env production]
//
// Two processes:
//   greenwood-erp  — the web SSR app (self-contained nitro build in .output/;
//                    run `bun run build` first).
//   greenwood-api  — the NestJS API (api/dist; run `cd api && npm ci && npm run build`
//                    and `npx prisma generate` first). Nginx routes /api/* here.
//
// Environment variables are read from the shell / PM2 env. Copy .env.example -> .env
// (web) and api/.env.example -> api/.env (API), then either export them before
// `pm2 start ecosystem.config.cjs --update-env`, or fill the env blocks below.
module.exports = {
  apps: [
    {
      name: "greenwood-erp",
      script: ".output/server/index.mjs",
      // The nitro node-server is a single-threaded event loop; cluster mode gives
      // one worker per CPU with zero code changes.
      exec_mode: "cluster",
      instances: "max",
      max_memory_restart: "512M",
      // Zero-downtime reloads: wait for the port to be listening before switching.
      wait_ready: false,
      listen_timeout: 8000,
      kill_timeout: 6000,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Browser calls the API same-origin via /api (Nginx proxies it); build the
        // web bundle with VITE_API_URL=/api (default). No secrets needed here.
      },
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "greenwood-api",
      cwd: "./api", // so the generated Prisma client + node_modules resolve
      script: "dist/main.js",
      // Stateless JWT API; cluster mode scales it, but each worker opens its own
      // Prisma pool — keep instances modest so total connections stay under the
      // Postgres limit. Bump as needed.
      exec_mode: "cluster",
      instances: 2,
      max_memory_restart: "512M",
      listen_timeout: 8000,
      kill_timeout: 6000,
      env: {
        NODE_ENV: "production",
        API_PORT: 3001, // the API reads API_PORT (default 3001)
        // Set (or export) before starting PM2 — see api/.env.example:
        //   DATABASE_URL  — Postgres connection string
        //   JWT_SECRET    — signing secret for access/refresh/recovery tokens
        //   WEB_ORIGIN    — public origin, e.g. https://erp.example.com (CORS + reset links)
      },
      out_file: "logs/api-out.log",
      error_file: "logs/api-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
