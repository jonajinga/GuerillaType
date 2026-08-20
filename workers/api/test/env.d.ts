/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { Env as AppEnv } from "../src/env.js";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

/* Graft the hand-written Env onto the ambient Cloudflare.Env rather than
   generating types with `wrangler types`, so what a test sees and what a
   handler sees cannot drift apart. */
declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
