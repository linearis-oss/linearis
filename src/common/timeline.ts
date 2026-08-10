/**
 * Shared timeline assembly for activity commands.
 *
 * `issues activity` and `projects activity` merge several independent
 * connections into one chronological list and slice it with an opaque id
 * cursor. Only the item type differs, so the entry shape, the sort order and
 * the cursor arithmetic live here — a fix to the cursor logic must not have
 * to be made twice.
 */

/** One timeline item reduced to the fields the merge and the cursor need. */
export interface TimelineEntry<TItem> {
  createdAt: string;
  id: string;
  item: TItem;
}

export interface TimelinePage<TItem> {
  nodes: TItem[];
  hasNextPage: boolean;
  endCursor: string | null;
}

/** Ascending by creation time, with the id as a stable tiebreaker. */
export function compareTimelineEntries<TItem>(
  a: TimelineEntry<TItem>,
  b: TimelineEntry<TItem>,
): number {
  const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
  return byCreatedAt !== 0 ? byCreatedAt : a.id.localeCompare(b.id);
}

/** Slice a sorted timeline using an opaque id cursor (mirrors reply pagination). */
export function paginateTimeline<TItem>(
  entries: readonly TimelineEntry<TItem>[],
  limit: number,
  after?: string,
): TimelinePage<TItem> {
  const startIndex =
    after === undefined
      ? 0
      : entries.findIndex((entry) => entry.id === after) + 1;

  if (after !== undefined && startIndex === 0) {
    throw new Error(`Activity cursor "${after}" not found`);
  }

  const page = entries.slice(startIndex, startIndex + limit);

  return {
    nodes: page.map((entry) => entry.item),
    hasNextPage: startIndex + limit < entries.length,
    endCursor: page.at(-1)?.id ?? null,
  };
}
