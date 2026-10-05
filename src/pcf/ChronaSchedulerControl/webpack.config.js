const fs = require("node:fs");
const path = require("node:path");

/*
 * The global the platform's Fluent 9 library is loaded as, read from
 * pcf-scripts' own table, so a new alias follows the tooling.
 */
function fluentPlatformAlias() {
  const table = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(require.resolve("pcf-scripts/package.json")), "PlatformLibraryVersions.json"),
      "utf8",
    ),
  );
  const entry = table.fluent.find((candidate) => candidate.minVersion.startsWith("9."));
  if (!entry) {
    throw new Error("pcf-scripts lists no Fluent 9 platform library");
  }
  return entry.libAlias;
}

/*
 * Merged into pcf-scripts' webpack config (featureconfig.json turns it on).
 * The ES module builds of Fluent's calendar and icons import
 * "react/jsx-runtime" without a file extension; React 16.14 has no exports
 * map, so webpack's strict ES module resolution cannot find it. Loose
 * resolution for .js modules lets the bundle take those ES builds, which
 * tree-shake to the icons the toolbar uses.
 */
module.exports = {
  /*
   * The page keeps one shared focus manager (tabster) on the window,
   * made by the app's own Fluent. The calendar's @fluentui/react-tabster
   * bundled a newer tabster that joined it and crashed the board when
   * the date picker opened. The platform's Fluent library exports the
   * two hooks the calendar uses, so it takes them from there. An array,
   * as pcf-scripts' own platform externals are one.
   */
  externals: [{ "@fluentui/react-tabster": fluentPlatformAlias() }],
  module: {
    rules: [{ resolve: { fullySpecified: false }, test: /\.m?js$/ }],
  },
};
