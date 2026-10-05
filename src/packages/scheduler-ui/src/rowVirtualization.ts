export interface VirtualRange {
  /** Pixels of skipped content rendered as a spacer after the range. */
  readonly bottomSpacer: number;
  /** Exclusive end index into the entry list. */
  readonly endIndex: number;
  /** Inclusive start index into the entry list. */
  readonly startIndex: number;
  /** Pixels of skipped content rendered as a spacer before the range. */
  readonly topSpacer: number;
}

export interface VirtualEntry {
  readonly height: number;
  readonly top: number;
}

/**
 * Windowed rendering over variable-height entries (rows and group headers).
 * Binary search for the first visible entry, then walk to the last; spacers
 * preserve scroll geometry. Pointer hit-testing is unaffected because it
 * works on absolute entry offsets, not rendered nodes.
 */
export function computeVisibleEntryRange(
  entries: readonly VirtualEntry[],
  scrollTop: number,
  viewportHeight: number,
  overscanPx = 400,
): VirtualRange {
  if (entries.length === 0) {
    return { bottomSpacer: 0, endIndex: 0, startIndex: 0, topSpacer: 0 };
  }

  const visibleTop = Math.max(0, scrollTop - overscanPx);
  const visibleBottom = scrollTop + viewportHeight + overscanPx;

  let low = 0;
  let high = entries.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const entry = entries[middle];
    if (!entry) {
      break;
    }
    if (entry.top + entry.height <= visibleTop) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const startIndex = low;

  let endIndex = startIndex;
  while (endIndex < entries.length) {
    const entry = entries[endIndex];
    if (!entry || entry.top >= visibleBottom) {
      break;
    }
    endIndex += 1;
  }

  const last = entries[entries.length - 1];
  const totalHeight = last ? last.top + last.height : 0;
  const firstVisible = entries[startIndex];
  const lastVisible = entries[endIndex - 1];
  const topSpacer = firstVisible ? firstVisible.top : 0;
  const bottomSpacer = lastVisible
    ? Math.max(0, totalHeight - (lastVisible.top + lastVisible.height))
    : 0;

  return { bottomSpacer, endIndex, startIndex, topSpacer };
}
