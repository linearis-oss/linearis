import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  CreatedProject,
  PaginatedResult,
  PaginationOptions,
  ProjectDetail,
  ProjectListItem,
  UpdatedProject,
} from "../common/types.js";
import {
  CreateProjectDocument,
  type CreateProjectMutation,
  GetProjectDocument,
  type GetProjectQuery,
  GetProjectsDocument,
  type GetProjectsQuery,
  type ProjectCreateInput,
  type ProjectUpdateInput,
  UpdateProjectDocument,
  type UpdateProjectMutation,
} from "../gql/graphql.js";

export async function listProjects(
  client: GraphQLClient,
  options: PaginationOptions = {},
): Promise<PaginatedResult<ProjectListItem>> {
  const { limit = 50, after } = options;
  const result = await client.request<GetProjectsQuery>(GetProjectsDocument, {
    first: limit,
    after,
  });

  return {
    nodes: result.projects.nodes,
    pageInfo: result.projects.pageInfo,
  };
}

export async function getProject(
  client: GraphQLClient,
  id: string,
): Promise<ProjectDetail> {
  const result = await client.request<GetProjectQuery>(GetProjectDocument, {
    id,
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
