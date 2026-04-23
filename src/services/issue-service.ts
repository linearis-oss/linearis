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
  type ArchiveIssueMutation,
  CreateIssueDocument,
  type CreateIssueMutation,
  DeleteIssueDocument,
  type DeleteIssueMutation,
  FilteredSearchIssuesDocument,
  type FilteredSearchIssuesQuery,
  GetIssueByIdDocument,
  GetIssueByIdentifierDocument,
  type GetIssueByIdentifierQuery,
  GetIssueByIdentifierWithAttachmentsDocument,
  type GetIssueByIdentifierWithAttachmentsQuery,
  GetIssueByIdentifierWithCommentsDocument,
  type GetIssueByIdentifierWithCommentsQuery,
  type GetIssueByIdQuery,
  GetIssueByIdWithAttachmentsDocument,
  type GetIssueByIdWithAttachmentsQuery,
  GetIssueByIdWithCommentsDocument,
  type GetIssueByIdWithCommentsQuery,
  GetIssuesDocument,
  type GetIssuesQuery,
  type IssueCreateInput,
  type IssueFilter,
  type IssueUpdateInput,
  PaginationOrderBy,
  SearchIssuesDocument,
  type SearchIssuesQuery,
  type SearchIssuesQueryVariables,
  UnarchiveIssueDocument,
  type UnarchiveIssueMutation,
  UpdateIssueDocument,
  type UpdateIssueMutation,
} from "../gql/graphql.js";

const NON_COMPLETED_ISSUES_FILTER: IssueFilter = {
  state: { type: { neq: "completed" } },
};

function buildListIssuesFilter(filter: IssueFilter): IssueFilter {
  return {
    and: [NON_COMPLETED_ISSUES_FILTER, filter],
  };
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

  return rootComments;
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

export async function listIssues(
  client: GraphQLClient,
  options: PaginationOptions = {},
  filter?: IssueFilter,
): Promise<PaginatedResult<Issue>> {
  const { limit = 25, after } = options;

  if (filter) {
    const result = await client.request<FilteredSearchIssuesQuery>(
      FilteredSearchIssuesDocument,
      {
        first: limit,
        after,
        filter: buildListIssuesFilter(filter),
        orderBy: PaginationOrderBy.UpdatedAt,
      },
    );
    return {
      nodes: result.issues?.nodes ?? [],
      pageInfo: result.issues.pageInfo,
    };
  }

  const result = await client.request<GetIssuesQuery>(GetIssuesDocument, {
    first: limit,
    after,
    orderBy: PaginationOrderBy.UpdatedAt,
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
  const result = await client.request<GetIssueByIdQuery>(GetIssueByIdDocument, {
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
  const result = await client.request<GetIssueByIdWithCommentsQuery>(
    GetIssueByIdWithCommentsDocument,
    { id },
  );
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
  const result = await client.request<GetIssueByIdentifierQuery>(
    GetIssueByIdentifierDocument,
    { teamKey, number: issueNumber },
  );
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
  const result = await client.request<GetIssueByIdentifierWithCommentsQuery>(
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

export async function getIssueWithAttachments(
  client: GraphQLClient,
  id: string,
): Promise<IssueDetailWithAttachments> {
  const result = await client.request<GetIssueByIdWithAttachmentsQuery>(
    GetIssueByIdWithAttachmentsDocument,
    { id },
  );
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
  const result = await client.request<GetIssueByIdentifierWithAttachmentsQuery>(
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
  const result = await client.request<SearchIssuesQuery>(
    SearchIssuesDocument,
    variables,
  );
  return {
    nodes: result.searchIssues?.nodes ?? [],
    pageInfo: result.searchIssues.pageInfo,
  };
}

export async function createIssue(
  client: GraphQLClient,
  input: IssueCreateInput,
): Promise<CreatedIssue> {
  const result = await client.request<CreateIssueMutation>(
    CreateIssueDocument,
    { input },
  );
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
  const result = await client.request<UpdateIssueMutation>(
    UpdateIssueDocument,
    { id, input },
  );
  if (!result.issueUpdate.success || !result.issueUpdate.issue) {
    throw new Error("Failed to update issue");
  }
  return result.issueUpdate.issue;
}

export async function archiveIssue(
  client: GraphQLClient,
  id: string,
): Promise<IssueDetail> {
  const result = await client.request<ArchiveIssueMutation>(
    ArchiveIssueDocument,
    { id },
  );

  if (!result.issueArchive.success || !result.issueArchive.entity) {
    throw new Error(`Failed to archive issue "${id}"`);
  }

  return result.issueArchive.entity;
}

export async function unarchiveIssue(
  client: GraphQLClient,
  id: string,
): Promise<IssueDetail> {
  const result = await client.request<UnarchiveIssueMutation>(
    UnarchiveIssueDocument,
    { id },
  );

  if (!result.issueUnarchive.success || !result.issueUnarchive.entity) {
    throw new Error(`Failed to unarchive issue "${id}"`);
  }

  return result.issueUnarchive.entity;
}

export async function deleteIssue(
  client: GraphQLClient,
  id: string,
): Promise<{ id: string; success: true }> {
  const result = await client.request<DeleteIssueMutation>(
    DeleteIssueDocument,
    {
      id,
    },
  );

  if (!result.issueDelete.success || !result.issueDelete.entity?.id) {
    throw new Error(`Failed to delete issue "${id}"`);
  }

  return {
    id: result.issueDelete.entity.id,
    success: true,
  };
}
