/** A box in the shell's own coordinates: the part of the board the user can see. */
export interface MenuArea {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface MenuPlacement {
  readonly left: number;
  /** Set only when the menu is taller than the area: it then scrolls inside itself. */
  readonly maxHeight?: number;
  readonly top: number;
}

/** The space the menu keeps from the edge of the area. */
const edgeGap = 4;

/** One axis: after the pointer when there is room, else before it, else as far in as the area lets it. */
function fitAxis(at: number, size: number, start: number, end: number): number {
  if (at + size <= end - edgeGap) {
    return at;
  }
  if (at - size >= start + edgeGap) {
    return at - size;
  }
  return Math.max(start + edgeGap, end - edgeGap - size);
}

/**
 * Where a context menu opened at the pointer goes so that all of it shows (Fluent's menus and the
 * operating system's do the same): down and to the right of the pointer, flipped up or to the left
 * where there is no room, and moved inside the area when neither side has room.
 */
export function fitMenu(
  pointer: { readonly x: number; readonly y: number },
  size: { readonly height: number; readonly width: number },
  area: MenuArea,
): MenuPlacement {
  const room = area.bottom - area.top - edgeGap * 2;
  const height = Math.min(size.height, room);
  const left = fitAxis(pointer.x, size.width, area.left, area.right);
  const top = fitAxis(pointer.y, height, area.top, area.bottom);
  return size.height > room ? { left, maxHeight: room, top } : { left, top };
}
