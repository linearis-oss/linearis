import type { GraphQLClient } from "../client/graphql-client.js";
import type { BrandUuidFields, UUID } from "../common/identifier.js";
import {
  requireMutationEntity,
  requireMutationSuccess,
} from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  AddProjectLabelDocument,
  type AddProjectLabelMutation,
  CreateProjectDocument,
  type CreateProjectMutation,
  DeleteProjectDocument,
  DisableProjectExternalSyncDocument,
  type DisableProjectExternalSyncMutation,
  type ExternalSyncService,
  GetProjectDocument,
  type GetProjectQuery,
  GetProjectsDocument,
  type GetProjectsQuery,
  type ProjectCreateInput,
  type ProjectUpdateInput,
  RemoveProjectLabelDocument,
  SearchProjectsDocument,
  type SearchProjectsQuery,
  UnarchiveProjectDocument,
  type UnarchiveProjectMutation,
  UpdateProjectDocument,
  type UpdateProjectMutation,
} from "../gql/graphql.js";

// Project projection types
export type ProjectListItem = GetProjectsQuery["projects"]["nodes"][0];
export type ProjectDetail = NonNullable<GetProjectQuery["project"]>;
export type CreatedProject = NonNullable<
  CreateProjectMutation["projectCreate"]["project"]
>;
export type UpdatedProject = NonNullable<
  UpdateProjectMutation["projectUpdate"]["project"]
>;
export type UnarchivedProject = NonNullable<
  UnarchiveProjectMutation["projectUnarchive"]["entity"]
>;
export type ProjectSearchResult =
  SearchProjectsQuery["searchProjects"]["nodes"][0];
export type LabelledProject = NonNullable<
  AddProjectLabelMutation["projectAddLabel"]["project"]
>;
export type SyncDisabledProject = NonNullable<
  DisableProjectExternalSyncMutation["projectExternalSyncDisable"]["project"]
>;
export type DeletedProject = {
  id: string;
  success: true;
};

// Service-owned input types (UUIDs pre-resolved by the command).
export type CreateProjectInput = BrandUuidFields<
  Pick<
    ProjectCreateInput,
    | "name"
    | "teamIds"
    | "description"
    | "content"
    | "icon"
    | "color"
    | "leadId"
    | "memberIds"
    | "priority"
    | "statusId"
    | "startDate"
    | "targetDate"
    | "labelIds"
  >,
  "teamIds" | "leadId" | "memberIds" | "statusId" | "labelIds"
>;
export type UpdateProjectInput = BrandUuidFields<
  Pick<
    ProjectUpdateInput,
    | "name"
    | "description"
    | "content"
    | "icon"
    | "color"
    | "leadId"
    | "memberIds"
    | "priority"
    | "statusId"
    | "startDate"
    | "targetDate"
    | "teamIds"
    | "labelIds"
  >,
  "teamIds" | "leadId" | "memberIds" | "statusId" | "labelIds"
>;

export interface ProjectListOptions extends PaginationOptions {
  includeArchived?: boolean;
}

export interface ProjectSearchOptions extends ProjectListOptions {
  /** Narrows the search to projects owned by one team. */
  teamId?: UUID;
}

export interface ProjectDetailOptions {
  milestonesFirst?: number;
  issuesFirst?: number;
}

const DEFAULT_PROJECT_MILESTONES_FIRST = 25;
// 25 keeps the default read under Linear's 10000 complexity budget: each
// issue in the response costs ~260 (CompleteIssueFields carries four
// connections charged at their default page size), so 50 issues alone
// exceeded the budget and the default read failed on real workspaces (#276).
const DEFAULT_PROJECT_ISSUES_FIRST = 25;

function connectionFirstOrOneWhenSkipped(value: number): number {
  return value === 0 ? 1 : value;
}

export async function listProjects(
  client: GraphQLClient,
  options: ProjectListOptions = {},
): Promise<PaginatedResult<ProjectListItem>> {
  const { limit = 50, after, includeArchived } = options;
  const result = await client.request(GetProjectsDocument, {
    first: limit,
    after,
    includeArchived,
  });

  return {
    nodes: result.projects.nodes,
    pageInfo: result.projects.pageInfo,
  };
}

/**
 * Full-text search across projects.
 *
 * Results come back relevance-ordered from the API, so there is no
 * `orderBy` knob — supplying one would discard the ranking that makes the
 * search worth running. Mirrors `searchIssues`.
 */
export async function searchProjects(
  client: GraphQLClient,
  term: string,
  options: ProjectSearchOptions = {},
): Promise<PaginatedResult<ProjectSearchResult>> {
  const { limit = 25, after, includeArchived = false, teamId } = options;

  const result = await client.request(SearchProjectsDocument, {
    term,
    first: limit,
    after,
    includeArchived,
    teamId,
  });

  return {
    nodes: result.searchProjects.nodes,
    pageInfo: result.searchProjects.pageInfo,
  };
}

