import { DateTime } from "luxon";
import fs from "node:fs";
import path from "node:path";
import pluginRss from "@11ty/eleventy-plugin-rss";
import pluginTinyHtml from "@sardine/eleventy-plugin-tinyhtml";
import Image from "@11ty/eleventy-img";
import * as lightningcss from "lightningcss";

/* OneDrive + Eleventy race-condition guard. On Windows with this
   project sitting inside a OneDrive-synced folder, OneDrive
   occasionally holds a handle on `_site/library/<slug>/` between
   our prebuild mkdir and 11ty's parallel writeFileSync for the
   paginated library pages -- the write fails with ENOENT despite
   the dir having been created seconds earlier. Patch fs.writeFileSync
   to mkdir the parent and retry on ENOENT. Pure no-op when there's
   no race. */
{
  const _origWrite = fs.writeFileSync;
  fs.writeFileSync = function patched(target, data, opts) {
    try {
      return _origWrite.call(fs, target, data, opts);
    } catch (e) {
      if (e && e.code === "ENOENT" && typeof target === "string") {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            return _origWrite.call(fs, target, data, opts);
          } catch (e2) {
            if (attempt === 3 || (e2 && e2.code !== "ENOENT")) throw e2;
            // brief backoff before retry to let OneDrive release the lock
            const wait = Date.now() + 60 * (attempt + 1);
            while (Date.now() < wait) {}
          }
        }
      }
      throw e;
    }
  };
}

const CSS_DIR = "src/assets/css/partials";
const CSS_ENTRY = "src/assets/css/global.css";

const CSS_ORDER = [
  "reset.css",
  "tokens.css",
  "fonts.css",
  "base.css",
  "typography.css",
  "utilities.css",
  "layout.css",
  "nav.css",
  "footer.css",
  "components/buttons.css",
  "components/forms.css",
  "components/cards.css",
  "components/tabs.css",
  "components/badges.css",
  "components/dialog.css",
  "components/toast.css",
  "components/theme-toggle.css",
  "components/profile-switcher.css",
  "components/typing-surface.css",
  "components/live-stats.css",
  "components/results-card.css",
  "components/practice-bar.css",
  "components/site-search.css",
  "components/keyboard.css",
  "components/chart.css",
  "components/contribution-grid.css",
  "components/progress-ring.css",
  "components/uploader.css",
  "components/changelog.css",
  "components/shortcuts-overlay.css",
  "components/streak-chip.css",
  "components/info-modal.css",
  "components/toc.css",
  "components/hero.css",
  "components/breadcrumbs.css",
  "components/tippy.css",
  "components/live-aids.css",
  "components/virtual-keyboard.css",
  "pages/game.css",
  "pages/games.css",
  "pages/home.css",
  "pages/article.css",
  "pages/practice.css",
  "pages/lessons.css",
  "pages/challenges.css",
  "pages/drills.css",
  "pages/custom.css",
  "pages/stats.css",
  "pages/settings.css",
  "pages/legal.css",
  "pages/404.css",
  "pages/quotes.css",
  "pages/library.css",
  "pages/wordlists.css",
  "pages/contribute.css",
  "pages/blog.css",
  "pages/analytics.css",
  "pages/community-stats.css",
  "components/analytics-charts.css",
  "print.css",
];

