import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  CreatedIssue,
  Issue,
  IssueByIdentifier,
  IssueDetail,
  IssueSearchResult,
  UpdatedIssue,
} from "../common/types.js";
import {
  CreateIssueDocument,
  type CreateIssueMutation,
  GetIssueByIdDocument,
  GetIssueByIdentifierDocument,
  type GetIssueByIdentifierQuery,
  type GetIssueByIdQuery,
  GetIssuesDocument,
  type GetIssuesQuery,
  type IssueCreateInput,
  type IssueUpdateInput,
  SearchIssuesDocument,
  type SearchIssuesQuery,
  UpdateIssueDocument,
  type UpdateIssueMutation,
} from "../gql/graphql.js";

export async function listIssues(
  client: GraphQLClient,
  limit: number = 25,
): Promise<Issue[]> {
  const result = await client.request<GetIssuesQuery>(GetIssuesDocument, {
    first: limit,
    orderBy: "updatedAt",
  });
  return result.issues?.nodes ?? [];
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
  limit: number = 25,
): Promise<IssueSearchResult[]> {
  const result = await client.request<SearchIssuesQuery>(SearchIssuesDocument, {
    term,
    first: limit,
  });
  return result.searchIssues?.nodes ?? [];
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
