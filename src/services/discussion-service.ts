import type { GraphQLClient } from "../client/graphql-client.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  type CommentCreateInput,
  type CommentUpdateInput,
  DeleteDiscussionReplyDocument,
  type DeleteDiscussionReplyMutation,
  type DiscussionCommentFieldsFragment,
  EditDiscussionReplyDocument,
  type EditDiscussionReplyMutation,
  GetDiscussionCommentContextDocument,
  type GetDiscussionCommentContextQuery,
  ListInitiativeDiscussionReplyCandidatesDocument,
  type ListInitiativeDiscussionReplyCandidatesQuery,
  ListInitiativeDiscussionRootsDocument,
  type ListInitiativeDiscussionRootsQuery,
  ListIssueDiscussionReplyCandidatesDocument,
  type ListIssueDiscussionReplyCandidatesQuery,
  ListIssueDiscussionRootsDocument,
  type ListIssueDiscussionRootsQuery,
  ListProjectDiscussionReplyCandidatesDocument,
  type ListProjectDiscussionReplyCandidatesQuery,
  ListProjectDiscussionRootsDocument,
  type ListProjectDiscussionRootsQuery,
  ResolveDiscussionDocument,
  type ResolveDiscussionMutation,
  StartDiscussionDocument,
  type StartDiscussionMutation,
  UnresolveDiscussionDocument,
  type UnresolveDiscussionMutation,
} from "../gql/graphql.js";

export type DiscussionThread = DiscussionCommentFieldsFragment;
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
  id: string,
  expectedEntityKind?: DiscussionEntityKind,
  label: "comment" | "reply" = "comment",
): Promise<DiscussionCommentContext> {
  const result = await client.request<GetDiscussionCommentContextQuery>(
    GetDiscussionCommentContextDocument,
    { id },
  );

  if (!result.comment) {
    throw new Error(`Discussion comment ID "${id}" not found`);
  }

  assertExpectedDiscussionEntityKind(result.comment, expectedEntityKind, label);

  return result.comment;
}

