/*
 * Merged into pcf-scripts' webpack config (featureconfig.json turns it on).
 * The ES module builds of Fluent's calendar and icons import
 * "react/jsx-runtime" without a file extension; React 16.14 has no exports
 * map, so webpack's strict ES module resolution cannot find it. Loose
 * resolution for .js modules lets the bundle take those ES builds, which
 * tree-shake to the icons the toolbar uses.
 */
module.exports = {
  module: {
    rules: [{ resolve: { fullySpecified: false }, test: /\.m?js$/ }],
  },
};
