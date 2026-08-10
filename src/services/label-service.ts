import type { GraphQLClient } from "../client/graphql-client.js";
import type { BrandUuidFields, UUID } from "../common/identifier.js";
import { requireMutationSuccess } from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  CreateIssueLabelDocument,
  CreateProjectLabelDocument,
  DeleteIssueLabelDocument,
  DeleteProjectLabelDocument,
  GetIssueLabelDocument,
  GetLabelsDocument,
  GetProjectLabelDocument,
  GetProjectLabelsDocument,
  type IssueLabelCreateInput,
  type IssueLabelFilter,
  type IssueLabelUpdateInput,
  RestoreIssueLabelDocument,
  RestoreProjectLabelDocument,
  RetireIssueLabelDocument,
  RetireProjectLabelDocument,
  UpdateIssueLabelDocument,
  UpdateProjectLabelDocument,
} from "../gql/graphql.js";

export type LabelType = "issue" | "project";
export type LabelScope = "workspace" | "team";

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
  type: LabelType;
  /** True when the label is a container for child labels rather than a tag. */
  isGroup: boolean;
  /** Set while the label is retired: still readable, not applicable. */
  retiredAt?: string;
  parent?: { id: string; name: string };
}

export interface DeleteLabelResult {
  id: string;
  success: true;
}

export interface ListLabelOptions extends PaginationOptions {
  scope?: LabelScope;
}

/**
 * Service-owned input types (UUIDs pre-resolved by the command).
 *
 * `IssueLabelCreateInput` and `ProjectLabelCreateInput` declare the same
 * fields apart from `teamId`, which project labels do not have because they
 * are always workspace-scoped. One input type therefore covers both, and the
 * project path drops `teamId`.
 */
export type CreateLabelInput = BrandUuidFields<
  Pick<
    IssueLabelCreateInput,
    "name" | "teamId" | "color" | "description" | "parentId" | "isGroup"
  >,
  "teamId" | "parentId"
>;
export type UpdateLabelInput = BrandUuidFields<
  Pick<
    IssueLabelUpdateInput,
    "name" | "color" | "description" | "parentId" | "isGroup"
  >,
  "parentId"
>;

/** The shape both `IssueLabel` and `ProjectLabel` fragments select. */
interface LabelNode {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  isGroup: boolean;
  retiredAt?: string | null;
  parent?: { id: string; name: string } | null;
}

function mapLabel(label: LabelNode, type: LabelType): Label {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    type,
    isGroup: label.isGroup,
    ...(label.description != null ? { description: label.description } : {}),
    ...(label.retiredAt != null ? { retiredAt: label.retiredAt } : {}),
    ...(label.parent != null ? { parent: label.parent } : {}),
  };
}

export async function getLabel(
  client: GraphQLClient,
  id: UUID,
  type: LabelType = "issue",
): Promise<Label> {
  if (type === "project") {
    const result = await client.request(GetProjectLabelDocument, { id });

    if (!result.projectLabel) {
      throw new Error(`Project label with ID "${id}" not found`);
    }

    return mapLabel(result.projectLabel, "project");
  }

  const result = await client.request(GetIssueLabelDocument, { id });

  if (!result.issueLabel) {
    throw new Error(`Label with ID "${id}" not found`);
  }

  return mapLabel(result.issueLabel, "issue");
}

export async function createLabel(
  client: GraphQLClient,
  input: CreateLabelInput,
  type: LabelType = "issue",
): Promise<Label> {
  if (type === "project") {
    const { teamId: _workspaceScopedOnly, ...projectInput } = input;
    const result = await client.request(CreateProjectLabelDocument, {
      input: projectInput,
    });

    requireMutationSuccess(
      result.projectLabelCreate,
      `Failed to create project label "${input.name}"`,
    );

    return mapLabel(result.projectLabelCreate.projectLabel, "project");
  }

  const gqlInput: IssueLabelCreateInput = input;
  const result = await client.request(CreateIssueLabelDocument, {
    input: gqlInput,
  });

  requireMutationSuccess(
    result.issueLabelCreate,
    `Failed to create label "${input.name}"`,
  );

  return mapLabel(result.issueLabelCreate.issueLabel, "issue");
}

export async function updateLabel(
  client: GraphQLClient,
  id: UUID,
  input: UpdateLabelInput,
  type: LabelType = "issue",
): Promise<Label> {
  if (type === "project") {
    const result = await client.request(UpdateProjectLabelDocument, {
      id,
      input,
    });

    requireMutationSuccess(
      result.projectLabelUpdate,
      `Failed to update project label "${id}"`,
    );

    return mapLabel(result.projectLabelUpdate.projectLabel, "project");
  }

  const gqlInput: IssueLabelUpdateInput = input;
  const result = await client.request(UpdateIssueLabelDocument, {
    id,
    input: gqlInput,
  });

  requireMutationSuccess(
    result.issueLabelUpdate,
    `Failed to update label "${id}"`,
  );

  return mapLabel(result.issueLabelUpdate.issueLabel, "issue");
}

export async function deleteLabel(
  client: GraphQLClient,
  id: UUID,
  type: LabelType = "issue",
): Promise<DeleteLabelResult> {
  if (type === "project") {
    const result = await client.request(DeleteProjectLabelDocument, { id });

    requireMutationSuccess(
      result.projectLabelDelete,
      `Failed to delete project label "${id}"`,
    );

    return { id: result.projectLabelDelete.entityId, success: true };
  }

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

/**
 * Retires a label: it stays on whatever already carries it, but cannot be
 * applied to anything new. The reversible alternative to deleting.
 */
export async function retireLabel(
  client: GraphQLClient,
  id: UUID,
  type: LabelType = "issue",
): Promise<Label> {
  if (type === "project") {
    const result = await client.request(RetireProjectLabelDocument, { id });

    requireMutationSuccess(
      result.projectLabelRetire,
      `Failed to retire project label "${id}"`,
    );

    return mapLabel(result.projectLabelRetire.projectLabel, "project");
  }

  const result = await client.request(RetireIssueLabelDocument, { id });

  requireMutationSuccess(
    result.issueLabelRetire,
    `Failed to retire label "${id}"`,
  );

  return mapLabel(result.issueLabelRetire.issueLabel, "issue");
}

export async function restoreLabel(
  client: GraphQLClient,
  id: UUID,
  type: LabelType = "issue",
): Promise<Label> {
  if (type === "project") {
    const result = await client.request(RestoreProjectLabelDocument, { id });

    requireMutationSuccess(
      result.projectLabelRestore,
      `Failed to restore project label "${id}"`,
    );

    return mapLabel(result.projectLabelRestore.projectLabel, "project");
  }

  const result = await client.request(RestoreIssueLabelDocument, { id });

  requireMutationSuccess(
    result.issueLabelRestore,
    `Failed to restore label "${id}"`,
  );

  return mapLabel(result.issueLabelRestore.issueLabel, "issue");
}

function buildIssueLabelFilter(
  teamId?: UUID,
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
  teamId?: UUID,
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
    nodes: result.issueLabels.nodes.map((label) => mapLabel(label, "issue")),
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
    nodes: result.projectLabels.nodes.map((label) =>
      mapLabel(label, "project"),
    ),
    pageInfo: result.projectLabels.pageInfo,
  };
}
