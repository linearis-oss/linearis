import type { GraphQLClient } from "../client/graphql-client.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  GetLabelsDocument,
  GetProjectLabelsDocument,
  type IssueLabelFilter,
} from "../gql/graphql.js";

export type LabelType = "issue" | "project";
export type LabelScope = "workspace" | "team";

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
  type: LabelType;
}

export interface ListLabelOptions extends PaginationOptions {
  scope?: LabelScope;
}

function buildIssueLabelFilter(
  teamId?: string,
  scope?: LabelScope,
): IssueLabelFilter | undefined {
  if (scope === "workspace") {
    return { team: { null: true } };
  }

  if (scope === "team" && teamId) {
    return { team: { id: { eq: teamId }, null: false } };
  }

  if (teamId) {
    return { team: { id: { eq: teamId } } };
  }

  return undefined;
}

export async function listLabels(
  client: GraphQLClient,
  teamId?: string,
  options: ListLabelOptions = {},
): Promise<PaginatedResult<Label>> {
  const { limit = 50, after, scope } = options;
  const filter = buildIssueLabelFilter(teamId, scope);

  const result = await client.request(GetLabelsDocument, {
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

  const result = await client.request(GetProjectLabelsDocument, {
    first: limit,
    after,
  });

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
