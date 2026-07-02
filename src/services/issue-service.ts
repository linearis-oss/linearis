import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  CreatedIssue,
  Issue,
  IssueByIdentifier,
  IssueByIdentifierWithAttachments,
  IssueByIdentifierWithComments,
  IssueByIdentifierWithCommentThreads,
  IssueComment,
  IssueCommentThread,
  IssueDetail,
  IssueDetailWithAttachments,
  IssueDetailWithComments,
  IssueDetailWithCommentThreads,
  IssueSearchResult,
  PaginatedResult,
  PaginationOptions,
  UpdatedIssue,
} from "../common/types.js";
import {
  ArchiveIssueDocument,
  CreateIssueDocument,
  DeleteIssueDocument,
  FilteredSearchIssuesDocument,
  GetIssueByIdDocument,
  GetIssueByIdentifierDocument,
  GetIssueByIdentifierWithAttachmentsDocument,
  GetIssueByIdentifierWithCommentsDocument,
  GetIssueByIdentifierWithReactionsDocument,
  type GetIssueByIdentifierWithReactionsQuery,
  GetIssueByIdWithAttachmentsDocument,
  GetIssueByIdWithCommentsDocument,
  GetIssueByIdWithReactionsDocument,
  type GetIssueByIdWithReactionsQuery,
  GetIssuesDocument,
  type IssueCreateInput,
  type IssueFilter,
  type IssueUpdateInput,
  SearchIssuesDocument,
  type SearchIssuesQueryVariables,
  UnarchiveIssueDocument,
  UpdateIssueDocument,
} from "../gql/graphql.js";
import { normalizeReactions } from "./reaction-service.js";

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
  options: PaginationOptions = {},
  filter?: IssueFilter,
): Promise<PaginatedResult<Issue>> {
  const { limit = 25, after } = options;

  if (filter) {
    const result = await client.request(FilteredSearchIssuesDocument, {
      first: limit,
      after,
      filter: buildListIssuesFilter(filter),
      orderBy: "updatedAt",
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
  });
  return {
    nodes: result.issues?.nodes ?? [],
    pageInfo: result.issues.pageInfo,
  };
}

export async function getIssue(
  client: GraphQLClient,
  id: string,
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
  id: string,
): Promise<IssueDetailWithComments> {
  const result = await client.request(GetIssueByIdWithCommentsDocument, { id });
  if (!result.issue) {
    throw new Error(`Issue with ID "${id}" not found`);
  }
  return result.issue;
}

export async function getIssueWithCommentThreads(
  client: GraphQLClient,
  id: string,
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
  if (!result.issues.nodes.length) {
    throw new Error(
      `Issue with identifier "${teamKey}-${issueNumber}" not found`,
    );
  }
  return result.issues.nodes[0];
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
  if (!result.issues.nodes.length) {
    throw new Error(
      `Issue with identifier "${teamKey}-${issueNumber}" not found`,
    );
  }
  return result.issues.nodes[0];
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
  id: string,
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
  if (!result.issues.nodes.length) {
    throw new Error(
      `Issue with identifier "${teamKey}-${issueNumber}" not found`,
    );
  }
  return normalizeIssueReactions(result.issues.nodes[0]);
}

export async function getIssueWithAttachments(
  client: GraphQLClient,
  id: string,
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
  if (!result.issues.nodes.length) {
    throw new Error(
      `Issue with identifier "${teamKey}-${issueNumber}" not found`,
    );
  }
  return result.issues.nodes[0];
}

export async function searchIssues(
  client: GraphQLClient,
  term: string,
  options: PaginationOptions = {},
  filter?: IssueFilter,
): Promise<PaginatedResult<IssueSearchResult>> {
  const { limit = 25, after } = options;
  const variables: SearchIssuesQueryVariables = {
    term,
    first: limit,
    after,
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
  input: IssueCreateInput,
): Promise<CreatedIssue> {
  const result = await client.request(CreateIssueDocument, { input });
  if (!result.issueCreate.success || !result.issueCreate.issue) {
    throw new Error("Failed to create issue");
  }
  return result.issueCreate.issue;
}

export async function updateIssue(
  client: GraphQLClient,
  id: string,
  input: IssueUpdateInput,
): Promise<UpdatedIssue> {
  const result = await client.request(UpdateIssueDocument, { id, input });
  if (!result.issueUpdate.success || !result.issueUpdate.issue) {
    throw new Error("Failed to update issue");
  }
  return result.issueUpdate.issue;
}

export async function archiveIssue(
  client: GraphQLClient,
  id: string,
): Promise<IssueDetail> {
  const result = await client.request(ArchiveIssueDocument, { id });

  if (!result.issueArchive.success || !result.issueArchive.entity) {
    throw new Error(`Failed to archive issue "${id}"`);
  }

  return result.issueArchive.entity;
}

export async function unarchiveIssue(
  client: GraphQLClient,
  id: string,
): Promise<IssueDetail> {
  const result = await client.request(UnarchiveIssueDocument, { id });

  if (!result.issueUnarchive.success || !result.issueUnarchive.entity) {
    throw new Error(`Failed to unarchive issue "${id}"`);
  }

  return result.issueUnarchive.entity;
}

export async function deleteIssue(
  client: GraphQLClient,
  id: string,
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
