/* Stand-in for `fs` when harfbuzzjs's emscripten loader is bundled for
   the browser. The require sits behind `if (ENVIRONMENT_IS_NODE)`, which
   is false in a browser, so nothing here is ever called -- but esbuild
   still has to resolve it. */
export default {};
