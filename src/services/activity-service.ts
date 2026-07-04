import type { GraphQLClient } from "../client/graphql-client.js";
import { asUuid, type UUID } from "../common/identifier.js";
import { collectConnection } from "../common/types.js";
import {
  GetIssueActivityRefDocument,
  GetLabelsDocument,
  type IssueHistoryFieldsFragment,
  ListIssueActivityHistoryDocument,
  ListIssueDiscussionRootsDocument,
  ListIssueDiscussionRootsWithReactionsDocument,
} from "../gql/graphql.js";
import {
  buildThreadRepliesIndex,
  collectThreadReplies,
  type DiscussionThread,
  type DiscussionThreadWithReactions,
  fetchAllIssueDiscussionReplyCandidates,
  fetchAllIssueDiscussionReplyCandidatesWithReactions,
  normalizeDiscussionCommentsReactions,
} from "./discussion-service.js";

/** Page size used when exhausting a connection to build the merged timeline. */
const TIMELINE_FETCH_LIMIT = 250;
/** Default number of top-level timeline items returned per page. */
const DEFAULT_ACTIVITY_LIMIT = 50;

type NamedRef = { id: string; name: string };
type UserRef = { id: string; displayName: string };
type CycleRef = { id: string; number: number };
/** A label reference; `name` is null when the label no longer exists. */
type LabelRef = { id: string; name: string | null };

/** A single normalized change captured by an issue history event. */
type ActivityChange =
  | { field: "state"; from: NamedRef | null; to: NamedRef | null }
  | { field: "assignee"; from: UserRef | null; to: UserRef | null }
  | { field: "priority"; from: number | null; to: number | null }
  | { field: "project"; from: NamedRef | null; to: NamedRef | null }
  | { field: "cycle"; from: CycleRef | null; to: CycleRef | null }
  | { field: "title"; from: string | null; to: string | null }
  | { field: "estimate"; from: number | null; to: number | null }
  | { field: "labels"; added: LabelRef[]; removed: LabelRef[] }
  | { field: "archived"; to: boolean };

interface ActivityHistoryItem {
  type: "history";
  id: string;
  createdAt: string;
  actor: UserRef | null;
  botActor: { id: string | null; name: string | null } | null;
  changes: ActivityChange[];
}

interface ActivityCommentThreadItem<
  TComment extends DiscussionThread | DiscussionThreadWithReactions,
> {
  type: "commentThread";
  root: TComment;
  replies: TComment[];
}

type ActivityItem =
  | ActivityHistoryItem
  | ActivityCommentThreadItem<DiscussionThread>
  | ActivityCommentThreadItem<DiscussionThreadWithReactions>;