async function assertRootDiscussionThread(
  client: GraphQLClient,
  threadId: string,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<DiscussionThreadContext> {
  const result = await client.request<GetDiscussionCommentContextQuery>(
    GetDiscussionCommentContextDocument,
    { id: threadId },
  );

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
  commentId: string,
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
      result = await client.request<ListIssueDiscussionReplyCandidatesQuery>(
        ListIssueDiscussionReplyCandidatesDocument,
        {
          issueId: entity.id,
          first: DISCUSSION_REPLY_FETCH_LIMIT,
          after,
        },
      );
    } else if (entity.kind === "project") {
      result = await client.request<ListProjectDiscussionReplyCandidatesQuery>(
        ListProjectDiscussionReplyCandidatesDocument,
        {
          projectId: entity.id,
          first: DISCUSSION_REPLY_FETCH_LIMIT,
          after,
        },
      );
    } else {
      result =
        await client.request<ListInitiativeDiscussionReplyCandidatesQuery>(
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

function filterThreadReplies(
  comments: readonly DiscussionCommentFieldsFragment[],
  threadId: string,
): DiscussionCommentFieldsFragment[] {
  const childrenByParentId = new Map<
    string,
    DiscussionCommentFieldsFragment[]
  >();

  for (const comment of comments) {
    if (!comment.parentId) {
      continue;
    }

    const siblings = childrenByParentId.get(comment.parentId) ?? [];
    siblings.push(comment);
    siblings.sort(compareDiscussionCommentsChronologically);
    childrenByParentId.set(comment.parentId, siblings);
  }

  const replies: DiscussionCommentFieldsFragment[] = [];
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
      stack.push(children[i]);
    }
  }

  return replies;
}

function paginateDiscussionReplies(
  replies: readonly DiscussionCommentFieldsFragment[],
  limit: number,
  after?: string,
): PaginatedResult<DiscussionCommentFieldsFragment> {
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
  const result = await client.request<StartDiscussionMutation>(
    StartDiscussionDocument,
    { input },
  );

  if (!result.commentCreate.success || !result.commentCreate.comment) {
    throw new Error("Failed to start discussion");
  }

  return result.commentCreate.comment;
}

export async function listDiscussionsForIssue(
  client: GraphQLClient,
  issueId: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<DiscussionThread>> {
  const { limit = DEFAULT_ROOT_LIMIT, after } = options;
  const result = await client.request<ListIssueDiscussionRootsQuery>(
    ListIssueDiscussionRootsDocument,
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
    nodes: result.issue.comments.nodes,
    pageInfo: result.issue.comments.pageInfo,
  };
}

export async function listDiscussionsForProject(
  client: GraphQLClient,
  projectId: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<DiscussionThread>> {
  const { limit = DEFAULT_ROOT_LIMIT, after } = options;
  const result = await client.request<ListProjectDiscussionRootsQuery>(
    ListProjectDiscussionRootsDocument,
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
    nodes: result.project.comments.nodes,
    pageInfo: result.project.comments.pageInfo,
  };
}

export async function listDiscussionsForInitiative(
  client: GraphQLClient,
  initiativeId: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<DiscussionThread>> {
  const { limit = DEFAULT_ROOT_LIMIT, after } = options;
  const result = await client.request<ListInitiativeDiscussionRootsQuery>(
    ListInitiativeDiscussionRootsDocument,
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
    nodes: result.comments.nodes,
    pageInfo: result.comments.pageInfo,
  };
}

export async function listDiscussionReplies(
  client: GraphQLClient,
  threadId: string,
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

export async function startIssueDiscussion(
  client: GraphQLClient,
  input: { issueId: string; body: string },
): Promise<StartDiscussionMutation["commentCreate"]["comment"]> {
  return startDiscussion(client, { issueId: input.issueId, body: input.body });
}

export async function startProjectDiscussion(
  client: GraphQLClient,
  input: { projectId: string; body: string },
): Promise<StartDiscussionMutation["commentCreate"]["comment"]> {
  return startDiscussion(client, {
    projectId: input.projectId,
    body: input.body,
  });
}

export async function startInitiativeDiscussion(
  client: GraphQLClient,
  input: { initiativeId: string; body: string },
): Promise<StartDiscussionMutation["commentCreate"]["comment"]> {
  return startDiscussion(client, {
    initiativeId: input.initiativeId,
    body: input.body,
  });
}

export async function replyToDiscussion(
  client: GraphQLClient,
  input: { threadId: string; body: string; entityKind?: DiscussionEntityKind },
): Promise<StartDiscussionMutation["commentCreate"]["comment"]> {
  await assertRootDiscussionThread(client, input.threadId, input.entityKind);

  const result = await client.request<StartDiscussionMutation>(
    StartDiscussionDocument,
    {
      input: {
        parentId: input.threadId,
        body: input.body,
      },
    },
  );

  if (!result.commentCreate.success || !result.commentCreate.comment) {
    throw new Error("Failed to create discussion reply");
  }

  return result.commentCreate.comment;
}

export async function editDiscussionReply(
  client: GraphQLClient,
  id: string,
  input: CommentUpdateInput,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<EditDiscussionReplyMutation["commentUpdate"]["comment"]> {
  await assertReplyComment(client, id, expectedEntityKind);

  const result = await client.request<EditDiscussionReplyMutation>(
    EditDiscussionReplyDocument,
    { id, input },
  );

  if (!result.commentUpdate.success || !result.commentUpdate.comment) {
    throw new Error("Failed to edit discussion reply");
  }

  return result.commentUpdate.comment;
}

export async function deleteDiscussionReply(
  client: GraphQLClient,
  id: string,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<{ id: string; success: true }> {
  await assertReplyComment(client, id, expectedEntityKind);

  const result = await client.request<DeleteDiscussionReplyMutation>(
    DeleteDiscussionReplyDocument,
    { id },
  );

  if (!result.commentDelete.success) {
    throw new Error("Failed to delete discussion reply");
  }

  return {
    id: result.commentDelete.entityId,
    success: true,
  };
}

export async function editDiscussionComment(
  client: GraphQLClient,
  id: string,
  input: CommentUpdateInput,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<EditDiscussionReplyMutation["commentUpdate"]["comment"]> {
  await assertDiscussionCommentExists(client, id, expectedEntityKind);

  const result = await client.request<EditDiscussionReplyMutation>(
    EditDiscussionReplyDocument,
    { id, input },
  );

  if (!result.commentUpdate.success || !result.commentUpdate.comment) {
    throw new Error("Failed to edit discussion comment");
  }

  return result.commentUpdate.comment;
}

export async function deleteDiscussionComment(
  client: GraphQLClient,
  id: string,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<{ id: string; success: true }> {
  await assertDiscussionCommentExists(client, id, expectedEntityKind);

  const result = await client.request<DeleteDiscussionReplyMutation>(
    DeleteDiscussionReplyDocument,
    { id },
  );

  if (!result.commentDelete.success) {
    throw new Error("Failed to delete discussion comment");
  }

  return {
    id: result.commentDelete.entityId,
    success: true,
  };
}

export async function resolveDiscussion(
  client: GraphQLClient,
  input: {
    threadId: string;
    resolvingCommentId?: string;
    entityKind?: DiscussionEntityKind;
  },
): Promise<ResolveDiscussionMutation["commentResolve"]["comment"]> {
  await assertRootDiscussionThread(client, input.threadId, input.entityKind);

  const result = await client.request<ResolveDiscussionMutation>(
    ResolveDiscussionDocument,
    {
      id: input.threadId,
      resolvingCommentId: input.resolvingCommentId,
    },
  );

  if (!result.commentResolve.success || !result.commentResolve.comment) {
    throw new Error("Failed to resolve discussion");
  }

  return result.commentResolve.comment;
}

export async function unresolveDiscussion(
  client: GraphQLClient,
  threadId: string,
  expectedEntityKind?: DiscussionEntityKind,
): Promise<UnresolveDiscussionMutation["commentUnresolve"]["comment"]> {
  await assertRootDiscussionThread(client, threadId, expectedEntityKind);

  const result = await client.request<UnresolveDiscussionMutation>(
    UnresolveDiscussionDocument,
    { id: threadId },
  );

  if (!result.commentUnresolve.success || !result.commentUnresolve.comment) {
    throw new Error("Failed to unresolve discussion");
  }

  return result.commentUnresolve.comment;
}
