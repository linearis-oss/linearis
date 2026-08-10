import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { notFoundError } from "../common/errors.js";
import type { BrandUuidFields, UUID } from "../common/identifier.js";
import {
  requireMutationEntity,
  requireMutationSuccess,
} from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  ArchiveIssueDocument,
  BatchCreateIssuesDocument,
  type BatchCreateIssuesMutation,
  BatchUpdateIssuesDocument,
  CreateIssueDocument,
  type CreateIssueMutation,
  DeleteIssueDocument,
  FilteredSearchIssuesDocument,
  type FilteredSearchIssuesQuery,
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
  type IssueCreateInput,
  type IssueFilter,
  type IssueUpdateInput,
  IssueVcsBranchSearchDocument,
  type PaginationOrderBy,
  RemindOnIssueDocument,
  SearchIssuesDocument,
  type SearchIssuesQuery,
  type SearchIssuesQueryVariables,
  ShareIssueDocument,
  SubscribeToIssueDocument,
  UnarchiveIssueDocument,
  UnshareIssueDocument,
  UnsubscribeFromIssueDocument,
  UpdateIssueDocument,
  type UpdateIssueMutation,
} from "../gql/graphql.js";
import { normalizeReactions } from "./reaction-service.js";

// Issue projection types
export type IssueListItem = FilteredSearchIssuesQuery["issues"]["nodes"][0];
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
/** An issue as returned by the batch mutations (no comment payload). */
export type BatchIssue =
  BatchCreateIssuesMutation["issueBatchCreate"]["issues"][0];

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
    | "subscriberIds"
    | "delegateId"
  >,
  | "teamId"
  | "assigneeId"
  | "projectId"
  | "labelIds"
  | "projectMilestoneId"
  | "cycleId"
  | "stateId"
  | "parentId"
  | "subscriberIds"
  | "delegateId"
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
    | "teamId"
    | "subscriberIds"
    | "delegateId"
    | "snoozedUntilAt"
    | "trashed"
  >,
  | "stateId"
  | "assigneeId"
  | "projectId"
  | "labelIds"
  | "parentId"
  | "projectMilestoneId"
  | "cycleId"
  | "teamId"
  | "subscriberIds"
  | "delegateId"
>;

/**
 * Pagination plus the read-scope knobs shared by `listIssues` and
 * `searchIssues`. Archived issues are excluded unless asked for, matching the
 * Linear API default and the historical CLI behavior.
 */
