import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  CreatedMilestone,
  MilestoneDetail,
  MilestoneListItem,
  PaginatedResult,
  PaginationOptions,
  UpdatedMilestone,
} from "../common/types.js";
import {
  CreateProjectMilestoneDocument,
  type CreateProjectMilestoneMutation,
  GetProjectMilestoneByIdDocument,
  type GetProjectMilestoneByIdQuery,
  ListProjectMilestonesDocument,
  type ListProjectMilestonesQuery,
  type ProjectMilestoneCreateInput,
  type ProjectMilestoneUpdateInput,
  UpdateProjectMilestoneDocument,
  type UpdateProjectMilestoneMutation,
} from "../gql/graphql.js";

export async function listMilestones(
  client: GraphQLClient,
  projectId: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<MilestoneListItem>> {
  const { limit = 50, after } = options;
  const result = await client.request<ListProjectMilestonesQuery>(
    ListProjectMilestonesDocument,
    { projectId, first: limit, after },
  );

  return {
    nodes: result.project?.projectMilestones?.nodes ?? [],
    pageInfo: result.project?.projectMilestones?.pageInfo ?? {
      hasNextPage: false,
      endCursor: null,
    },
  };
}

export async function getMilestone(
  client: GraphQLClient,
  id: string,
  issuesLimit?: number,
): Promise<MilestoneDetail> {
  const result = await client.request<GetProjectMilestoneByIdQuery>(
    GetProjectMilestoneByIdDocument,
    { id, issuesFirst: issuesLimit },
  );

  if (!result.projectMilestone) {
    throw new Error(`Milestone with ID "${id}" not found`);
  }

  return result.projectMilestone;
}

export async function createMilestone(
  client: GraphQLClient,
  input: ProjectMilestoneCreateInput,
): Promise<CreatedMilestone> {
  const result = await client.request<CreateProjectMilestoneMutation>(
    CreateProjectMilestoneDocument,
    { input },
  );

  if (
    !result.projectMilestoneCreate.success ||
    !result.projectMilestoneCreate.projectMilestone
  ) {
    throw new Error("Failed to create milestone");
  }

  return result.projectMilestoneCreate.projectMilestone;
}

export async function updateMilestone(
  client: GraphQLClient,
  id: string,
  input: ProjectMilestoneUpdateInput,
): Promise<UpdatedMilestone> {
  const result = await client.request<UpdateProjectMilestoneMutation>(
    UpdateProjectMilestoneDocument,
    { id, input },
  );

  if (
    !result.projectMilestoneUpdate.success ||
    !result.projectMilestoneUpdate.projectMilestone
  ) {
    throw new Error("Failed to update milestone");
  }

  return result.projectMilestoneUpdate.projectMilestone;
}
