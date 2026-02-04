import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  Issue,
  IssueDetail,
  IssueByIdentifier,
  IssueSearchResult,
  CreatedIssue,
  UpdatedIssue,
} from "../common/types.js";
import { isUuid, parseIssueIdentifier } from "../common/identifier.js";
import {
  GetIssuesDocument,
  type GetIssuesQuery,
  GetIssueByIdDocument,
  type GetIssueByIdQuery,
  GetIssueByIdentifierDocument,
  type GetIssueByIdentifierQuery,
  SearchIssuesDocument,
  type SearchIssuesQuery,
  CreateIssueDocument,
  type CreateIssueMutation,
  type IssueCreateInput,
  UpdateIssueDocument,
  type UpdateIssueMutation,
  type IssueUpdateInput,
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
): Promise<IssueDetail | IssueByIdentifier> {
  if (isUuid(id)) {
    const result = await client.request<GetIssueByIdQuery>(
      GetIssueByIdDocument,
      { id },
    );
    if (!result.issue) {
      throw new Error(`Issue with ID "${id}" not found`);
    }
    return result.issue;
  }

  const { teamKey, issueNumber } = parseIssueIdentifier(id);
  const result = await client.request<GetIssueByIdentifierQuery>(
    GetIssueByIdentifierDocument,
    { teamKey, number: issueNumber },
  );
  if (!result.issues.nodes.length) {
    throw new Error(`Issue with identifier "${id}" not found`);
  }
  return result.issues.nodes[0];
}

export async function searchIssues(
  client: GraphQLClient,
  term: string,
  limit: number = 25,
): Promise<IssueSearchResult[]> {
  const result = await client.request<SearchIssuesQuery>(
    SearchIssuesDocument,
    { term, first: limit },
  );
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
