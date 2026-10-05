// Emits strings/SchedulerControl.1033.resx from the package defaults
// plus the control's message defaults - the translation template.
// Re-run after adding strings: node scripts/generate-resx.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { defaultSchedulerStrings } = require("@chrona/scheduler-ui");
const { defaultControlMessages } = require(join(
  here,
  "..",
  "out-unit",
  "SchedulerControl",
  "controlStrings.js",
));

const escapeXml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const entries = { ...defaultSchedulerStrings, ...defaultControlMessages };
const data = Object.keys(entries)
  .sort()
  .map(
    (key) =>
      `  <data name="${key}" xml:space="preserve">\n    <value>${escapeXml(
        entries[key],
      )}</value>\n  </data>`,
  )
  .join("\n");

const resx = `<?xml version="1.0" encoding="utf-8"?>\n<root>\n  <resheader name="resmimetype">\n    <value>text/microsoft-resx</value>\n  </resheader>\n  <resheader name="version">\n    <value>2.0</value>\n  </resheader>\n  <resheader name="reader">\n    <value>System.Resources.ResXResourceReader</value>\n  </resheader>\n  <resheader name="writer">\n    <value>System.Resources.ResXResourceWriter</value>\n  </resheader>\n${data}\n</root>\n`;

const out = join(here, "..", "SchedulerControl", "strings");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "SchedulerControl.1033.resx"), resx, "utf8");
console.log(`resx written: ${Object.keys(entries).length} strings`);