export interface IssueActivityResult {
  issue: { id: string; identifier: string };
  activity: ActivityItem[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export interface IssueActivityOptions {
  limit?: number;
  after?: string;
  commentsOnly?: boolean;
  withReactions?: boolean;
}

function refsDiffer(
  from: { id: string } | null,
  to: { id: string } | null,
): boolean {
  return (from?.id ?? null) !== (to?.id ?? null);
}

/** Translate a raw issue history node into its list of meaningful changes. */
function buildHistoryChanges(
  node: IssueHistoryFieldsFragment,
  labelNames: ReadonlyMap<string, string>,
): ActivityChange[] {
  const changes: ActivityChange[] = [];

  const toLabelRef = (id: string): LabelRef => ({
    id,
    name: labelNames.get(id) ?? null,
  });

  if (refsDiffer(node.fromState, node.toState)) {
    changes.push({ field: "state", from: node.fromState, to: node.toState });
  }

  if (refsDiffer(node.fromAssignee, node.toAssignee)) {
    changes.push({
      field: "assignee",
      from: node.fromAssignee,
      to: node.toAssignee,
    });
  }

  if (node.fromPriority !== node.toPriority) {
    changes.push({
      field: "priority",
      from: node.fromPriority,
      to: node.toPriority,
    });
  }

  if (refsDiffer(node.fromProject, node.toProject)) {
    changes.push({
      field: "project",
      from: node.fromProject,
      to: node.toProject,
    });
  }

  if (refsDiffer(node.fromCycle, node.toCycle)) {
    changes.push({ field: "cycle", from: node.fromCycle, to: node.toCycle });
  }

  if (node.fromTitle !== node.toTitle) {
    changes.push({ field: "title", from: node.fromTitle, to: node.toTitle });
  }

  if (node.fromEstimate !== node.toEstimate) {
    changes.push({
      field: "estimate",
      from: node.fromEstimate,
      to: node.toEstimate,
    });
  }

  const added = node.addedLabelIds ?? [];
  const removed = node.removedLabelIds ?? [];
  if (added.length > 0 || removed.length > 0) {
    changes.push({
      field: "labels",
      added: added.map(toLabelRef),
      removed: removed.map(toLabelRef),
    });
  }

  if (node.archived !== null) {
    changes.push({ field: "archived", to: node.archived });
  }

  return changes;
}

async function fetchAllIssueDiscussionRoots(
  client: GraphQLClient,
  issueId: UUID,
): Promise<DiscussionThread[]> {
  return collectConnection(async (after) => {
    const result = await client.request(ListIssueDiscussionRootsDocument, {
      issueId,
      first: TIMELINE_FETCH_LIMIT,
      after,
    });

    if (!result.issue) {
      throw new Error(`Issue with ID "${issueId}" not found`);
    }

    return result.issue.comments;
  });
}

async function fetchAllIssueDiscussionRootsWithReactions(
  client: GraphQLClient,
  issueId: UUID,
): Promise<DiscussionThreadWithReactions[]> {
  const nodes = await collectConnection(async (after) => {
    const result = await client.request(
      ListIssueDiscussionRootsWithReactionsDocument,
      { issueId, first: TIMELINE_FETCH_LIMIT, after },
    );

    if (!result.issue) {
      throw new Error(`Issue with ID "${issueId}" not found`);
    }

    return result.issue.comments;
  });

  return normalizeDiscussionCommentsReactions(nodes);
}

async function fetchAllIssueHistory(
  client: GraphQLClient,
  issueId: UUID,
): Promise<IssueHistoryFieldsFragment[]> {
  return collectConnection(async (after) => {
    const result = await client.request(ListIssueActivityHistoryDocument, {
      issueId,
      first: TIMELINE_FETCH_LIMIT,
      after,
    });

    if (!result.issue) {
      throw new Error(`Issue with ID "${issueId}" not found`);
    }

    return result.issue.history;
  });
}

/** Collect the distinct label IDs referenced by any history node's label changes. */
function collectLabelIds(
  nodes: readonly IssueHistoryFieldsFragment[],
): string[] {
  const ids = new Set<string>();

  for (const node of nodes) {
    for (const id of node.addedLabelIds ?? []) {
      ids.add(id);
    }
    for (const id of node.removedLabelIds ?? []) {
      ids.add(id);
    }
  }

  return [...ids];
}

/**
 * Resolve label IDs referenced by history events to their names so the timeline
 * exposes human-readable labels (matching state/assignee/project). Archived
 * labels are included so historic label changes still resolve; labels that no
 * longer exist are simply absent from the map, yielding a null name.
 */
async function resolveLabelNames(
  client: GraphQLClient,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  if (ids.length === 0) {
    return names;
  }

  const labels = await collectConnection(async (after) => {
    const result = await client.request(GetLabelsDocument, {
      first: TIMELINE_FETCH_LIMIT,
      after,
      filter: { id: { in: [...ids] } },
      includeArchived: true,
    });

    return result.issueLabels;
  });

  for (const label of labels) {
    names.set(label.id, label.name);
  }

  return names;
}

/** Assemble comment-thread timeline items from root threads and reply candidates. */
function buildCommentThreadItems<
  TComment extends DiscussionThread | DiscussionThreadWithReactions,
>(
  roots: readonly TComment[],
  candidates: readonly TComment[],
): ActivityCommentThreadItem<TComment>[] {
  const childrenByParentId = buildThreadRepliesIndex(candidates);
  return roots.map((root) => ({
    type: "commentThread" as const,
    root,
    replies: collectThreadReplies(childrenByParentId, asUuid(root.id)),
  }));
}

/**
 * Fetch an issue's comment threads. Roots and reply candidates are independent
 * connections, so they are exhausted concurrently before being assembled.
 */
async function fetchCommentThreadItems(
  client: GraphQLClient,
  issueId: UUID,
  withReactions: boolean,
): Promise<ActivityItem[]> {
  if (withReactions) {
    const [roots, candidates] = await Promise.all([
      fetchAllIssueDiscussionRootsWithReactions(client, issueId),
      fetchAllIssueDiscussionReplyCandidatesWithReactions(client, issueId),
    ]);
    return buildCommentThreadItems(roots, candidates);
  }

  const [roots, candidates] = await Promise.all([
    fetchAllIssueDiscussionRoots(client, issueId),
    fetchAllIssueDiscussionReplyCandidates(client, issueId),
  ]);
  return buildCommentThreadItems(roots, candidates);
}

interface TimelineEntry {
  createdAt: string;
  id: string;
  item: ActivityItem;
}

function toTimelineEntry(item: ActivityItem): TimelineEntry {
  return item.type === "history"
    ? { createdAt: item.createdAt, id: item.id, item }
    : { createdAt: item.root.createdAt, id: item.root.id, item };
}

function compareTimelineEntries(a: TimelineEntry, b: TimelineEntry): number {
  const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
  return byCreatedAt !== 0 ? byCreatedAt : a.id.localeCompare(b.id);
}

interface TimelinePage {
  nodes: ActivityItem[];
  hasNextPage: boolean;
  endCursor: string | null;
}

/** Slice a sorted timeline using an opaque id cursor (mirrors reply pagination). */
function paginateTimeline(
  entries: readonly TimelineEntry[],
  limit: number,
  after?: string,
): TimelinePage {
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

/**
 * Build a chronological activity timeline for an issue: comment threads (root +
 * nested replies) merged with issue history events, sorted ascending by
 * creation time and paginated with an opaque id cursor.
 *
 * The timeline is materialized in full on every call before it is sliced: the
 * comment and history connections are independent (Linear exposes no unified
 * activity connection) and reply nesting needs all reply candidates regardless
 * of the requested page. As a stateless CLI there is no cross-invocation cache,
 * so each `--after` page re-fetches everything — the same materialize-then-slice
 * tradeoff as {@link paginateTimeline}'s sibling in discussion reply pagination.
 * This is cheap for typical issues; only pathologically large histories pay for it.
 */
export async function getIssueActivity(
  client: GraphQLClient,
  issueId: UUID,
  options: IssueActivityOptions = {},
): Promise<IssueActivityResult> {
  const {
    limit = DEFAULT_ACTIVITY_LIMIT,
    after,
    commentsOnly = false,
    withReactions = false,
  } = options;

  const ref = await client.request(GetIssueActivityRefDocument, {
    id: issueId,
  });

  if (!ref.issue) {
    throw new Error(`Issue with ID "${issueId}" not found`);
  }

  // Comment threads and issue history are independent connections; fetch both
  // concurrently. Label names depend on the history nodes, so they resolve after.
  const [threadItems, historyNodes] = await Promise.all([
    fetchCommentThreadItems(client, issueId, withReactions),
    commentsOnly
      ? Promise.resolve<IssueHistoryFieldsFragment[]>([])
      : fetchAllIssueHistory(client, issueId),
  ]);

  const labelNames = await resolveLabelNames(
    client,
    collectLabelIds(historyNodes),
  );

  const historyItems: ActivityItem[] = historyNodes
    .map((node) => ({
      type: "history" as const,
      id: node.id,
      createdAt: node.createdAt,
      actor: node.actor,
      botActor: node.botActor,
      changes: buildHistoryChanges(node, labelNames),
    }))
    // Drop events whose only changes fall outside the captured fragment fields;
    // they carry no information and would otherwise consume pagination slots.
    .filter((item) => item.changes.length > 0);

  const entries = [...threadItems, ...historyItems]
    .map(toTimelineEntry)
    .sort(compareTimelineEntries);

  const page = paginateTimeline(entries, limit, after);

  return {
    issue: { id: ref.issue.id, identifier: ref.issue.identifier },
    activity: page.nodes,
    pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
  };
}