export async function getProject(
  client: GraphQLClient,
  id: UUID,
  options: ProjectDetailOptions = {},
): Promise<ProjectDetail> {
  const milestonesFirst =
    options.milestonesFirst ?? DEFAULT_PROJECT_MILESTONES_FIRST;
  const issuesFirst = options.issuesFirst ?? DEFAULT_PROJECT_ISSUES_FIRST;

  const result = await client.request(GetProjectDocument, {
    id,
    milestonesFirst: connectionFirstOrOneWhenSkipped(milestonesFirst),
    skipMilestones: milestonesFirst === 0,
    issuesFirst: connectionFirstOrOneWhenSkipped(issuesFirst),
    skipIssues: issuesFirst === 0,
  });

  if (!result.project) {
    throw new Error(`Project with ID "${id}" not found`);
  }

  return result.project;
}

export async function createProject(
  client: GraphQLClient,
  input: CreateProjectInput,
): Promise<CreatedProject> {
  const gqlInput: ProjectCreateInput = input;
  const result = await client.request(CreateProjectDocument, {
    input: gqlInput,
  });

  return requireMutationEntity(
    result.projectCreate,
    "project",
    `Failed to create project "${input.name}"`,
  );
}

export async function updateProject(
  client: GraphQLClient,
  id: UUID,
  input: UpdateProjectInput,
): Promise<UpdatedProject> {
  const gqlInput: ProjectUpdateInput = input;
  const result = await client.request(UpdateProjectDocument, {
    id,
    input: gqlInput,
  });

  return requireMutationEntity(
    result.projectUpdate,
    "project",
    `Failed to update project "${id}"`,
  );
}

/**
 * Adds or removes labels one at a time.
 *
 * `projectAddLabel`/`projectRemoveLabel` are incremental, so unlike the
 * full-replacement `labelIds` input they need no read of the project's
 * current labels and cannot drop labels this call never saw. Each mutation
 * takes a single label, so a multi-label request is a sequence; it runs in
 * order rather than concurrently, which leaves a comprehensible prefix
 * applied if one of them fails.
 *
 * Returns the project as of the last mutation.
 */
export async function applyProjectLabels(
  client: GraphQLClient,
  id: UUID,
  labelIds: UUID[],
  mode: "add" | "remove",
): Promise<LabelledProject> {
  let project: LabelledProject | undefined;

  for (const labelId of labelIds) {
    const payload =
      mode === "add"
        ? (await client.request(AddProjectLabelDocument, { id, labelId }))
            .projectAddLabel
        : (await client.request(RemoveProjectLabelDocument, { id, labelId }))
            .projectRemoveLabel;

    project = requireMutationEntity(
      payload,
      "project",
      `Failed to ${mode} label "${labelId}" on project "${id}"`,
    );
  }

  if (!project) {
    throw new Error(`No labels given to ${mode} on project "${id}"`);
  }

  return project;
}

/**
 * Restores a project from the trash.
 *
 * Linear has one put-away state for projects, so this is the inverse of
 * {@link deleteProject} — there is no separate archived state to restore from.
 */
export async function unarchiveProject(
  client: GraphQLClient,
  id: UUID,
): Promise<UnarchivedProject> {
  const result = await client.request(UnarchiveProjectDocument, { id });

  return requireMutationEntity(
    result.projectUnarchive,
    "entity",
    `Failed to unarchive project "${id}"`,
  );
}

/**
 * Stops one external tracker from pushing updates into the project.
 *
 * The link itself survives; only the sync stops. Mirrors the attachment
 * equivalent.
 */
export async function disableProjectExternalSync(
  client: GraphQLClient,
  projectId: UUID,
  syncSource: ExternalSyncService,
): Promise<SyncDisabledProject> {
  const result = await client.request(DisableProjectExternalSyncDocument, {
    projectId,
    syncSource,
  });

  return requireMutationEntity(
    result.projectExternalSyncDisable,
    "project",
    `Failed to disable ${syncSource} sync on project "${projectId}"`,
  );
}

/**
 * Trashes a project. Reversible via {@link unarchiveProject}.
 */
export async function deleteProject(
  client: GraphQLClient,
  id: UUID,
): Promise<DeletedProject> {
  const result = await client.request(DeleteProjectDocument, { id });

  requireMutationSuccess(
    result.projectDelete,
    `Failed to delete project "${id}"`,
  );

  return {
    id: result.projectDelete.entity?.id ?? id,
    success: true,
  };
}
