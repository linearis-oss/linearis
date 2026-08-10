import type { GraphQLClient } from "../client/graphql-client.js";
import { asUuid, type UUID } from "../common/identifier.js";
import {
  compareTimelineEntries,
  paginateTimeline,
  type TimelineEntry,
} from "../common/timeline.js";
import { collectConnection } from "../common/types.js";
import {
  GetProjectActivityRefDocument,
  ListProjectActivityHistoryDocument,
  ListProjectActivityUpdatesDocument,
  ListProjectDiscussionRootsDocument,
  ListProjectDiscussionRootsWithReactionsDocument,
  type ProjectUpdateCoreFieldsFragment,
} from "../gql/graphql.js";
import {
  buildThreadRepliesIndex,
  collectThreadReplies,
  type DiscussionThread,
  type DiscussionThreadWithReactions,
  fetchAllProjectDiscussionReplyCandidates,
  fetchAllProjectDiscussionReplyCandidatesWithReactions,
  normalizeDiscussionCommentsReactions,
} from "./discussion-service.js";

/** Page size used when exhausting a connection to build the merged timeline. */
const TIMELINE_FETCH_LIMIT = 250;
/** Default number of top-level timeline items returned per page. */
const DEFAULT_ACTIVITY_LIMIT = 50;

/**
 * A project history event.
 *
 * `entries` is passed through verbatim. `ProjectHistory.entries` is an
 * opaque `JSONObject!`, not the ~40 typed `from*`/`to*` fields
 * `IssueHistory` carries, so there is nothing to normalize into the
 * `changes[]` union `issues activity` produces. `ProjectHistory` also has
 * no actor field, so there is no `actor` here either.
 */
interface ProjectActivityHistoryItem {
  type: "history";
  id: string;
  createdAt: string;
  entries: unknown;
}

interface ProjectActivityUpdateItem {
  type: "update";
  id: string;
  createdAt: string;
  update: ProjectUpdateCoreFieldsFragment;
}

interface ProjectActivityCommentThreadItem<
  TComment extends DiscussionThread | DiscussionThreadWithReactions,
> {
  type: "commentThread";
  root: TComment;
  replies: TComment[];
}

type ProjectActivityItem =
  | ProjectActivityHistoryItem
  | ProjectActivityUpdateItem
  | ProjectActivityCommentThreadItem<DiscussionThread>
  | ProjectActivityCommentThreadItem<DiscussionThreadWithReactions>;

