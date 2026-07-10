// PM2 process configuration for the Greenwood School ERP.
// Usage: pm2 start ecosystem.config.cjs [--env production]
// The app is the self-contained nitro build in .output/ (run `bun run build` first).
// Environment variables are read from the shell / PM2 env — copy .env.example to .env
// and either `pm2 start ecosystem.config.cjs --update-env` after `export $(cat .env | xargs)`,
// or fill the env block below.
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
        // SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY are
        // read from the environment; set them here or export before starting PM2.
      },
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
