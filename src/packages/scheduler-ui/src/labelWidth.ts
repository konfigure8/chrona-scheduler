/**
 * The width a short label takes in the board's font, so an axis can hide
 * a label that would not fit its cell rather than clip it. Measured once
 * per text and font on a canvas; where there is no canvas (node tests) a
 * 7px-per-character estimate stands in.
 */
let context: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

export function labelWidth(text: string, font: string): number {
  const key = `${font}\u0001${text}`;
  const known = widths.get(key);
  if (known !== undefined) {
    return known;
  }
  if (context === undefined) {
    try {
      context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    } catch {
      context = null;
    }
  }
  let width = text.length * 7;
  if (context) {
    context.font = font;
    width = context.measureText(text).width;
  }
  widths.set(key, width);
  return width;
}

/** Whether two ranges [start, end) overlap. */
export function overlaps(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}