export default function (eleventyConfig) {
  // Passthrough
  eleventyConfig.addPassthroughCopy("src/assets/img");
  eleventyConfig.addPassthroughCopy("src/assets/fonts");
  eleventyConfig.addPassthroughCopy("src/assets/js");
  // src/data -> _site/data. The default 11ty passthrough uses
  // @11ty/recursive-copy which races against OneDrive's sync locks
  // and emits cryptic "Benchmark after() without a before()" errors.
  // fs.cpSync (Node 16.7+) is sync, atomic per file, and noticeably
  // faster on this ~290-book directory. Wrapped in a single
  // eleventy.before hook so it runs before pagination starts.
  eleventyConfig.on("eleventy.before", () => {
    try {
      const src = path.resolve("src/data");
      const dest = path.resolve("_site/data");
      if (!fs.existsSync(src)) return;
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true, force: true });
    } catch (e) {
      console.warn("[passthrough] src/data copy failed:", e.message);
    }
  });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects" });
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.addPassthroughCopy({ "src/humans.txt": "humans.txt" });

  // Plugins
  eleventyConfig.addPlugin(pluginRss);
  if (process.env.NODE_ENV !== "development") {
    eleventyConfig.addPlugin(pluginTinyHtml);
  }

  // CSS concatenation + minification
  eleventyConfig.addTemplateFormats("css");
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    compile: function (_inputContent, inputPath) {
      const resolved = path.resolve(inputPath);
      if (resolved !== path.resolve(CSS_ENTRY)) return;
      return async () => {
        const concatenated = CSS_ORDER.map((partial) => {
          const full = path.join(CSS_DIR, partial);
          if (!fs.existsSync(full)) return "";
          return `/* ${partial} */\n${fs.readFileSync(full, "utf8")}\n`;
        }).join("\n");
        if (process.env.NODE_ENV === "development") return concatenated;
        try {
          const result = lightningcss.transform({
            filename: "global.css",
            code: Buffer.from(concatenated),
            minify: true,
            sourceMap: false,
          });
          return result.code.toString("utf8");
        } catch (err) {
          console.warn("[lightningcss] minify failed:", err?.message || err);
          return concatenated;
        }
      };
    },
  });

  // Cache-bust
  // Single build hash shared by both the cssVersion global (used in
  // HTML template paths) AND the post-build JS-import versioner
  // (rewrites every static + dynamic JS import to carry the same
  // ?v=HASH). Same value = HTML and JS module URLs reach Cloudflare
  // as a coherent set; new build = new hash = no possibility of a
  // stale module landing in a fresh module chain.
  const BUILD_VERSION = String(Date.now());
  eleventyConfig.addGlobalData("cssVersion", () => BUILD_VERSION);

  // Expose the build version to post-build scripts (postbuild npm
  // hook). The versioner runs as a separate process AFTER 11ty's
  // passthrough copies have settled -- in-eleventy `eleventy.after`
  // fires too early; the JS files aren't on disk yet.
  eleventyConfig.on("eleventy.after", async () => {
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile("_site/.build-version", BUILD_VERSION);
    } catch {}
  });
  eleventyConfig.addGlobalData("buildDate", () => new Date().toISOString().slice(0, 10));

  // Date filters
  eleventyConfig.addFilter("year", () => new Date().getUTCFullYear());
  eleventyConfig.addFilter("readableDate", (date) =>
    DateTime.fromJSDate(new Date(date), { zone: "utc" }).toFormat("LLLL d, yyyy")
  );
  eleventyConfig.addFilter("shortDate", (date) =>
    DateTime.fromJSDate(new Date(date), { zone: "utc" }).toFormat("LLLL d, yyyy")
  );
  eleventyConfig.addFilter("htmlDateString", (date) =>
    DateTime.fromJSDate(new Date(date), { zone: "utc" }).toISODate()
  );
  eleventyConfig.addFilter("isoDate", (date) =>
    DateTime.fromJSDate(new Date(date), { zone: "utc" }).toISO()
  );

  // Content filters
  eleventyConfig.addFilter("head", (arr, n) => {
    if (!Array.isArray(arr)) return arr;
    return n < 0 ? arr.slice(n) : arr.slice(0, n);
  });
  eleventyConfig.addFilter("limit", (arr, n) =>
    Array.isArray(arr) ? arr.slice(0, n) : arr
  );
  eleventyConfig.addFilter("striptags", (str) =>
    String(str || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
  );
  eleventyConfig.addFilter("truncate", (str, n = 160, suffix = "…") => {
    const s = String(str || "");
    if (s.length <= n) return s;
    const cut = s.slice(0, n);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:!?]+$/, "") + suffix;
  });
  eleventyConfig.addFilter("selectattr", (arr, attr, value) => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter((item) => {
      const v = item?.data?.[attr] ?? item?.[attr];
      return value === undefined ? !!v : v === value;
    });
  });
  eleventyConfig.addFilter("where", (arr, attr, value) => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter((item) => {
      const v = item?.data?.[attr] ?? item?.[attr];
      return v === value;
    });
  });
  eleventyConfig.addFilter("slugify", (str) =>
    String(str || "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
  );
  eleventyConfig.addFilter("formatDuration", (sec) => {
    const s = Number(sec) || 0;
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
  });
  eleventyConfig.addFilter("wordlistSize", (id, lists) => {
    if (!lists || !id) return 0;
    return lists[id]?.size || 0;
  });
  eleventyConfig.addFilter("startsWith", (str, prefix) =>
    Boolean(str && String(str).startsWith(prefix))
  );
  // Approximate reading time in minutes -- 225 wpm avg adult reader.
  eleventyConfig.addFilter("readingTime", (str) => {
    const words = String(str || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 225));
  });

  // Used by JSON-LD partial: build BreadcrumbList items from a URL path.
  // Returns an array of { position, name, item } -- caller prepends the
  // Home item. Last segment has no `item` field (current page).
  eleventyConfig.addFilter("breadcrumbItems", (url, pageTitle, siteUrl) => {
    if (!url || url === "/") return [];
    const stripped = String(url).replace(/\/$/, "");
    const segs = stripped.split("/").filter(Boolean);
    let acc = "";
    return segs.map((seg, i) => {
      acc += "/" + seg;
      const isLast = i === segs.length - 1;
      return {
        position: i + 2,
        name: isLast ? (pageTitle || seg.replace(/-/g, " ")) : seg.replace(/-/g, " "),
        item: isLast ? null : siteUrl + acc + "/",
      };
    });
  });

  // Strip an array of any item equal to `val`. Drop-in for jinja2 reject.
  eleventyConfig.addFilter("without", (arr, val) =>
    Array.isArray(arr) ? arr.filter((x) => x !== val) : arr
  );

  // JSON-encode a value -- safe for embedding inside a JSON-LD <script>.
  // Escapes quotes, backslashes, control chars, and the </script> trap.
  eleventyConfig.addFilter("jsonString", (val) =>
    String(val ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/<\/script/gi, "<\\/script")
  );

  // inlineSvg shortcode — reads SVG from src/assets/img/icons
  eleventyConfig.addShortcode("inlineSvg", (name) => {
    const file = path.join("src/assets/img/icons", `${name}.svg`);
    if (!fs.existsSync(file)) return "";
    return fs.readFileSync(file, "utf8");
  });

  // Pre-create every paginated /library/<slug>/ output directory
  // up-front. Eleventy v3 on Windows + OneDrive intermittently
  // fails the parallel writeFileSync calls for ~290 paginated
  // library pages with ENOENT -- the recursive mkdir races with
  // OneDrive's folder-lock during sync. Sequential mkdirSync here
  // guarantees the dirs exist by the time the templates write.
  // Auto-refresh community-stats snapshot at build time IF the
  // operator has set UMAMI_API_KEY in the build environment.
  // Falls back to whatever JSON is already committed when the key
  // isn't available -- so dev builds and PR builds don't fail.
  eleventyConfig.on("eleventy.before", async () => {
    if (!process.env.UMAMI_API_KEY) return;
    try {
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync("node", ["scripts/fetch-umami-stats.mjs"], {
        stdio: "inherit",
        env: process.env,
      });
      if (r.status !== 0) console.warn("[prebuild] umami fetch exited", r.status);
    } catch (e) {
      console.warn("[prebuild] umami fetch failed:", e.message);
    }
  });

  eleventyConfig.on("eleventy.before", () => {
    try {
      const booksDir = path.resolve("src/data/books");
      if (!fs.existsSync(booksDir)) return;
      const outBase = path.resolve("_site/library");
      fs.mkdirSync(outBase, { recursive: true });
      for (const f of fs.readdirSync(booksDir)) {
        if (!f.endsWith(".json")) continue;
        // Read the actual slug from the JSON -- some files have slugs
        // that differ from their filename. Without this the dev-mode
        // ENOENT race fires for any mismatched book.
        let slug = f.replace(/\.json$/, "");
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(booksDir, f), "utf8"));
          if (parsed && typeof parsed.slug === "string" && parsed.slug) slug = parsed.slug;
        } catch {}
        try { fs.mkdirSync(path.join(outBase, slug), { recursive: true }); } catch {}
        // Belt + suspenders: also pre-create using the filename slug
        // in case the JSON slug field is stale. Either path the
        // pagination uses now has a real directory waiting.
        const fileSlug = f.replace(/\.json$/, "");
        if (fileSlug !== slug) {
          try { fs.mkdirSync(path.join(outBase, fileSlug), { recursive: true }); } catch {}
        }
      }
    } catch (e) {
      console.warn("[prebuild] library mkdir failed:", e.message);
    }
  });

  // Pre-bake fixed-name responsive variants of the author photo so
  // dynamically-rendered HTML (megamenu.js) and Nunjucks macros (which
  // can't await the async {% image %} shortcode) can reference a
  // pre-sized sharp source. Hooks the eleventy.before event so files
  // exist before any template tries to read them.
  // Outputs land at /assets/img/_gen/jon-ajinga-{120,160,240,...}.{avif,webp,jpeg}.
  eleventyConfig.on("eleventy.before", async () => {
    const src = "src/assets/img/jon-ajinga.webp";
    if (!fs.existsSync(src)) return;
    try {
      await Image(src, {
        widths: [120, 160, 240, 320, 360, 480],
        formats: ["avif", "webp", "jpeg"],
        outputDir: "./_site/assets/img/_gen/",
        urlPath: "/assets/img/_gen/",
        sharpAvifOptions: { quality: 72, effort: 5 },
        sharpWebpOptions: { quality: 88, smartSubsample: true },
        sharpJpegOptions: { quality: 90, mozjpeg: true, progressive: true },
        filenameFormat: (id, srcPath, width, format) => {
          const base = path.basename(srcPath, path.extname(srcPath));
          return `${base}-${width}.${format}`;
        },
      });
    } catch (e) {
      console.warn("[image] author-photo prebake failed:", e.message);
    }
  });

  // Responsive image shortcode -- generates avif + webp + jpeg at
  // multiple widths and emits a <picture> tag with srcset. Avoids the
  // blur that comes from browser CSS-scaling a single high-resolution
  // source down to 120-240 px display sizes.
  //
  // Usage in templates:
  //   {% image "src/assets/img/jon-ajinga.webp", "Jon Ajinga", 240, "120" %}
  // Args: file path (relative or absolute), alt text, render width
  // (used for the html attribute), `sizes` attribute (defaults to the
  // render width in px).
  eleventyConfig.addShortcode("image", async function (src, alt, displayWidth, sizes) {
    const w = Number(displayWidth) || 320;
    // Generate at 1x, 1.5x, and 2x of the display width so retina
    // devices have a sharp source. Cap at the original's intrinsic
    // width to skip upscaling.
    const widths = [w, Math.round(w * 1.5), w * 2];
    const metadata = await Image(src, {
      widths,
      formats: ["avif", "webp", "jpeg"],
      outputDir: "./_site/assets/img/_gen/",
      urlPath: "/assets/img/_gen/",
      sharpOptions: { animated: false },
      sharpAvifOptions: { quality: 70, effort: 4 },
      sharpWebpOptions: { quality: 82, smartSubsample: true },
      sharpJpegOptions: { quality: 88, mozjpeg: true, progressive: true },
    });
    const imageAttributes = {
      alt: alt || "",
      sizes: sizes ? `${sizes}` : `${w}px`,
      width: w,
      height: undefined,
      loading: "lazy",
      decoding: "async",
    };
    return Image.generateHTML(metadata, imageAttributes, {
      whitespaceMode: "inline",
    });
  });

  // currentYear — used in footer
  eleventyConfig.addShortcode("currentYear", () =>
    String(new Date().getUTCFullYear())
  );

  // kbd paired shortcode
  eleventyConfig.addPairedShortcode("kbd", (content) => `<kbd>${content}</kbd>`);

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html", "css"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
