import type { GraphQLClient } from "../client/graphql-client.js";
import type { UUID } from "../common/identifier.js";
import {
  requireMutationEntity,
  requireMutationSuccess,
} from "../common/mutation-payload.js";
import {
  collectConnection,
  type PaginatedResult,
  type PaginationOptions,
} from "../common/types.js";
import {
  type CommentCreateInput,
  type CommentUpdateInput,
  DeleteDiscussionReplyDocument,
  type DiscussionCommentFieldsFragment,
  type DiscussionCommentFieldsWithReactionsFragment,
  EditDiscussionReplyDocument,
  type EditDiscussionReplyMutation,
  GetDiscussionCommentContextDocument,
  type GetDiscussionCommentContextQuery,
  ListInitiativeDiscussionReplyCandidatesDocument,
  type ListInitiativeDiscussionReplyCandidatesQuery,
  ListInitiativeDiscussionReplyCandidatesWithReactionsDocument,
  type ListInitiativeDiscussionReplyCandidatesWithReactionsQuery,
  ListInitiativeDiscussionRootsDocument,
  ListInitiativeDiscussionRootsWithReactionsDocument,
  ListIssueDiscussionReplyCandidatesDocument,
  type ListIssueDiscussionReplyCandidatesQuery,
  ListIssueDiscussionReplyCandidatesWithReactionsDocument,
  type ListIssueDiscussionReplyCandidatesWithReactionsQuery,
  ListIssueDiscussionRootsDocument,
  ListIssueDiscussionRootsWithReactionsDocument,
  ListProjectDiscussionReplyCandidatesDocument,
  type ListProjectDiscussionReplyCandidatesQuery,
  ListProjectDiscussionReplyCandidatesWithReactionsDocument,
  type ListProjectDiscussionReplyCandidatesWithReactionsQuery,
  ListProjectDiscussionRootsDocument,
  ListProjectDiscussionRootsWithReactionsDocument,
  ResolveDiscussionDocument,
  type ResolveDiscussionMutation,
  StartDiscussionDocument,
  type StartDiscussionMutation,
  UnresolveDiscussionDocument,
  type UnresolveDiscussionMutation,
} from "../gql/graphql.js";
import {
  createReactionForComment,
  deleteOwnReactionByEmoji,
  deleteOwnReactionById,
  normalizeReactions,
} from "./reaction-service.js";

export type DiscussionThread = DiscussionCommentFieldsFragment;
export type DiscussionThreadWithReactions = Omit<
  DiscussionCommentFieldsWithReactionsFragment,
  "reactions"
> & { reactions: ReturnType<typeof normalizeReactions> };
export type DiscussionEntityKind = "issue" | "project" | "initiative";

const DEFAULT_ROOT_LIMIT = 25;
const DEFAULT_REPLY_LIMIT = 50;
const DISCUSSION_REPLY_FETCH_LIMIT = 250;

type DiscussionThreadContext = NonNullable<
  GetDiscussionCommentContextQuery["comment"]
>;

type DiscussionCommentContext = DiscussionThreadContext;

type DiscussionReplyCandidateQuery =
  | ListIssueDiscussionReplyCandidatesQuery
  | ListProjectDiscussionReplyCandidatesQuery
  | ListInitiativeDiscussionReplyCandidatesQuery;

type DiscussionReplyCandidateWithReactionsQuery =
  | ListIssueDiscussionReplyCandidatesWithReactionsQuery
  | ListProjectDiscussionReplyCandidatesWithReactionsQuery
  | ListInitiativeDiscussionReplyCandidatesWithReactionsQuery;

type DiscussionReactionTarget = "thread" | "reply";
type CreateDiscussionReactionResult = Awaited<
  ReturnType<typeof createReactionForComment>
>;
type DeleteDiscussionReactionResult = Awaited<
  ReturnType<typeof deleteOwnReactionByEmoji>
>;

interface DiscussionReactionTargetInput {
  commentId: UUID;
  target: DiscussionReactionTarget;
  expectedEntityKind?: DiscussionEntityKind;
}

interface CreateDiscussionReactionInput extends DiscussionReactionTargetInput {
  emoji: string;
}

interface DeleteDiscussionReactionByEmojiInput
  extends DiscussionReactionTargetInput {
  emoji: string;
}

