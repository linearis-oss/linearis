import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import type { BrandUuidFields, UUID } from "../common/identifier.js";
import { requireMutationEntity } from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  ArchiveIssueDocument,
  CreateIssueDocument,
  type CreateIssueMutation,
  DeleteIssueDocument,
  FilteredSearchIssuesDocument,
  GetIssueByIdDocument,
  GetIssueByIdentifierDocument,
  type GetIssueByIdentifierQuery,
  GetIssueByIdentifierWithAttachmentsDocument,
  type GetIssueByIdentifierWithAttachmentsQuery,
  GetIssueByIdentifierWithCommentsDocument,
  type GetIssueByIdentifierWithCommentsQuery,
  GetIssueByIdentifierWithReactionsDocument,
  type GetIssueByIdentifierWithReactionsQuery,
  type GetIssueByIdQuery,
  GetIssueByIdWithAttachmentsDocument,
  type GetIssueByIdWithAttachmentsQuery,
  GetIssueByIdWithCommentsDocument,
  type GetIssueByIdWithCommentsQuery,
  GetIssueByIdWithReactionsDocument,
  type GetIssueByIdWithReactionsQuery,
  GetIssuesDocument,
  type GetIssuesQuery,
  type IssueCreateInput,
  type IssueFilter,
  type IssueUpdateInput,
  SearchIssuesDocument,
  type SearchIssuesQuery,
  type SearchIssuesQueryVariables,
  UnarchiveIssueDocument,
  UpdateIssueDocument,
  type UpdateIssueMutation,
} from "../gql/graphql.js";
import { normalizeReactions } from "./reaction-service.js";

// Issue projection types
export type IssueListItem = GetIssuesQuery["issues"]["nodes"][0];
export type IssueDetail = NonNullable<GetIssueByIdQuery["issue"]>;
export type IssueByIdentifier = GetIssueByIdentifierQuery["issues"]["nodes"][0];
export type IssueDetailWithComments = NonNullable<
  GetIssueByIdWithCommentsQuery["issue"]
>;
export type IssueByIdentifierWithComments =
  GetIssueByIdentifierWithCommentsQuery["issues"]["nodes"][0];
type IssueComment = NonNullable<
  NonNullable<IssueDetailWithComments["comments"]>["nodes"][0]
>;
type IssueCommentThread = IssueComment & {
  replies: IssueCommentThread[];
};
export type IssueDetailWithCommentThreads = Omit<
  IssueDetailWithComments,
  "comments"
> & {
  comments: { nodes: IssueCommentThread[] };
};
export type IssueByIdentifierWithCommentThreads = Omit<
  IssueByIdentifierWithComments,
  "comments"
> & {
  comments: { nodes: IssueCommentThread[] };
};
export type IssueDetailWithAttachments = NonNullable<
  GetIssueByIdWithAttachmentsQuery["issue"]
>;
export type IssueByIdentifierWithAttachments =
  GetIssueByIdentifierWithAttachmentsQuery["issues"]["nodes"][0];
export type IssueSearchResult = SearchIssuesQuery["searchIssues"]["nodes"][0];
export type CreatedIssue = NonNullable<
  CreateIssueMutation["issueCreate"]["issue"]
>;
export type UpdatedIssue = NonNullable<
  UpdateIssueMutation["issueUpdate"]["issue"]
>;

// Service-owned input types (UUIDs pre-resolved by the command).
export type CreateIssueInput = BrandUuidFields<
  Pick<
    IssueCreateInput,
    | "title"
    | "teamId"
    | "description"
    | "assigneeId"
    | "priority"
    | "estimate"
    | "projectId"
    | "labelIds"
    | "projectMilestoneId"
    | "cycleId"
    | "stateId"
    | "parentId"
    | "dueDate"
  >,
  | "teamId"
  | "assigneeId"
  | "projectId"
  | "labelIds"
  | "projectMilestoneId"
  | "cycleId"
  | "stateId"
  | "parentId"
>;
export type UpdateIssueInput = BrandUuidFields<
  Pick<
    IssueUpdateInput,
    | "title"
    | "description"
    | "stateId"
    | "priority"
    | "estimate"
    | "assigneeId"
    | "projectId"
    | "labelIds"
    | "parentId"
    | "projectMilestoneId"
    | "cycleId"
    | "dueDate"
  >,
  | "stateId"
  | "assigneeId"
  | "projectId"
  | "labelIds"
  | "parentId"
  | "projectMilestoneId"
  | "cycleId"
>;

/**
 * Pagination plus the read-scope knobs shared by `listIssues` and
 * `searchIssues`. Archived issues are excluded unless asked for, matching the
 * Linear API default and the historical CLI behavior.
 */
export interface IssueReadOptions extends PaginationOptions {
  includeArchived?: boolean;
}

const NON_COMPLETED_ISSUES_FILTER: IssueFilter = {
  state: { type: { neq: "completed" } },
};

