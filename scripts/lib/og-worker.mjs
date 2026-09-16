/* One rendering thread for scripts/gen-og-images.mjs.
 *
 * Each worker owns its own satori instance, its own resvg wasm and its
 * own copy of the corpus. That is the point of the pool: satori is
 * synchronous CPU work, so threads are the only way to use more than
 * one core, and everything it touches is read-only.
 *
 * Protocol: post {ready:true} when able to take work, receive a job
 * (or null to exit), post the result. PNG bytes never cross the thread
 * boundary — the worker writes the file itself. */
import { parentPort, workerData } from "node:worker_threads";
import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";

import { createNodeRenderer, resolveSrcNode } from "./og-node.mjs";

const { site, defaultPng } = workerData;
const renderer = createNodeRenderer();

async function run(job) {
  if (job.t === "default") {
    const png = await renderer.renderPng({ layout: "default" });
    /* Write only on a real change: this file is committed, and an
       identical rewrite would dirty the tree and make check-og-meta
       call the build stale. */
    let old = null;
    try { old = await readFile(defaultPng); } catch { /* first run */ }
    if (old && Buffer.from(png).equals(old)) return { out: "og-default.png" };
    await writeFile(defaultPng, png);
    /* Eleventy already copied the old one into _site; keep them in step
       so the deployed card is the one we just drew. */
    try { await writeFile(join(site, "assets", "img", "og-default.png"), png); } catch { /* no _site yet */ }
    return { out: "og-default.png", wroteDefault: png.length };
  }

  let model;
  if (job.t === "grid") {
    model = { layout: "result", variant: "grid", wpm: job.wpm, wpmLabel: job.label, band: job.band };
  } else {
    const content = await resolveSrcNode(job.src);
    if (!content) throw new Error(`unresolved src ${job.src}`);
    model = { layout: "content", content };
  }
  const png = await renderer.renderPng(model);
  const out = join(site, job.out);
  try {
    await writeFile(out, png);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    mkdirSync(dirname(out), { recursive: true });
    await writeFile(out, png);
  }
  return { out: job.out };
}

parentPort.on("message", async (job) => {
  if (job === null) { parentPort.close(); return; }
  try {
    parentPort.postMessage(await run(job));
  } catch (err) {
    parentPort.postMessage({ out: job.out || job.src, error: String(err && err.message || err) });
  }
});

parentPort.postMessage({ ready: true });