export interface IssueReadOptions extends PaginationOptions {
  includeArchived?: boolean;
  /** Defaults to `updatedAt` — most-recently-touched first. */
  orderBy?: PaginationOrderBy;
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

/**
 * Applies the implicit "hide completed work" narrowing that `issues list`
 * has always had, unless the caller has already said something about state.
 *
 * `includeArchived` counts as saying something: archived issues are nearly
 * always completed or canceled, so keeping the default clause would make
 * `--include-archived` hide the very issues it was passed to surface.
 */
function buildListIssuesFilter(
  filter: IssueFilter | undefined,
  includeArchived: boolean,
): IssueFilter | undefined {
  if (includeArchived) {
    return filter;
  }

  if (!filter) {
    return NON_COMPLETED_ISSUES_FILTER;
  }

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
  const {
    limit = 25,
    after,
    includeArchived = false,
    orderBy = "updatedAt",
  } = options;

  // One query for both the filtered and the unfiltered path: the default
  // state narrowing lives in buildListIssuesFilter, so a query that hardcoded
  // it could not honor `--include-archived`.
  const result = await client.request(FilteredSearchIssuesDocument, {
    first: limit,
    after,
    filter: buildListIssuesFilter(filter, includeArchived),
    orderBy,
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

/**
 * Finds the issue a VCS branch belongs to.
 *
 * The reverse of the `branchName` field on a read payload.
 *
 * @throws Error if no issue owns the branch
 */
export async function findIssueByBranch(
  client: GraphQLClient,
  branchName: string,
): Promise<IssueDetail> {
  const result = await client.request(IssueVcsBranchSearchDocument, {
    branchName,
  });

  if (!result.issueVcsBranchSearch) {
    throw notFoundError("Issue for branch", branchName);
  }

  return result.issueVcsBranchSearch;
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

/**
 * Restores an issue from the trash.
 *
 * `issues delete` maps to `issueDelete`, which trashes rather than destroys;
 * `trashed: false` is the only way back, and `issueUnarchive` does not cover it
 * — archiving and trashing are separate states.
 */
export async function restoreIssue(
  client: GraphQLClient,
  id: UUID,
): Promise<UpdatedIssue> {
  return updateIssue(client, id, { trashed: false });
}

/**
 * Snoozes an issue until an instant, or wakes it with `null`.
 *
 * `snoozedById` is left to the API, which attributes the snooze to the
 * authenticated user.
 */
export async function snoozeIssue(
  client: GraphQLClient,
  id: UUID,
  snoozedUntilAt: string | null,
): Promise<UpdatedIssue> {
  return updateIssue(client, id, { snoozedUntilAt });
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

/**
 * Creates many issues in one `issueBatchCreate` transaction.
 *
 * Ordering of the returned issues follows the API response, which need not
 * match the input order — callers should key off `identifier`/`title` rather
 * than position.
 */
export async function batchCreateIssues(
  client: GraphQLClient,
  inputs: readonly CreateIssueInput[],
): Promise<BatchIssue[]> {
  const issues: IssueCreateInput[] = [...inputs];
  const result = await client.request(BatchCreateIssuesDocument, {
    input: { issues },
  });

  requireMutationSuccess(
    result.issueBatchCreate,
    `Failed to create ${inputs.length} issues`,
  );

  return result.issueBatchCreate.issues;
}

/** Applies one patch to every issue in an explicit UUID list. */
export async function batchUpdateIssues(
  client: GraphQLClient,
  ids: readonly UUID[],
  input: UpdateIssueInput,
): Promise<BatchIssue[]> {
  const gqlInput: IssueUpdateInput = input;
  const result = await client.request(BatchUpdateIssuesDocument, {
    ids: [...ids],
    input: gqlInput,
  });

  requireMutationSuccess(
    result.issueBatchUpdate,
    `Failed to update ${ids.length} issues`,
  );

  return result.issueBatchUpdate.issues;
}

/**
 * Adds a user to an issue's subscriber list.
 *
 * `issueSubscribe` also accepts `userEmail`, but the CLI resolves user
 * references to UUIDs in the resolver layer, so only `userId` is used.
 */
export async function subscribeToIssue(
  client: GraphQLClient,
  id: UUID,
  userId: UUID,
): Promise<UpdatedIssue> {
  const result = await client.request(SubscribeToIssueDocument, { id, userId });

  return requireMutationEntity(
    result.issueSubscribe,
    "issue",
    `Failed to subscribe user "${userId}" to issue "${id}"`,
  );
}

export async function unsubscribeFromIssue(
  client: GraphQLClient,
  id: UUID,
  userId: UUID,
): Promise<UpdatedIssue> {
  const result = await client.request(UnsubscribeFromIssueDocument, {
    id,
    userId,
  });

  return requireMutationEntity(
    result.issueUnsubscribe,
    "issue",
    `Failed to unsubscribe user "${userId}" from issue "${id}"`,
  );
}

/**
 * Grants a user access to an issue they cannot otherwise see.
 *
 * Note this is an access grant, not a link generator — the issue's permalink
 * is the `url` field on any read payload.
 */
export async function shareIssue(
  client: GraphQLClient,
  id: UUID,
  userId: UUID,
): Promise<UpdatedIssue> {
  const result = await client.request(ShareIssueDocument, { id, userId });

  return requireMutationEntity(
    result.issueShare,
    "issue",
    `Failed to share issue "${id}" with user "${userId}"`,
  );
}

export async function unshareIssue(
  client: GraphQLClient,
  id: UUID,
  userId: UUID,
): Promise<UpdatedIssue> {
  const result = await client.request(UnshareIssueDocument, { id, userId });

  return requireMutationEntity(
    result.issueUnshare,
    "issue",
    `Failed to unshare issue "${id}" from user "${userId}"`,
  );
}

/** Schedules a reminder for the authenticated user at an ISO-8601 instant. */
export async function remindOnIssue(
  client: GraphQLClient,
  id: UUID,
  reminderAt: string,
): Promise<UpdatedIssue> {
  const result = await client.request(RemindOnIssueDocument, {
    id,
    reminderAt,
  });

  return requireMutationEntity(
    result.issueReminder,
    "issue",
    `Failed to set a reminder on issue "${id}"`,
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
