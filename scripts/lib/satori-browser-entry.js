/* Bundle entry for the browser build of satori.
 *
 * Not shipped as source: scripts/build-og-browser-bundle.mjs feeds this
 * to esbuild and the OUTPUT is what the site serves
 * (src/assets/vendor/satori/satori.browser.js). The site itself has no
 * bundler, so a library that ships eleven bare `import "linebreak"`
 * specifiers cannot be loaded from node_modules by a browser; this is
 * the one place a bundler runs, and it runs by hand, not per build. */
export { default, init } from "satori";