interface DeleteDiscussionReactionByIdInput
  extends DiscussionReactionTargetInput {
  reactionId: UUID;
}

function normalizeDiscussionCommentReactions<
  T extends { reactions: Parameters<typeof normalizeReactions>[0] },
>(
  comment: T,
): Omit<T, "reactions"> & {
  reactions: ReturnType<typeof normalizeReactions>;
} {
  return {
    ...comment,
    reactions: normalizeReactions(comment.reactions),
  };
}

export function normalizeDiscussionCommentsReactions<
  T extends { reactions: Parameters<typeof normalizeReactions>[0] },
>(
  comments: readonly T[],
): Array<
  Omit<T, "reactions"> & { reactions: ReturnType<typeof normalizeReactions> }
> {
  return comments.map(normalizeDiscussionCommentReactions);
}

function getDiscussionEntityKind(
  comment: Pick<
    DiscussionCommentContext,
    "issueId" | "projectId" | "initiativeId"
  >,
): DiscussionEntityKind {
  if (comment.issueId) {
    return "issue";
  }

  if (comment.projectId) {
    return "project";
  }

  if (comment.initiativeId) {
    return "initiative";
  }

  throw new Error("Discussion comment has no supported parent entity");
}

function assertExpectedDiscussionEntityKind(
  comment: DiscussionCommentContext,
  expectedEntityKind: DiscussionEntityKind | undefined,
  label: "thread" | "reply" | "comment",
): void {
  if (!expectedEntityKind) {
    return;
  }

  const actualEntityKind = getDiscussionEntityKind(comment);

  if (actualEntityKind !== expectedEntityKind) {
    throw new Error(
      `Discussion ${label} ID "${comment.id}" belongs to ${actualEntityKind}, not ${expectedEntityKind}`,
    );
  }
}

async function assertDiscussionCommentExists(
  client: GraphQLClient,
  id: UUID,
  expectedEntityKind?: DiscussionEntityKind,
  label: "comment" | "reply" = "comment",
): Promise<DiscussionCommentContext> {
  const result = await client.request(GetDiscussionCommentContextDocument, {
    id,
  });

  if (!result.comment) {
    throw new Error(`Discussion comment ID "${id}" not found`);
  }

  assertExpectedDiscussionEntityKind(result.comment, expectedEntityKind, label);

  return result.comment;
}