export interface ProjectActivityResult {
  project: { id: string; name: string };
  activity: ProjectActivityItem[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export interface ProjectActivityOptions {
  limit?: number;
  after?: string;
  /** Drop history and status updates, leaving only discussion threads. */
  commentsOnly?: boolean;
  withReactions?: boolean;
}

async function fetchAllProjectDiscussionRoots(
  client: GraphQLClient,
  projectId: UUID,
): Promise<DiscussionThread[]> {
  return collectConnection(async (after) => {
    const result = await client.request(ListProjectDiscussionRootsDocument, {
      projectId,
      first: TIMELINE_FETCH_LIMIT,
      after,
    });

    if (!result.project) {
      throw new Error(`Project with ID "${projectId}" not found`);
    }

    return result.project.comments;
  });
}

async function fetchAllProjectDiscussionRootsWithReactions(
  client: GraphQLClient,
  projectId: UUID,
): Promise<DiscussionThreadWithReactions[]> {
  const nodes = await collectConnection(async (after) => {
    const result = await client.request(
      ListProjectDiscussionRootsWithReactionsDocument,
      { projectId, first: TIMELINE_FETCH_LIMIT, after },
    );

    if (!result.project) {
      throw new Error(`Project with ID "${projectId}" not found`);
    }

    return result.project.comments;
  });

  return normalizeDiscussionCommentsReactions(nodes);
}

async function fetchAllProjectHistory(
  client: GraphQLClient,
  projectId: UUID,
): Promise<ProjectActivityHistoryItem[]> {
  const nodes = await collectConnection(async (after) => {
    const result = await client.request(ListProjectActivityHistoryDocument, {
      id: projectId,
      first: TIMELINE_FETCH_LIMIT,
      after,
    });

    if (!result.project) {
      throw new Error(`Project with ID "${projectId}" not found`);
    }

    return result.project.history;
  });

  return nodes.map((node) => ({
    type: "history" as const,
    id: node.id,
    createdAt: node.createdAt,
    entries: node.entries,
  }));
}

async function fetchAllProjectUpdates(
  client: GraphQLClient,
  projectId: UUID,
): Promise<ProjectActivityUpdateItem[]> {
  const nodes = await collectConnection(async (after) => {
    const result = await client.request(ListProjectActivityUpdatesDocument, {
      projectId,
      first: TIMELINE_FETCH_LIMIT,
      after,
    });

    return result.projectUpdates;
  });

  return nodes.map((node) => ({
    type: "update" as const,
    id: node.id,
    createdAt: node.createdAt,
    update: node,
  }));
}

/** Assemble comment-thread timeline items from root threads and reply candidates. */
function buildCommentThreadItems<
  TComment extends DiscussionThread | DiscussionThreadWithReactions,
>(
  roots: readonly TComment[],
  candidates: readonly TComment[],
): ProjectActivityCommentThreadItem<TComment>[] {
  const childrenByParentId = buildThreadRepliesIndex(candidates);
  return roots.map((root) => ({
    type: "commentThread" as const,
    root,
    replies: collectThreadReplies(childrenByParentId, asUuid(root.id)),
  }));
}

/**
 * Fetch a project's comment threads. Roots and reply candidates are
 * independent connections, so they are exhausted concurrently.
 */
async function fetchCommentThreadItems(
  client: GraphQLClient,
  projectId: UUID,
  withReactions: boolean,
): Promise<ProjectActivityItem[]> {
  if (withReactions) {
    const [roots, candidates] = await Promise.all([
      fetchAllProjectDiscussionRootsWithReactions(client, projectId),
      fetchAllProjectDiscussionReplyCandidatesWithReactions(client, projectId),
    ]);
    return buildCommentThreadItems(roots, candidates);
  }

  const [roots, candidates] = await Promise.all([
    fetchAllProjectDiscussionRoots(client, projectId),
    fetchAllProjectDiscussionReplyCandidates(client, projectId),
  ]);
  return buildCommentThreadItems(roots, candidates);
}

function toTimelineEntry(
  item: ProjectActivityItem,
): TimelineEntry<ProjectActivityItem> {
  return item.type === "commentThread"
    ? { createdAt: item.root.createdAt, id: item.root.id, item }
    : { createdAt: item.createdAt, id: item.id, item };
}

/**
 * Build a chronological activity timeline for a project: comment threads
 * (root + nested replies), history events, and status updates, sorted
 * ascending by creation time and paginated with an opaque id cursor.
 *
 * The envelope and flags match `issues activity`, but the item shape does
 * not. History items carry Linear's opaque `entries` object rather than the
 * normalized `changes[]` union — see {@link ProjectActivityHistoryItem}.
 *
 * The timeline is materialized in full on every call before it is sliced.
 * The three connections are independent (Linear exposes no unified activity
 * connection) and reply nesting needs all reply candidates regardless of the
 * requested page. As a stateless CLI there is no cross-invocation cache, so
 * each `--after` page re-fetches everything.
 */
export async function getProjectActivity(
  client: GraphQLClient,
  projectId: UUID,
  options: ProjectActivityOptions = {},
): Promise<ProjectActivityResult> {
  const {
    limit = DEFAULT_ACTIVITY_LIMIT,
    after,
    commentsOnly = false,
    withReactions = false,
  } = options;

  const ref = await client.request(GetProjectActivityRefDocument, {
    id: projectId,
  });

  if (!ref.project) {
    throw new Error(`Project with ID "${projectId}" not found`);
  }

  const [threadItems, historyItems, updateItems] = await Promise.all([
    fetchCommentThreadItems(client, projectId, withReactions),
    commentsOnly
      ? Promise.resolve<ProjectActivityHistoryItem[]>([])
      : fetchAllProjectHistory(client, projectId),
    commentsOnly
      ? Promise.resolve<ProjectActivityUpdateItem[]>([])
      : fetchAllProjectUpdates(client, projectId),
  ]);

  const entries = [...threadItems, ...historyItems, ...updateItems]
    .map(toTimelineEntry)
    .sort(compareTimelineEntries);

  const page = paginateTimeline(entries, limit, after);

  return {
    project: { id: ref.project.id, name: ref.project.name },
    activity: page.nodes,
    pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
  };
}
