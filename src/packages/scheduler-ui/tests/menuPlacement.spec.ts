import * as assert from "node:assert/strict";

import { fitMenu } from "../src/menuPlacement";

// The board's visible area, in the shell's own coordinates: 1000 by 600.
const area = { bottom: 600, left: 0, right: 1000, top: 0 };
const size = { height: 240, width: 200 };

// Room below and to the right: the menu opens at the pointer, as before.
{
  assert.deepEqual(fitMenu({ x: 100, y: 100 }, size, area), { left: 100, top: 100 });
}

// A shift near the bottom edge: the menu flips up, its bottom at the pointer, so its last item shows.
{
  assert.deepEqual(fitMenu({ x: 100, y: 500 }, size, area), { left: 100, top: 260 });
}

// A shift near the right edge: the menu flips left, its right side at the pointer.
{
  assert.deepEqual(fitMenu({ x: 900, y: 100 }, size, area), { left: 700, top: 100 });
}

// Near the bottom right corner: it flips both ways.
{
  assert.deepEqual(fitMenu({ x: 950, y: 580 }, size, area), { left: 750, top: 340 });
}

// No room above or below: it stays inside the area, 4 px from its edge.
{
  const short = { bottom: 300, left: 0, right: 1000, top: 0 };
  assert.deepEqual(fitMenu({ x: 100, y: 150 }, size, short), { left: 100, top: 56 });
}

// A menu taller than the area starts at its top and scrolls inside itself.
{
  const tiny = { bottom: 200, left: 0, right: 1000, top: 0 };
  assert.deepEqual(fitMenu({ x: 100, y: 150 }, size, tiny), { left: 100, maxHeight: 192, top: 4 });
}

// The visible area need not start at the shell's corner (a host page scrolled past the board's top).
{
  const scrolled = { bottom: 700, left: 0, right: 1000, top: 300 };
  assert.deepEqual(fitMenu({ x: 100, y: 320 }, size, scrolled), { left: 100, top: 320 });
  assert.deepEqual(fitMenu({ x: 100, y: 650 }, size, scrolled), { left: 100, top: 410 });
}

// Exactly fits: the menu's last pixel 4 px from the edge still opens at the pointer.
{
  assert.deepEqual(fitMenu({ x: 796, y: 356 }, size, area), { left: 796, top: 356 });
}

console.log("menuPlacement.spec: 9 checks passed");
