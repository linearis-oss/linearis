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

/**
 * How many statuses one page of the flow carries.
 *
 * Raises the API's default of 50, which a workspace with a long archive can
 * pass. Stated here rather than left to the query default so the bound and
 * the message that reports hitting it cannot drift apart.
 */
const PROJECT_STATUS_PAGE_SIZE = 250;

// Project status projection types
type ProjectStatusListItem =
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

export interface ProjectStatusListResult {
  nodes: ProjectStatusListItem[];
  /** True when the workspace holds more statuses than one page carries. */
  truncated: boolean;
}

export async function listProjectStatuses(
  client: GraphQLClient,
  includeArchived = false,
): Promise<ProjectStatusListResult> {
  const result = await client.request(ListProjectStatusesDocument, {
    includeArchived,
    first: PROJECT_STATUS_PAGE_SIZE,
  });

  return {
    nodes: result.projectStatuses.nodes,
    truncated: result.projectStatuses.pageInfo.hasNextPage,
  };
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
 *
 * Archived statuses are counted: they keep their position and can be
 * unarchived at any time, so skipping them would hand the new status a
 * position that an archived one already holds.
 *
 * A truncated page defeats that reasoning for the same reason — the statuses
 * it left out are exactly the ones whose positions would collide — so it is
 * refused rather than turned into a position that looks free and is not.
 */
async function nextProjectStatusPosition(
  client: GraphQLClient,
): Promise<number> {
  const { nodes, truncated } = await listProjectStatuses(client, true);

  if (truncated) {
    throw new Error(
      `The workspace has more than ${PROJECT_STATUS_PAGE_SIZE} project ` +
        "statuses, so the end of the flow cannot be found. Pass an explicit " +
        "`--position` to place the new status.",
    );
  }

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
