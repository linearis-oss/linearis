import type { GraphQLClient } from "../client/graphql-client.js";
import { invalidParameterError } from "../common/errors.js";
import type { BrandUuidFields, UUID } from "../common/identifier.js";
import { requireMutationEntity } from "../common/mutation-payload.js";
import type { PaginatedResult } from "../common/types.js";
import {
  ArchiveProjectUpdateDocument,
  type ArchiveProjectUpdateMutation,
  CreateProjectUpdateDocument,
  type CreateProjectUpdateMutation,
  CreateProjectUpdateReminderDocument,
  EditProjectUpdateDocument,
  type EditProjectUpdateMutation,
  GetProjectUpdateDocument,
  type GetProjectUpdateQuery,
  ListProjectUpdatesDocument,
  type ListProjectUpdatesQuery,
  type ProjectUpdateCreateInput,
  type ProjectUpdateUpdateInput,
  UnarchiveProjectUpdateDocument,
  type UnarchiveProjectUpdateMutation,
} from "../gql/graphql.js";

// Project update projection types
export type ProjectUpdateListItem =
  ListProjectUpdatesQuery["projectUpdates"]["nodes"][0];
export type ProjectUpdateDetail = NonNullable<
  GetProjectUpdateQuery["projectUpdate"]
>;
export type CreatedProjectUpdate = NonNullable<
  CreateProjectUpdateMutation["projectUpdateCreate"]["projectUpdate"]
>;
export type EditedProjectUpdate = NonNullable<
  EditProjectUpdateMutation["projectUpdateUpdate"]["projectUpdate"]
>;
export type ArchivedProjectUpdate = NonNullable<
  ArchiveProjectUpdateMutation["projectUpdateArchive"]["entity"]
>;
export type UnarchivedProjectUpdate = NonNullable<
  UnarchiveProjectUpdateMutation["projectUpdateUnarchive"]["entity"]
>;
export type ProjectUpdateReminder = {
  projectId: string;
  success: true;
};

export interface ProjectUpdateListOptions {
  projectId: UUID;
  limit?: number;
  after?: string;
  includeArchived?: boolean;
}

// Service-owned input types (UUIDs pre-resolved by the command).
export type CreateProjectUpdateInput = BrandUuidFields<
  Pick<
    ProjectUpdateCreateInput,
    "projectId" | "body" | "health" | "isDiffHidden"
  >,
  "projectId"
>;
export type EditProjectUpdateInput = Pick<
  ProjectUpdateUpdateInput,
  "body" | "health"
>;

export async function listProjectUpdates(
  client: GraphQLClient,
  options: ProjectUpdateListOptions,
): Promise<PaginatedResult<ProjectUpdateListItem>> {
  const { projectId, limit = 50, after, includeArchived = false } = options;

  const result = await client.request(ListProjectUpdatesDocument, {
    projectId,
    first: limit,
    after,
    includeArchived,
  });

  return {
    nodes: result.projectUpdates.nodes,
    pageInfo: result.projectUpdates.pageInfo,
  };
}

export async function getProjectUpdate(
  client: GraphQLClient,
  id: UUID,
): Promise<ProjectUpdateDetail> {
  const result = await client.request(GetProjectUpdateDocument, { id });

  if (!result.projectUpdate) {
    throw new Error(`Project update with ID "${id}" not found`);
  }

  return result.projectUpdate;
}

export async function createProjectUpdate(
  client: GraphQLClient,
  input: CreateProjectUpdateInput,
): Promise<CreatedProjectUpdate> {
  const gqlInput: ProjectUpdateCreateInput = input;
  const result = await client.request(CreateProjectUpdateDocument, {
    input: gqlInput,
  });

  return requireMutationEntity(
    result.projectUpdateCreate,
    "projectUpdate",
    "Failed to create project update",
  );
}

export async function editProjectUpdate(
  client: GraphQLClient,
  id: UUID,
  input: EditProjectUpdateInput,
): Promise<EditedProjectUpdate> {
  const hasAtLeastOneField = Object.values(input).some(
    (value) => value !== undefined,
  );

  if (!hasAtLeastOneField) {
    throw invalidParameterError(
      "update options",
      "at least one update field must be provided",
    );
  }

  const gqlInput: ProjectUpdateUpdateInput = input;
  const result = await client.request(EditProjectUpdateDocument, {
    id,
    input: gqlInput,
  });

  return requireMutationEntity(
    result.projectUpdateUpdate,
    "projectUpdate",
    `Failed to update project update "${id}"`,
  );
}

export async function archiveProjectUpdate(
  client: GraphQLClient,
  id: UUID,
): Promise<ArchivedProjectUpdate> {
  const result = await client.request(ArchiveProjectUpdateDocument, { id });

  return requireMutationEntity(
    result.projectUpdateArchive,
    "entity",
    `Failed to archive project update "${id}"`,
  );
}

export async function unarchiveProjectUpdate(
  client: GraphQLClient,
  id: UUID,
): Promise<UnarchivedProjectUpdate> {
  const result = await client.request(UnarchiveProjectUpdateDocument, { id });

  return requireMutationEntity(
    result.projectUpdateUnarchive,
    "entity",
    `Failed to unarchive project update "${id}"`,
  );
}

/**
 * Asks Linear to notify someone that the project is due an update.
 *
 * The payload carries no entity, so the project is echoed back to keep the
 * JSON self-describing rather than returning a bare `{ success: true }`.
 */
export async function remindProjectUpdate(
  client: GraphQLClient,
  projectId: UUID,
  userId?: UUID,
): Promise<ProjectUpdateReminder> {
  const result = await client.request(CreateProjectUpdateReminderDocument, {
    projectId,
    userId,
  });

  if (!result.createProjectUpdateReminder.success) {
    throw new Error(
      `Failed to create an update reminder for project "${projectId}"`,
    );
  }

  return { projectId, success: true };
}
