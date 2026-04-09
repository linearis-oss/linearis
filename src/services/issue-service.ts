import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  CreatedIssue,
  Issue,
  IssueByIdentifier,
  IssueDetail,
  IssueSearchResult,
  PaginatedResult,
  PaginationOptions,
  UpdatedIssue,
} from "../common/types.js";
import {
  CreateIssueDocument,
  type CreateIssueMutation,
  FilteredSearchIssuesDocument,
  type FilteredSearchIssuesQuery,
  GetIssueByIdDocument,
  GetIssueByIdentifierDocument,
  type GetIssueByIdentifierQuery,
  type GetIssueByIdQuery,
  GetIssuesDocument,
  type GetIssuesQuery,
  type IssueCreateInput,
  type IssueFilter,
  type IssueUpdateInput,
  PaginationOrderBy,
  SearchIssuesDocument,
  type SearchIssuesQuery,
  type SearchIssuesQueryVariables,
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
