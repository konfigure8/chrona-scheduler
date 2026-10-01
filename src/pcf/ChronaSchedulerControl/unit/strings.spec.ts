/**
 * Every language file under strings/ carries every control message and
 * every package surface string, with the same placeholders as the
 * English defaults - so a new key without a translation fails here,
 * not in a customer's session. Also proves resolveControlStrings
 * reads a whole language from the resources reader.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultSchedulerStrings } from "@chrona/scheduler-ui";
import { defaultControlMessages, resolveControlStrings } from "../SchedulerControl/controlStrings";

// Compiled into out-unit/unit; the resx files stay in the source tree.
const STRINGS_DIR = join(__dirname, "..", "..", "SchedulerControl", "strings");

function readResx(file: string): Record<string, string> {
  const xml = readFileSync(join(STRINGS_DIR, file), "utf8");
  const entries: Record<string, string> = {};
  const pattern = /<data name="([^"]+)"[^>]*>\s*<value>([\s\S]*?)<\/value>/g;
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
    entries[match[1] as string] = (match[2] as string)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
  }
  return entries;
}

const placeholders = (value: string): string =>
  [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

// The manifest's property pane labels resolve from the same files: every
// display-name-key and description-key on a data-set, property or
// property-set needs a value in every language.
const manifest = readFileSync(join(STRINGS_DIR, "..", "ControlManifest.Input.xml"), "utf8");
const manifestKeys = [...manifest.matchAll(/<(?:data-set|property|property-set)\b[^>]*?\b(?:display-name-key|description-key)="([^"]+)"/g)]
  .map((match) => match[1] as string);
const manifestKeySet = [...new Set(
  [...manifest.matchAll(/<(?:data-set|property|property-set)\b[^>]*>/g)].flatMap((tag) =>
    [...(tag[0] as string).matchAll(/\b(?:display-name-key|description-key)="([^"]+)"/g)].map((m) => m[1] as string),
  ),
)];
assert.ok(manifestKeys.length > 0, "the manifest names its labels through keys");
const codeKeys = [...Object.keys(defaultControlMessages), ...Object.keys(defaultSchedulerStrings)].sort();
const expectedKeys = [...new Set([...codeKeys, ...manifestKeySet])].sort();
const english: Record<string, string> = { ...defaultControlMessages, ...defaultSchedulerStrings };
const files = readdirSync(STRINGS_DIR).filter((name) => /^SchedulerControl\.\d+\.resx$/.test(name)).sort();
assert.deepEqual(files, [1031, 1033, 1036, 1040, 1043, 1046, 2070, 3082].map((id) => `SchedulerControl.${id}.resx`));
assert.deepEqual(files, [...manifest.matchAll(/<resx path="strings\/([^"]+)"/g)].map((m) => m[1]).sort());

for (const file of files) {
  const entries = readResx(file);
  assert.deepEqual(Object.keys(entries).sort(), expectedKeys, `${file} must carry every key once`);
  for (const key of expectedKeys) {
    const value = entries[key] ?? "";
    assert.ok(value.trim().length > 0, `${file}: ${key} is empty`);
    assert.equal(placeholders(value), placeholders(english[key] ?? ""), `${file}: ${key} placeholders`);
  }
}

// The English file agrees with the defaults in code, so the fallbacks
// and the resource file can never disagree.
const englishFile = readResx("SchedulerControl.1033.resx");
// The Workforce roster is written in roles: the control words the package's
// generic skill strings as roles in its own resx (every language), while the
// package keeps its defaults for the bench.
const SCENARIO_OVERRIDES = new Set(["assignReasonMissingSkill", "optionMissingSkills", "optionSkillMismatch", "requiredSkills"]);
for (const key of codeKeys) {
  if (SCENARIO_OVERRIDES.has(key)) {
    assert.notEqual(englishFile[key], english[key], `1033: ${key} is worded for roles`);
    continue;
  }
  assert.equal(englishFile[key], english[key], `1033: ${key} differs from the code default`);
}

// A German reader resolves every message and every surface override.
const german = readResx("SchedulerControl.1031.resx");
const resolved = resolveControlStrings({ getString: (id: string) => german[id] ?? id });
assert.equal(resolved.messages.msgGenerated, "Generiert: {added} hinzugefügt, {removed} entfernt, {flagged} markiert");
assert.equal(resolved.messages.msgGenerateUnanchored, german.msgGenerateUnanchored);
assert.equal(Object.keys(resolved.surface ?? {}).length, Object.keys(defaultSchedulerStrings).length);
assert.equal(resolved.surface?.generate, "Generieren");
assert.notEqual(resolved.surface?.periodNext, defaultSchedulerStrings.periodNext);

// Without a reader every message falls back to English and no surface
// override is offered.
const fallback = resolveControlStrings(undefined);
assert.equal(fallback.messages.msgGenerated, defaultControlMessages.msgGenerated);
assert.equal(fallback.surface, undefined);

console.log("strings resx tests passed");
