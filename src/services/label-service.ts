import type { GraphQLClient } from "../client/graphql-client.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  GetLabelsDocument,
  type GetLabelsQuery,
  GetProjectLabelsDocument,
  type GetProjectLabelsQuery,
} from "../gql/graphql.js";

export type LabelType = "issue" | "project";

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
  type: LabelType;
}

export async function listLabels(
  client: GraphQLClient,
  teamId?: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<Label>> {
  const { limit = 50, after } = options;
  const filter = teamId ? { team: { id: { eq: teamId } } } : undefined;

  const result = await client.request<GetLabelsQuery>(GetLabelsDocument, {
    first: limit,
    after,
    filter,
  });

  return {
    nodes: result.issueLabels.nodes.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description ?? undefined,
      type: "issue",
    })),
    pageInfo: result.issueLabels.pageInfo,
  };
}

export async function listProjectLabels(
  client: GraphQLClient,
  options: PaginationOptions = {},
): Promise<PaginatedResult<Label>> {
  const { limit = 50, after } = options;

  const result = await client.request<GetProjectLabelsQuery>(
    GetProjectLabelsDocument,
    {
      first: limit,
      after,
    },
  );

  return {
    nodes: result.projectLabels.nodes.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description ?? undefined,
      type: "project",
    })),
    pageInfo: result.projectLabels.pageInfo,
  };
}