async function assertRootDiscussionThread(
  client: GraphQLClient,
  threadId: UUID,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<DiscussionThreadContext> {
  const result = await client.request(GetDiscussionCommentContextDocument, {
    id: threadId,
  });

  if (!result.comment) {
    throw new Error(`Discussion thread ID "${threadId}" not found`);
  }

  if (result.comment.parentId) {
    throw new Error(
      `Discussion thread ID "${threadId}" must reference a root comment`,
    );
  }

  assertExpectedDiscussionEntityKind(
    result.comment,
    expectedEntityKind,
    "thread",
  );

  return result.comment;
}

async function assertReplyComment(
  client: GraphQLClient,
  commentId: UUID,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<DiscussionCommentContext> {
  const comment = await assertDiscussionCommentExists(
    client,
    commentId,
    expectedEntityKind,
    "reply",
  );

  if (!comment.parentId) {
    throw new Error(
      `Discussion reply ID "${commentId}" must reference a reply comment`,
    );
  }

  return comment;
}

async function assertDiscussionReactionTarget(
  client: GraphQLClient,
  input: DiscussionReactionTargetInput,
): Promise<void> {
  if (input.target === "thread") {
    await assertRootDiscussionThread(
      client,
      input.commentId,
      input.expectedEntityKind,
    );
    return;
  }

  await assertReplyComment(client, input.commentId, input.expectedEntityKind);
}

function compareDiscussionCommentsChronologically(
  a: Pick<DiscussionCommentFieldsFragment, "createdAt" | "editedAt" | "id">,
  b: Pick<DiscussionCommentFieldsFragment, "createdAt" | "editedAt" | "id">,
): number {
  const createdAtComparison = a.createdAt.localeCompare(b.createdAt);

  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  const editedAtComparison = (a.editedAt ?? "").localeCompare(b.editedAt ?? "");

  if (editedAtComparison !== 0) {
    return editedAtComparison;
  }

  return a.id.localeCompare(b.id);
}

function getDiscussionThreadEntity(
  thread: DiscussionThreadContext,
):
  | { kind: "issue"; id: string }
  | { kind: "project"; id: string }
  | { kind: "initiative"; id: string } {
  if (thread.issueId) {
    return { kind: "issue", id: thread.issueId };
  }

  if (thread.projectId) {
    return { kind: "project", id: thread.projectId };
  }

  if (thread.initiativeId) {
    return { kind: "initiative", id: thread.initiativeId };
  }

  throw new Error(
    `Discussion thread ID "${thread.id}" has no supported parent entity`,
  );
}

async function listDiscussionReplyCandidates(
  client: GraphQLClient,
  thread: DiscussionThreadContext,
): Promise<DiscussionCommentFieldsFragment[]> {
  const entity = getDiscussionThreadEntity(thread);
  const nodes: DiscussionCommentFieldsFragment[] = [];
  let after: string | undefined;

  while (true) {
    let result: DiscussionReplyCandidateQuery;

    if (entity.kind === "issue") {
      result = await client.request(
        ListIssueDiscussionReplyCandidatesDocument,
        {
          issueId: entity.id,
          first: DISCUSSION_REPLY_FETCH_LIMIT,
          after,
        },
      );
    } else if (entity.kind === "project") {
      result = await client.request(
        ListProjectDiscussionReplyCandidatesDocument,
        {
          projectId: entity.id,
          first: DISCUSSION_REPLY_FETCH_LIMIT,
          after,
        },
      );
    } else {
      result = await client.request(
        ListInitiativeDiscussionReplyCandidatesDocument,
        {
          initiativeId: entity.id,
          first: DISCUSSION_REPLY_FETCH_LIMIT,
          after,
        },
      );
    }

    nodes.push(...result.comments.nodes);

    if (
      !result.comments.pageInfo.hasNextPage ||
      !result.comments.pageInfo.endCursor
    ) {
      break;
    }

    after = result.comments.pageInfo.endCursor;
  }

  return nodes.sort(compareDiscussionCommentsChronologically);
}

async function listDiscussionReplyCandidatesWithReactions(
  client: GraphQLClient,
  thread: DiscussionThreadContext,
): Promise<DiscussionThreadWithReactions[]> {
  const entity = getDiscussionThreadEntity(thread);
  const nodes: DiscussionCommentFieldsWithReactionsFragment[] = [];
  let after: string | undefined;

  while (true) {
    let result: DiscussionReplyCandidateWithReactionsQuery;

    if (entity.kind === "issue") {
      result = await client.request(
        ListIssueDiscussionReplyCandidatesWithReactionsDocument,
        {
          issueId: entity.id,
          first: DISCUSSION_REPLY_FETCH_LIMIT,
          after,
        },
      );
    } else if (entity.kind === "project") {
      result = await client.request(
        ListProjectDiscussionReplyCandidatesWithReactionsDocument,
        {
          projectId: entity.id,
          first: DISCUSSION_REPLY_FETCH_LIMIT,
          after,
        },
      );
    } else {
      result = await client.request(
        ListInitiativeDiscussionReplyCandidatesWithReactionsDocument,
        {
          initiativeId: entity.id,
          first: DISCUSSION_REPLY_FETCH_LIMIT,
          after,
        },
      );
    }

    nodes.push(...result.comments.nodes);

    if (
      !result.comments.pageInfo.hasNextPage ||
      !result.comments.pageInfo.endCursor
    ) {
      break;
    }

    after = result.comments.pageInfo.endCursor;
  }

  return normalizeDiscussionCommentsReactions(
    nodes.sort(compareDiscussionCommentsChronologically),
  );
}

/**
 * Fetch every reply candidate (comments with a parent) for an issue directly by
 * issue UUID, looping until the connection is exhausted. Used by the activity
 * timeline, which resolves the issue up front and does not have a thread context.
 */
export async function fetchAllIssueDiscussionReplyCandidates(
  client: GraphQLClient,
  issueId: UUID,
): Promise<DiscussionCommentFieldsFragment[]> {
  const nodes = await collectConnection(async (after) => {
    const result = await client.request(
      ListIssueDiscussionReplyCandidatesDocument,
      { issueId, first: DISCUSSION_REPLY_FETCH_LIMIT, after },
    );

    return result.comments;
  });

  return nodes.sort(compareDiscussionCommentsChronologically);
}

export async function fetchAllIssueDiscussionReplyCandidatesWithReactions(
  client: GraphQLClient,
  issueId: UUID,
): Promise<DiscussionThreadWithReactions[]> {
  const nodes = await collectConnection(async (after) => {
    const result = await client.request(
      ListIssueDiscussionReplyCandidatesWithReactionsDocument,
      { issueId, first: DISCUSSION_REPLY_FETCH_LIMIT, after },
    );

    return result.comments;
  });

  return normalizeDiscussionCommentsReactions(
    nodes.sort(compareDiscussionCommentsChronologically),
  );
}

/**
 * The project counterparts of {@link fetchAllIssueDiscussionReplyCandidates},
 * used by the project activity timeline for the same reason: it resolves the
 * project up front and has no thread context to derive the entity from.
 */
export async function fetchAllProjectDiscussionReplyCandidates(
  client: GraphQLClient,
  projectId: UUID,
): Promise<DiscussionCommentFieldsFragment[]> {
  const nodes = await collectConnection(async (after) => {
    const result = await client.request(
      ListProjectDiscussionReplyCandidatesDocument,
      { projectId, first: DISCUSSION_REPLY_FETCH_LIMIT, after },
    );

    return result.comments;
  });

  return nodes.sort(compareDiscussionCommentsChronologically);
}

export async function fetchAllProjectDiscussionReplyCandidatesWithReactions(
  client: GraphQLClient,
  projectId: UUID,
): Promise<DiscussionThreadWithReactions[]> {
  const nodes = await collectConnection(async (after) => {
    const result = await client.request(
      ListProjectDiscussionReplyCandidatesWithReactionsDocument,
      { projectId, first: DISCUSSION_REPLY_FETCH_LIMIT, after },
    );

    return result.comments;
  });

  return normalizeDiscussionCommentsReactions(
    nodes.sort(compareDiscussionCommentsChronologically),
  );
}

/**
 * Index reply candidates by their `parentId`, with each sibling list sorted
 * chronologically. Building this once lets callers extract many threads'
 * replies without rescanning the full candidate list per thread.
 */
export function buildThreadRepliesIndex<
  T extends DiscussionCommentFieldsFragment,
>(comments: readonly T[]): Map<string, T[]> {
  const childrenByParentId = new Map<string, T[]>();

  for (const comment of comments) {
    if (!comment.parentId) {
      continue;
    }

    const siblings = childrenByParentId.get(comment.parentId) ?? [];
    siblings.push(comment);
    siblings.sort(compareDiscussionCommentsChronologically);
    childrenByParentId.set(comment.parentId, siblings);
  }

  return childrenByParentId;
}

/** Walk a pre-built reply index depth-first to collect a thread's replies. */
export function collectThreadReplies<T extends DiscussionCommentFieldsFragment>(
  childrenByParentId: ReadonlyMap<string, T[]>,
  threadId: UUID,
): T[] {
  const replies: T[] = [];
  const stack = [...(childrenByParentId.get(threadId) ?? [])].reverse();

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    replies.push(current);

    const children = childrenByParentId.get(current.id);

    if (!children) {
      continue;
    }

    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }

  return replies;
}

function filterThreadReplies<T extends DiscussionCommentFieldsFragment>(
  comments: readonly T[],
  threadId: UUID,
): T[] {
  return collectThreadReplies(buildThreadRepliesIndex(comments), threadId);
}

function paginateDiscussionReplies<T extends DiscussionCommentFieldsFragment>(
  replies: readonly T[],
  limit: number,
  after?: string,
): PaginatedResult<T> {
  const startIndex =
    after === undefined
      ? 0
      : replies.findIndex((reply) => reply.id === after) + 1;

  if (after !== undefined && startIndex === 0) {
    throw new Error(`Discussion reply cursor "${after}" not found`);
  }

  const nodes = replies.slice(startIndex, startIndex + limit);

  return {
    nodes,
    pageInfo: {
      hasNextPage: startIndex + limit < replies.length,
      endCursor: nodes.at(-1)?.id ?? null,
    },
  };
}

async function startDiscussion(
  client: GraphQLClient,
  input: CommentCreateInput,
): Promise<StartDiscussionMutation["commentCreate"]["comment"]> {
  const result = await client.request(StartDiscussionDocument, { input });

  return requireMutationEntity(
    result.commentCreate,
    "comment",
    "Failed to start discussion",
  );
}

export async function createDiscussionCommentReaction(
  client: GraphQLClient,
  input: CreateDiscussionReactionInput,
): Promise<CreateDiscussionReactionResult> {
  await assertDiscussionReactionTarget(client, input);

  return createReactionForComment(client, {
    commentId: input.commentId,
    emoji: input.emoji,
  });
}

export async function createIssueDiscussionCommentReaction(
  client: GraphQLClient,
  input: { commentId: UUID; emoji: string },
): Promise<CreateDiscussionReactionResult> {
  await assertDiscussionCommentExists(client, input.commentId, "issue");

  return createReactionForComment(client, {
    commentId: input.commentId,
    emoji: input.emoji,
  });
}

export async function deleteDiscussionCommentReactionByEmoji(
  client: GraphQLClient,
  input: DeleteDiscussionReactionByEmojiInput,
): Promise<DeleteDiscussionReactionResult> {
  await assertDiscussionReactionTarget(client, input);

  return deleteOwnReactionByEmoji(client, {
    kind: "comment",
    id: input.commentId,
    emoji: input.emoji,
  });
}

export async function deleteIssueDiscussionCommentReactionByEmoji(
  client: GraphQLClient,
  input: { commentId: UUID; emoji: string },
): Promise<DeleteDiscussionReactionResult> {
  await assertDiscussionCommentExists(client, input.commentId, "issue");

  return deleteOwnReactionByEmoji(client, {
    kind: "comment",
    id: input.commentId,
    emoji: input.emoji,
  });
}

export async function deleteDiscussionCommentReactionById(
  client: GraphQLClient,
  input: DeleteDiscussionReactionByIdInput,
): Promise<DeleteDiscussionReactionResult> {
  await assertDiscussionReactionTarget(client, input);

  return deleteOwnReactionById(client, {
    kind: "comment",
    id: input.commentId,
    reactionId: input.reactionId,
  });
}

export async function deleteIssueDiscussionCommentReactionById(
  client: GraphQLClient,
  input: { commentId: UUID; reactionId: UUID },
): Promise<DeleteDiscussionReactionResult> {
  await assertDiscussionCommentExists(client, input.commentId, "issue");

  return deleteOwnReactionById(client, {
    kind: "comment",
    id: input.commentId,
    reactionId: input.reactionId,
  });
}

export async function listDiscussionsForIssue(
  client: GraphQLClient,
  issueId: UUID,
  options: PaginationOptions = {},
): Promise<PaginatedResult<DiscussionThread>> {
  const { limit = DEFAULT_ROOT_LIMIT, after } = options;
  const result = await client.request(ListIssueDiscussionRootsDocument, {
    issueId,
    first: limit,
    after,
  });

  if (!result.issue) {
    throw new Error(`Issue with ID "${issueId}" not found`);
  }

  return {
    nodes: result.issue.comments.nodes,
    pageInfo: result.issue.comments.pageInfo,
  };
}

export async function listDiscussionsForIssueWithReactions(
  client: GraphQLClient,
  issueId: UUID,
  options: PaginationOptions = {},
): Promise<PaginatedResult<DiscussionThreadWithReactions>> {
  const { limit = DEFAULT_ROOT_LIMIT, after } = options;
  const result = await client.request(
    ListIssueDiscussionRootsWithReactionsDocument,
    {
      issueId,
      first: limit,
      after,
    },
  );

  if (!result.issue) {
    throw new Error(`Issue with ID "${issueId}" not found`);
  }

  return {
    nodes: normalizeDiscussionCommentsReactions(result.issue.comments.nodes),
    pageInfo: result.issue.comments.pageInfo,
  };
}

export async function listDiscussionsForProject(
  client: GraphQLClient,
  projectId: UUID,
  options: PaginationOptions = {},
): Promise<PaginatedResult<DiscussionThread>> {
  const { limit = DEFAULT_ROOT_LIMIT, after } = options;
  const result = await client.request(ListProjectDiscussionRootsDocument, {
    projectId,
    first: limit,
    after,
  });

  if (!result.project) {
    throw new Error(`Project with ID "${projectId}" not found`);
  }

  return {
    nodes: result.project.comments.nodes,
    pageInfo: result.project.comments.pageInfo,
  };
}

export async function listDiscussionsForProjectWithReactions(
  client: GraphQLClient,
  projectId: UUID,
  options: PaginationOptions = {},
): Promise<PaginatedResult<DiscussionThreadWithReactions>> {
  const { limit = DEFAULT_ROOT_LIMIT, after } = options;
  const result = await client.request(
    ListProjectDiscussionRootsWithReactionsDocument,
    {
      projectId,
      first: limit,
      after,
    },
  );

  if (!result.project) {
    throw new Error(`Project with ID "${projectId}" not found`);
  }

  return {
    nodes: normalizeDiscussionCommentsReactions(result.project.comments.nodes),
    pageInfo: result.project.comments.pageInfo,
  };
}

export async function listDiscussionsForInitiative(
  client: GraphQLClient,
  initiativeId: UUID,
  options: PaginationOptions = {},
): Promise<PaginatedResult<DiscussionThread>> {
  const { limit = DEFAULT_ROOT_LIMIT, after } = options;
  const result = await client.request(ListInitiativeDiscussionRootsDocument, {
    initiativeId,
    initiativeLookupId: initiativeId,
    first: limit,
    after,
  });

  if (!result.initiative) {
    throw new Error(`Initiative with ID "${initiativeId}" not found`);
  }

  return {
    nodes: result.comments.nodes,
    pageInfo: result.comments.pageInfo,
  };
}

export async function listDiscussionsForInitiativeWithReactions(
  client: GraphQLClient,
  initiativeId: UUID,
  options: PaginationOptions = {},
): Promise<PaginatedResult<DiscussionThreadWithReactions>> {
  const { limit = DEFAULT_ROOT_LIMIT, after } = options;
  const result = await client.request(
    ListInitiativeDiscussionRootsWithReactionsDocument,
    {
      initiativeId,
      initiativeLookupId: initiativeId,
      first: limit,
      after,
    },
  );

  if (!result.initiative) {
    throw new Error(`Initiative with ID "${initiativeId}" not found`);
  }

  return {
    nodes: normalizeDiscussionCommentsReactions(result.comments.nodes),
    pageInfo: result.comments.pageInfo,
  };
}

export async function listDiscussionReplies(
  client: GraphQLClient,
  threadId: UUID,
  options: PaginationOptions = {},
  expectedEntityKind?: DiscussionEntityKind,
): Promise<PaginatedResult<DiscussionCommentFieldsFragment>> {
  const thread = await assertRootDiscussionThread(
    client,
    threadId,
    expectedEntityKind,
  );
  const candidates = await listDiscussionReplyCandidates(client, thread);
  const replies = filterThreadReplies(candidates, threadId);
  const { limit = DEFAULT_REPLY_LIMIT, after } = options;

  return paginateDiscussionReplies(replies, limit, after);
}

export async function listDiscussionRepliesWithReactions(
  client: GraphQLClient,
  threadId: UUID,
  options: PaginationOptions = {},
  expectedEntityKind?: DiscussionEntityKind,
): Promise<PaginatedResult<DiscussionThreadWithReactions>> {
  const thread = await assertRootDiscussionThread(
    client,
    threadId,
    expectedEntityKind,
  );
  const candidates = await listDiscussionReplyCandidatesWithReactions(
    client,
    thread,
  );
  const replies = filterThreadReplies(candidates, threadId);
  const { limit = DEFAULT_REPLY_LIMIT, after } = options;

  return paginateDiscussionReplies(replies, limit, after);
}

export async function startIssueDiscussion(
  client: GraphQLClient,
  input: { issueId: UUID; body: string },
): Promise<StartDiscussionMutation["commentCreate"]["comment"]> {
  return startDiscussion(client, { issueId: input.issueId, body: input.body });
}

export async function startProjectDiscussion(
  client: GraphQLClient,
  input: { projectId: UUID; body: string },
): Promise<StartDiscussionMutation["commentCreate"]["comment"]> {
  return startDiscussion(client, {
    projectId: input.projectId,
    body: input.body,
  });
}

export async function startInitiativeDiscussion(
  client: GraphQLClient,
  input: { initiativeId: UUID; body: string },
): Promise<StartDiscussionMutation["commentCreate"]["comment"]> {
  return startDiscussion(client, {
    initiativeId: input.initiativeId,
    body: input.body,
  });
}

export async function replyToDiscussion(
  client: GraphQLClient,
  input: { threadId: UUID; body: string; entityKind?: DiscussionEntityKind },
): Promise<StartDiscussionMutation["commentCreate"]["comment"]> {
  const thread = await assertRootDiscussionThread(
    client,
    input.threadId,
    input.entityKind,
  );
  const entity = getDiscussionThreadEntity(thread);
  const entityField =
    entity.kind === "issue"
      ? { issueId: entity.id }
      : entity.kind === "project"
        ? { projectId: entity.id }
        : { initiativeId: entity.id };

  const result = await client.request(StartDiscussionDocument, {
    input: {
      parentId: input.threadId,
      ...entityField,
      body: input.body,
    },
  });

  return requireMutationEntity(
    result.commentCreate,
    "comment",
    "Failed to create discussion reply",
  );
}

export async function editDiscussionReply(
  client: GraphQLClient,
  id: UUID,
  input: CommentUpdateInput,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<EditDiscussionReplyMutation["commentUpdate"]["comment"]> {
  await assertReplyComment(client, id, expectedEntityKind);

  const result = await client.request(EditDiscussionReplyDocument, {
    id,
    input,
  });

  return requireMutationEntity(
    result.commentUpdate,
    "comment",
    "Failed to edit discussion reply",
  );
}

export async function deleteDiscussionReply(
  client: GraphQLClient,
  id: UUID,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<{ id: string; success: true }> {
  await assertReplyComment(client, id, expectedEntityKind);

  const result = await client.request(DeleteDiscussionReplyDocument, { id });

  requireMutationSuccess(
    result.commentDelete,
    "Failed to delete discussion reply",
  );

  return {
    id: result.commentDelete.entityId,
    success: true,
  };
}

export async function editDiscussionComment(
  client: GraphQLClient,
  id: UUID,
  input: CommentUpdateInput,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<EditDiscussionReplyMutation["commentUpdate"]["comment"]> {
  await assertDiscussionCommentExists(client, id, expectedEntityKind);

  const result = await client.request(EditDiscussionReplyDocument, {
    id,
    input,
  });

  return requireMutationEntity(
    result.commentUpdate,
    "comment",
    "Failed to edit discussion comment",
  );
}

export async function deleteDiscussionComment(
  client: GraphQLClient,
  id: UUID,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<{ id: string; success: true }> {
  await assertDiscussionCommentExists(client, id, expectedEntityKind);

  const result = await client.request(DeleteDiscussionReplyDocument, { id });

  requireMutationSuccess(
    result.commentDelete,
    "Failed to delete discussion comment",
  );

  return {
    id: result.commentDelete.entityId,
    success: true,
  };
}

export async function resolveDiscussion(
  client: GraphQLClient,
  input: {
    threadId: UUID;
    resolvingCommentId?: UUID;
    entityKind?: DiscussionEntityKind;
  },
): Promise<ResolveDiscussionMutation["commentResolve"]["comment"]> {
  await assertRootDiscussionThread(client, input.threadId, input.entityKind);

  const result = await client.request(ResolveDiscussionDocument, {
    id: input.threadId,
    resolvingCommentId: input.resolvingCommentId,
  });

  return requireMutationEntity(
    result.commentResolve,
    "comment",
    "Failed to resolve discussion",
  );
}

export async function unresolveDiscussion(
  client: GraphQLClient,
  threadId: UUID,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<UnresolveDiscussionMutation["commentUnresolve"]["comment"]> {
  await assertRootDiscussionThread(client, threadId, expectedEntityKind);

  const result = await client.request(UnresolveDiscussionDocument, {
    id: threadId,
  });

  return requireMutationEntity(
    result.commentUnresolve,
    "comment",
    "Failed to unresolve discussion",
  );
}
