import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  ArchivedProject,
  CreatedProject,
  DeletedProject,
  PaginatedResult,
  PaginationOptions,
  ProjectDetail,
  ProjectListItem,
  UnarchivedProject,
  UpdatedProject,
} from "../common/types.js";
import {
  ArchiveProjectDocument,
  type ArchiveProjectMutation,
  CreateProjectDocument,
  type CreateProjectMutation,
  DeleteProjectDocument,
  type DeleteProjectMutation,
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
  const result = await client.request<GetProjectsQuery>(GetProjectsDocument, {
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

  const result = await client.request<GetProjectQuery>(GetProjectDocument, {
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
  input: ProjectCreateInput,
): Promise<CreatedProject> {
  const result = await client.request<CreateProjectMutation>(
    CreateProjectDocument,
    { input },
  );

  if (!result.projectCreate.success || !result.projectCreate.project) {
    throw new Error(`Failed to create project "${input.name}"`);
  }

  return result.projectCreate.project;
}

export async function updateProject(
  client: GraphQLClient,
  id: string,
  input: ProjectUpdateInput,
): Promise<UpdatedProject> {
  const result = await client.request<UpdateProjectMutation>(
    UpdateProjectDocument,
    { id, input },
  );

  if (!result.projectUpdate.success || !result.projectUpdate.project) {
    throw new Error(`Failed to update project "${id}"`);
  }

  return result.projectUpdate.project;
}

export async function archiveProject(
  client: GraphQLClient,
  id: string,
): Promise<ArchivedProject> {
  const result = await client.request<ArchiveProjectMutation>(
    ArchiveProjectDocument,
    { id },
  );

  if (!result.projectArchive.success || !result.projectArchive.entity) {
    throw new Error(`Failed to archive project "${id}"`);
  }

  return result.projectArchive.entity;
}

export async function unarchiveProject(
  client: GraphQLClient,
  id: string,
): Promise<UnarchivedProject> {
  const result = await client.request<UnarchiveProjectMutation>(
    UnarchiveProjectDocument,
    { id },
  );

  if (!result.projectUnarchive.success || !result.projectUnarchive.entity) {
    throw new Error(`Failed to unarchive project "${id}"`);
  }

  return result.projectUnarchive.entity;
}

export async function deleteProject(
  client: GraphQLClient,
  id: string,
): Promise<DeletedProject> {
  const result = await client.request<DeleteProjectMutation>(
    DeleteProjectDocument,
    { id },
  );

  if (!result.projectDelete.success) {
    throw new Error(`Failed to delete project "${id}"`);
  }

  return {
    id: result.projectDelete.entity?.id ?? id,
    success: true,
  };
}
