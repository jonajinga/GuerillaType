import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

// Read at CONFIG time and inject as a binding -- the pool's supported way
// to get schema into each test's isolated database.
const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      isolatedStorage: true,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          GOOGLE_CLIENT_ID: "test-google-id",
          GOOGLE_CLIENT_SECRET: "test-google-secret",
          GITHUB_CLIENT_ID: "test-github-id",
          GITHUB_CLIENT_SECRET: "test-github-secret",
        },
      },
    }),
  ],
  test: { setupFiles: ["./test/applyMigrations.ts"] },
});
