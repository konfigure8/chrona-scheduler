import * as assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChronaRoster } from "../src/ChronaRoster";
import { defaultSchedulerStrings } from "../src/stringResources";
import { SchedulerStringsProvider } from "../src/strings";

/*
 * A Roster grid with nobody on it (no people, or people that could not be read) keeps its day header over the empty
 * message, as the timeline does: the planner still sees which week the board is on. Found on the German Workforce board
 * whose settings could not be read: its Roster grid showed a blank box with no day header.
 */
// The server render has no layout effects to run: their warning is not this test's subject.
const warn = console.error;
console.error = (...args: unknown[]): void => {
  if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) warn(...args);
};
const window = { end: new Date(2026, 10, 9), start: new Date(2026, 10, 2) };
const strings = { ...defaultSchedulerStrings, emptyResources: "Settings did not load." };
const html = renderToStaticMarkup(
  React.createElement(SchedulerStringsProvider, { strings }, React.createElement(ChronaRoster, { events: [], resources: [], window })),
);
assert.match(html, /Settings did not load\./, "the empty message shows");
const headers = html.match(/<th[ >]/g) ?? [];
assert.equal(headers.length, 8, `the people column and the week's seven days head the empty grid: ${html}`);
assert.match(html, /Mon<\/span> ?2/, "the first day is named");

console.log("roster empty tests passed");
