import type { GraphQLClient } from "../client/graphql-client.js";
import { requireMutationEntity } from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
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

// Milestone projection types
export type MilestoneDetail = NonNullable<
  GetProjectMilestoneByIdQuery["projectMilestone"]
>;
export type MilestoneListItem =
  ListProjectMilestonesQuery["project"]["projectMilestones"]["nodes"][0];
export type CreatedMilestone = NonNullable<
  CreateProjectMilestoneMutation["projectMilestoneCreate"]["projectMilestone"]
>;
export type UpdatedMilestone = NonNullable<
  UpdateProjectMilestoneMutation["projectMilestoneUpdate"]["projectMilestone"]
>;

// Service-owned input types (UUIDs pre-resolved by the command).
export type CreateMilestoneInput = Pick<
  ProjectMilestoneCreateInput,
  "projectId" | "name" | "description" | "targetDate"
>;
export type UpdateMilestoneInput = Pick<
  ProjectMilestoneUpdateInput,
  "name" | "description" | "targetDate" | "sortOrder"
>;

export async function listMilestones(
  client: GraphQLClient,
  projectId: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<MilestoneListItem>> {
  const { limit = 50, after } = options;
  const result = await client.request(ListProjectMilestonesDocument, {
    projectId,
    first: limit,
    after,
  });

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
  const result = await client.request(GetProjectMilestoneByIdDocument, {
    id,
    issuesFirst: issuesLimit,
  });

  if (!result.projectMilestone) {
    throw new Error(`Milestone with ID "${id}" not found`);
  }

  return result.projectMilestone;
}

export async function createMilestone(
  client: GraphQLClient,
  input: CreateMilestoneInput,
): Promise<CreatedMilestone> {
  const gqlInput: ProjectMilestoneCreateInput = input;
  const result = await client.request(CreateProjectMilestoneDocument, {
    input: gqlInput,
  });

  return requireMutationEntity(
    result.projectMilestoneCreate,
    "projectMilestone",
    "Failed to create milestone",
  );
}

export async function updateMilestone(
  client: GraphQLClient,
  id: string,
  input: UpdateMilestoneInput,
): Promise<UpdatedMilestone> {
  const gqlInput: ProjectMilestoneUpdateInput = input;
  const result = await client.request(UpdateProjectMilestoneDocument, {
    id,
    input: gqlInput,
  });

  return requireMutationEntity(
    result.projectMilestoneUpdate,
    "projectMilestone",
    "Failed to update milestone",
  );
}
