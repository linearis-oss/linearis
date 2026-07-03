import type { GraphQLClient } from "../client/graphql-client.js";
import { requireMutationSuccess } from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  CreateIssueLabelDocument,
  DeleteIssueLabelDocument,
  GetIssueLabelDocument,
  GetLabelsDocument,
  GetProjectLabelsDocument,
  type IssueLabelCreateInput,
  type IssueLabelFilter,
  type IssueLabelUpdateInput,
  UpdateIssueLabelDocument,
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

export interface DeleteLabelResult {
  id: string;
  success: true;
}

export interface ListLabelOptions extends PaginationOptions {
  scope?: LabelScope;
}

// Service-owned input types (UUIDs pre-resolved by the command).
export type CreateLabelInput = Pick<
  IssueLabelCreateInput,
  "name" | "teamId" | "color" | "description"
>;
export type UpdateLabelInput = Pick<
  IssueLabelUpdateInput,
  "name" | "color" | "description"
>;

function mapIssueLabel(label: {
  id: string;
  name: string;
  color: string;
  description?: string | null;
}): Label {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description ?? undefined,
    type: "issue",
  };
}

export async function getLabel(
  client: GraphQLClient,
  id: string,
): Promise<Label> {
  const result = await client.request(GetIssueLabelDocument, {
    id,
  });

  if (!result.issueLabel) {
    throw new Error(`Label with ID "${id}" not found`);
  }

  return mapIssueLabel(result.issueLabel);
}

export async function createLabel(
  client: GraphQLClient,
  input: CreateLabelInput,
): Promise<Label> {
  const gqlInput: IssueLabelCreateInput = input;
  const result = await client.request(CreateIssueLabelDocument, {
    input: gqlInput,
  });

  requireMutationSuccess(
    result.issueLabelCreate,
    `Failed to create label "${input.name}"`,
  );

  return mapIssueLabel(result.issueLabelCreate.issueLabel);
}

export async function updateLabel(
  client: GraphQLClient,
  id: string,
  input: UpdateLabelInput,
): Promise<Label> {
  const gqlInput: IssueLabelUpdateInput = input;
  const result = await client.request(UpdateIssueLabelDocument, {
    id,
    input: gqlInput,
  });

  requireMutationSuccess(
    result.issueLabelUpdate,
    `Failed to update label "${id}"`,
  );

  return mapIssueLabel(result.issueLabelUpdate.issueLabel);
}

export async function deleteLabel(
  client: GraphQLClient,
  id: string,
): Promise<DeleteLabelResult> {
  const result = await client.request(DeleteIssueLabelDocument, { id });

  requireMutationSuccess(
    result.issueLabelDelete,
    `Failed to delete label "${id}"`,
  );

  return {
    id: result.issueLabelDelete.entityId,
    success: true,
  };
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
    nodes: result.issueLabels.nodes.map((label) => mapIssueLabel(label)),
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
