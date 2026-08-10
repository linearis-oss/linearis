import type { GraphQLClient } from "../client/graphql-client.js";
import { invalidParameterError } from "../common/errors.js";
import type { UUID } from "../common/identifier.js";
import { requireMutationEntity } from "../common/mutation-payload.js";
import {
  ArchiveProjectStatusDocument,
  type ArchiveProjectStatusMutation,
  CreateProjectStatusDocument,
  type CreateProjectStatusMutation,
  GetProjectStatusDocument,
  GetProjectStatusProjectCountDocument,
  type GetProjectStatusProjectCountQuery,
  type GetProjectStatusQuery,
  ListProjectStatusesDocument,
  type ListProjectStatusesQuery,
  type ProjectStatusCreateInput,
  type ProjectStatusUpdateInput,
  ReassignProjectStatusDocument,
  UnarchiveProjectStatusDocument,
  type UnarchiveProjectStatusMutation,
  UpdateProjectStatusDocument,
  type UpdateProjectStatusMutation,
} from "../gql/graphql.js";

// Project status projection types
export type ProjectStatusListItem =
  ListProjectStatusesQuery["projectStatuses"]["nodes"][0];
export type ProjectStatusDetail = NonNullable<
  GetProjectStatusQuery["projectStatus"]
> & {
  projectCount: GetProjectStatusProjectCountQuery["projectStatusProjectCount"];
};
export type CreatedProjectStatus = NonNullable<
  CreateProjectStatusMutation["projectStatusCreate"]["status"]
>;
export type UpdatedProjectStatus = NonNullable<
  UpdateProjectStatusMutation["projectStatusUpdate"]["status"]
>;
export type ArchivedProjectStatus = NonNullable<
  ArchiveProjectStatusMutation["projectStatusArchive"]["entity"]
>;
export type UnarchivedProjectStatus = NonNullable<
  UnarchiveProjectStatusMutation["projectStatusUnarchive"]["entity"]
>;

// Service-owned input types. Project statuses carry no UUID references,
// so these are the codegen inputs unchanged apart from `position`.
export type CreateProjectStatusInput = Omit<
  ProjectStatusCreateInput,
  "id" | "position"
> & {
  /** Omitted places the status last in the workspace flow. */
  position?: number;
};
export type UpdateProjectStatusInput = ProjectStatusUpdateInput;

export async function listProjectStatuses(
  client: GraphQLClient,
  includeArchived = false,
): Promise<{ nodes: ProjectStatusListItem[] }> {
  const result = await client.request(ListProjectStatusesDocument, {
    includeArchived,
  });

  return { nodes: result.projectStatuses.nodes };
}

/**
 * Reads one status together with how many projects sit in it.
 *
 * The count is what decides whether {@link archiveProjectStatus} will be
 * refused, so returning the status without it would leave callers making a
 * second call they cannot know they need.
 */
export async function getProjectStatus(
  client: GraphQLClient,
  id: UUID,
): Promise<ProjectStatusDetail> {
  const [statusResult, countResult] = await Promise.all([
    client.request(GetProjectStatusDocument, { id }),
    client.request(GetProjectStatusProjectCountDocument, { id }),
  ]);

  if (!statusResult.projectStatus) {
    throw new Error(`Project status with ID "${id}" not found`);
  }

  return {
    ...statusResult.projectStatus,
    projectCount: countResult.projectStatusProjectCount,
  };
}

/**
 * Appends a status to the end of the workspace flow.
 *
 * `position` is required by the API but rarely what a caller has in mind, so
 * an omitted position reads the current flow and takes the next slot.
 */
async function nextProjectStatusPosition(
  client: GraphQLClient,
): Promise<number> {
  const { nodes } = await listProjectStatuses(client);
  const highest = nodes.reduce(
    (max, status) => Math.max(max, status.position),
    0,
  );

  return highest + 1;
}

export async function createProjectStatus(
  client: GraphQLClient,
  input: CreateProjectStatusInput,
): Promise<CreatedProjectStatus> {
  const { position, ...rest } = input;
  const gqlInput: ProjectStatusCreateInput = {
    ...rest,
    position: position ?? (await nextProjectStatusPosition(client)),
  };

  const result = await client.request(CreateProjectStatusDocument, {
    input: gqlInput,
  });

  return requireMutationEntity(
    result.projectStatusCreate,
    "status",
    `Failed to create project status "${input.name}"`,
  );
}

export async function updateProjectStatus(
  client: GraphQLClient,
  id: UUID,
  input: UpdateProjectStatusInput,
): Promise<UpdatedProjectStatus> {
  const hasAtLeastOneField = Object.values(input).some(
    (value) => value !== undefined,
  );

  if (!hasAtLeastOneField) {
    throw invalidParameterError(
      "update options",
      "at least one update field must be provided",
    );
  }

  const result = await client.request(UpdateProjectStatusDocument, {
    id,
    input,
  });

  return requireMutationEntity(
    result.projectStatusUpdate,
    "status",
    `Failed to update project status "${id}"`,
  );
}

/**
 * Moves every project off one status and onto another.
 *
 * Exposed only through `projects statuses archive --reassign-to`, because
 * Linear marks the mutation `[INTERNAL]` and reassignment on its own is not
 * a task anyone sets out to do.
 */
export async function reassignProjectStatus(
  client: GraphQLClient,
  originalProjectStatusId: UUID,
  newProjectStatusId: UUID,
): Promise<void> {
  const result = await client.request(ReassignProjectStatusDocument, {
    originalProjectStatusId,
    newProjectStatusId,
  });

  if (!result.projectReassignStatus.success) {
    throw new Error(
      `Failed to reassign projects from status "${originalProjectStatusId}" ` +
        `to "${newProjectStatusId}"`,
    );
  }
}

export async function archiveProjectStatus(
  client: GraphQLClient,
  id: UUID,
): Promise<ArchivedProjectStatus> {
  const result = await client.request(ArchiveProjectStatusDocument, { id });

  return requireMutationEntity(
    result.projectStatusArchive,
    "entity",
    `Failed to archive project status "${id}"`,
  );
}

export async function unarchiveProjectStatus(
  client: GraphQLClient,
  id: UUID,
): Promise<UnarchivedProjectStatus> {
  const result = await client.request(UnarchiveProjectStatusDocument, { id });

  return requireMutationEntity(
    result.projectStatusUnarchive,
    "entity",
    `Failed to unarchive project status "${id}"`,
  );
}
