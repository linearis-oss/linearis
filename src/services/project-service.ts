import type { GraphQLClient } from "../client/graphql-client.js";
import {
  requireMutationEntity,
  requireMutationSuccess,
} from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  ArchiveProjectDocument,
  type ArchiveProjectMutation,
  CreateProjectDocument,
  type CreateProjectMutation,
  DeleteProjectDocument,
  GetProjectDocument,
  type GetProjectQuery,
  GetProjectsDocument,
  type GetProjectsQuery,
  type ProjectCreateInput,
  type ProjectUpdateInput,
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
export type ArchivedProject = NonNullable<
  ArchiveProjectMutation["projectArchive"]["entity"]
>;
export type UnarchivedProject = NonNullable<
  UnarchiveProjectMutation["projectUnarchive"]["entity"]
>;
export type DeletedProject = {
  id: string;
  success: true;
};

// Service-owned input types (UUIDs pre-resolved by the command).
export type CreateProjectInput = Pick<
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
>;
export type UpdateProjectInput = Pick<
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
>;

export interface ProjectListOptions extends PaginationOptions {
  includeArchived?: boolean;
}

export interface ProjectDetailOptions {
  milestonesFirst?: number;
  issuesFirst?: number;
}

const DEFAULT_PROJECT_MILESTONES_FIRST = 25;
const DEFAULT_PROJECT_ISSUES_FIRST = 50;

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

export async function getProject(
  client: GraphQLClient,
  id: string,
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
  id: string,
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

export async function archiveProject(
  client: GraphQLClient,
  id: string,
): Promise<ArchivedProject> {
  const result = await client.request(ArchiveProjectDocument, { id });

  return requireMutationEntity(
    result.projectArchive,
    "entity",
    `Failed to archive project "${id}"`,
  );
}

export async function unarchiveProject(
  client: GraphQLClient,
  id: string,
): Promise<UnarchivedProject> {
  const result = await client.request(UnarchiveProjectDocument, { id });

  return requireMutationEntity(
    result.projectUnarchive,
    "entity",
    `Failed to unarchive project "${id}"`,
  );
}

export async function deleteProject(
  client: GraphQLClient,
  id: string,
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