function hasExplicitStateFilter(filter: IssueFilter): boolean {
  if (filter.state) {
    return true;
  }

  if (filter.and?.some(hasExplicitStateFilter)) {
    return true;
  }

  return filter.or?.some(hasExplicitStateFilter) ?? false;
}

function buildListIssuesFilter(filter: IssueFilter): IssueFilter {
  if (hasExplicitStateFilter(filter)) {
    return filter;
  }

  return {
    and: [NON_COMPLETED_ISSUES_FILTER, filter],
  };
}

function compareCommentsChronologically(
  a: Pick<IssueComment, "createdAt" | "editedAt" | "id">,
  b: Pick<IssueComment, "createdAt" | "editedAt" | "id">,
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

function sortCommentThreads(
  comments: IssueCommentThread[],
): IssueCommentThread[] {
  comments.sort(compareCommentsChronologically);

  for (const comment of comments) {
    sortCommentThreads(comment.replies);
  }

  return comments;
}

function groupCommentsIntoThreads(
  comments: readonly IssueComment[],
): IssueCommentThread[] {
  const commentsById = new Map<string, IssueCommentThread>();

  for (const comment of comments) {
    commentsById.set(comment.id, { ...comment, replies: [] });
  }

  const rootComments: IssueCommentThread[] = [];

  for (const comment of comments) {
    const threadedComment = commentsById.get(comment.id);

    if (!threadedComment) {
      continue;
    }

    if (!comment.parentId) {
      rootComments.push(threadedComment);
      continue;
    }

    const parentComment = commentsById.get(comment.parentId);

    if (!parentComment) {
      rootComments.push(threadedComment);
      continue;
    }

    parentComment.replies.push(threadedComment);
  }

  return sortCommentThreads(rootComments);
}

function threadIssueComments(
  issue: IssueDetailWithComments,
): IssueDetailWithCommentThreads;
function threadIssueComments(
  issue: IssueByIdentifierWithComments,
): IssueByIdentifierWithCommentThreads;
function threadIssueComments(
  issue: IssueDetailWithComments | IssueByIdentifierWithComments,
): IssueDetailWithCommentThreads | IssueByIdentifierWithCommentThreads {
  return {
    ...issue,
    comments: {
      nodes: groupCommentsIntoThreads(issue.comments?.nodes ?? []),
    },
  };
}

type NormalizedIssueReactions = ReturnType<typeof normalizeReactions>;

type IssueDetailWithReactions = Omit<
  NonNullable<GetIssueByIdWithReactionsQuery["issue"]>,
  "reactions"
> & {
  reactions: NormalizedIssueReactions;
};

type IssueByIdentifierWithReactions = Omit<
  GetIssueByIdentifierWithReactionsQuery["issues"]["nodes"][0],
  "reactions"
> & {
  reactions: NormalizedIssueReactions;
};

function normalizeIssueReactions<
  T extends { reactions: Parameters<typeof normalizeReactions>[0] },
>(issue: T): Omit<T, "reactions"> & { reactions: NormalizedIssueReactions } {
  return {
    ...issue,
    reactions: normalizeReactions(issue.reactions),
  };
}

export async function listIssues(
  client: GraphQLClient,
  options: IssueReadOptions = {},
  filter?: IssueFilter,
): Promise<PaginatedResult<IssueListItem>> {
  const { limit = 25, after, includeArchived = false } = options;

  if (filter) {
    const result = await client.request(FilteredSearchIssuesDocument, {
      first: limit,
      after,
      filter: buildListIssuesFilter(filter),
      orderBy: "updatedAt",
      includeArchived,
    });
    return {
      nodes: result.issues?.nodes ?? [],
      pageInfo: result.issues.pageInfo,
    };
  }

  const result = await client.request(GetIssuesDocument, {
    first: limit,
    after,
    orderBy: "updatedAt",
    includeArchived,
  });
  return {
    nodes: result.issues?.nodes ?? [],
    pageInfo: result.issues.pageInfo,
  };
}

export async function getIssue(
  client: GraphQLClient,
  id: UUID,
): Promise<IssueDetail> {
  const result = await client.request(GetIssueByIdDocument, {
    id,
  });
  if (!result.issue) {
    throw new Error(`Issue with ID "${id}" not found`);
  }
  return result.issue;
}

export async function getIssueWithComments(
  client: GraphQLClient,
  id: UUID,
): Promise<IssueDetailWithComments> {
  const result = await client.request(GetIssueByIdWithCommentsDocument, { id });
  if (!result.issue) {
    throw new Error(`Issue with ID "${id}" not found`);
  }
  return result.issue;
}

export async function getIssueWithCommentThreads(
  client: GraphQLClient,
  id: UUID,
): Promise<IssueDetailWithCommentThreads> {
  const issue = await getIssueWithComments(client, id);
  return threadIssueComments(issue);
}

export async function getIssueByIdentifier(
  client: GraphQLClient,
  teamKey: string,
  issueNumber: number,
): Promise<IssueByIdentifier> {
  const result = await client.request(GetIssueByIdentifierDocument, {
    teamKey,
    number: issueNumber,
  });
  return firstOrThrow(
    result.issues.nodes,
    `Issue with identifier "${teamKey}-${issueNumber}" not found`,
  );
}

export async function getIssueByIdentifierWithComments(
  client: GraphQLClient,
  teamKey: string,
  issueNumber: number,
): Promise<IssueByIdentifierWithComments> {
  const result = await client.request(
    GetIssueByIdentifierWithCommentsDocument,
    { teamKey, number: issueNumber },
  );
  return firstOrThrow(
    result.issues.nodes,
    `Issue with identifier "${teamKey}-${issueNumber}" not found`,
  );
}

export async function getIssueByIdentifierWithCommentThreads(
  client: GraphQLClient,
  teamKey: string,
  issueNumber: number,
): Promise<IssueByIdentifierWithCommentThreads> {
  const issue = await getIssueByIdentifierWithComments(
    client,
    teamKey,
    issueNumber,
  );
  return threadIssueComments(issue);
}

export async function getIssueWithReactions(
  client: GraphQLClient,
  id: UUID,
): Promise<IssueDetailWithReactions> {
  const result = await client.request(GetIssueByIdWithReactionsDocument, {
    id,
  });
  if (!result.issue) {
    throw new Error(`Issue with ID "${id}" not found`);
  }
  return normalizeIssueReactions(result.issue);
}

export async function getIssueByIdentifierWithReactions(
  client: GraphQLClient,
  teamKey: string,
  issueNumber: number,
): Promise<IssueByIdentifierWithReactions> {
  const result = await client.request(
    GetIssueByIdentifierWithReactionsDocument,
    { teamKey, number: issueNumber },
  );
  return normalizeIssueReactions(
    firstOrThrow(
      result.issues.nodes,
      `Issue with identifier "${teamKey}-${issueNumber}" not found`,
    ),
  );
}

export async function getIssueWithAttachments(
  client: GraphQLClient,
  id: UUID,
): Promise<IssueDetailWithAttachments> {
  const result = await client.request(GetIssueByIdWithAttachmentsDocument, {
    id,
  });
  if (!result.issue) {
    throw new Error(`Issue with ID "${id}" not found`);
  }
  return result.issue;
}

export async function getIssueByIdentifierWithAttachments(
  client: GraphQLClient,
  teamKey: string,
  issueNumber: number,
): Promise<IssueByIdentifierWithAttachments> {
  const result = await client.request(
    GetIssueByIdentifierWithAttachmentsDocument,
    { teamKey, number: issueNumber },
  );
  return firstOrThrow(
    result.issues.nodes,
    `Issue with identifier "${teamKey}-${issueNumber}" not found`,
  );
}

export async function searchIssues(
  client: GraphQLClient,
  term: string,
  options: IssueReadOptions = {},
  filter?: IssueFilter,
): Promise<PaginatedResult<IssueSearchResult>> {
  const { limit = 25, after, includeArchived = false } = options;
  const variables: SearchIssuesQueryVariables = {
    term,
    first: limit,
    after,
    includeArchived,
    ...(filter && { filter }),
  };
  const result = await client.request(SearchIssuesDocument, variables);
  return {
    nodes: result.searchIssues?.nodes ?? [],
    pageInfo: result.searchIssues.pageInfo,
  };
}

export async function createIssue(
  client: GraphQLClient,
  input: CreateIssueInput,
): Promise<CreatedIssue> {
  const gqlInput: IssueCreateInput = input;
  const result = await client.request(CreateIssueDocument, { input: gqlInput });
  return requireMutationEntity(
    result.issueCreate,
    "issue",
    "Failed to create issue",
  );
}

export async function updateIssue(
  client: GraphQLClient,
  id: UUID,
  input: UpdateIssueInput,
): Promise<UpdatedIssue> {
  const gqlInput: IssueUpdateInput = input;
  const result = await client.request(UpdateIssueDocument, {
    id,
    input: gqlInput,
  });
  return requireMutationEntity(
    result.issueUpdate,
    "issue",
    "Failed to update issue",
  );
}

export async function archiveIssue(
  client: GraphQLClient,
  id: UUID,
): Promise<IssueDetail> {
  const result = await client.request(ArchiveIssueDocument, { id });

  return requireMutationEntity(
    result.issueArchive,
    "entity",
    `Failed to archive issue "${id}"`,
  );
}

export async function unarchiveIssue(
  client: GraphQLClient,
  id: UUID,
): Promise<IssueDetail> {
  const result = await client.request(UnarchiveIssueDocument, { id });

  return requireMutationEntity(
    result.issueUnarchive,
    "entity",
    `Failed to unarchive issue "${id}"`,
  );
}

export async function deleteIssue(
  client: GraphQLClient,
  id: UUID,
): Promise<{ id: string; success: true }> {
  const result = await client.request(DeleteIssueDocument, {
    id,
  });

  if (!result.issueDelete.success || !result.issueDelete.entity?.id) {
    throw new Error(`Failed to delete issue "${id}"`);
  }

  return {
    id: result.issueDelete.entity.id,
    success: true,
  };
}
