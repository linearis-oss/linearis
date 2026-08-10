import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import type { UUID } from "../common/identifier.js";
import {
  requireMutationEntity,
  requireMutationSuccess,
} from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  CreateProjectRelationDocument,
  type CreateProjectRelationMutation,
  DeleteProjectRelationDocument,
  GetProjectRelationDocument,
  GetProjectRelationsDocument,
  type GetProjectRelationsQuery,
  ListAllProjectRelationsDocument,
  type ProjectRelationCoreFieldsFragment,
  UpdateProjectRelationDocument,
  type UpdateProjectRelationMutation,
} from "../gql/graphql.js";

/**
 * The literal Linear stores in `ProjectRelation.type`.
 *
 * The schema declares it as a bare `String!` with no enum, unlike
 * `IssueRelationType`. Every relation observed on a live workspace carried
 * `"dependency"`, and Linear's UI exposes no other kind of project link, so
 * the CLI writes that one value rather than offering a flag whose accepted
 * range nobody can enumerate.
 */
const PROJECT_RELATION_TYPE = "dependency";

/**
 * Rows read from each direction of a project's dependencies.
 *
 * Neither connection accepts a cursor the CLI could surface — `relations list`
 * reports `truncated` instead — so this bound is the whole read. 100 covers
 * any realistic project while keeping the query inside Linear's complexity
 * budget.
 */
const PROJECT_RELATION_PAGE_SIZE = 100;

/**
 * Which end of a project a relation attaches to.
 *
 * Also untyped `String!` in the schema. `"start"` and `"end"` are the values
 * observed live; they describe a point in time, not project-versus-milestone.
 * A milestone is selected separately, through `projectMilestoneId`.
 */
export type ProjectRelationAnchor = "start" | "end";

export const PROJECT_RELATION_ANCHORS = [
  "start",
  "end",
] as const satisfies readonly ProjectRelationAnchor[];

type ProjectRelation = ProjectRelationCoreFieldsFragment;
export type CreatedProjectRelation = NonNullable<
  CreateProjectRelationMutation["projectRelationCreate"]["projectRelation"]
>;
export type UpdatedProjectRelation = NonNullable<
  UpdateProjectRelationMutation["projectRelationUpdate"]["projectRelation"]
>;

type ProjectRelationsProject = NonNullable<GetProjectRelationsQuery["project"]>;

export interface ProjectRelationsResult {
  project: { id: string; name: string };
  /** Dependencies this project declares. */
  relations: ProjectRelation[];
  /** Dependencies other projects declare on this one. */
  inverseRelations: ProjectRelation[];
  /** True when either connection was cut off at `PROJECT_RELATION_PAGE_SIZE`. */
  truncated: boolean;
}

export interface CreateProjectRelationInput {
  projectId: UUID;
  relatedProjectId: UUID;
  anchorType: ProjectRelationAnchor;
  relatedAnchorType: ProjectRelationAnchor;
  projectMilestoneId?: UUID;
  relatedProjectMilestoneId?: UUID;
}

export interface UpdateProjectRelationInput {
  anchorType?: ProjectRelationAnchor;
  relatedAnchorType?: ProjectRelationAnchor;
  /** `null` detaches the relation from its milestone. */
  projectMilestoneId?: UUID | null;
  relatedProjectMilestoneId?: UUID | null;
}

async function fetchProjectRelations(
  client: GraphQLClient,
  projectId: UUID,
): Promise<ProjectRelationsProject> {
  const result = await client.request(GetProjectRelationsDocument, {
    projectId,
    first: PROJECT_RELATION_PAGE_SIZE,
  });

  if (!result.project) {
    throw notFoundError("Project", projectId);
  }

  return result.project;
}

export async function listProjectRelations(
  client: GraphQLClient,
  projectId: UUID,
): Promise<ProjectRelationsResult> {
  const project = await fetchProjectRelations(client, projectId);

  return {
    project: { id: project.id, name: project.name },
    relations: project.relations.nodes,
    inverseRelations: project.inverseRelations.nodes,
    truncated:
      project.relations.pageInfo.hasNextPage ||
      project.inverseRelations.pageInfo.hasNextPage,
  };
}

export async function getProjectRelation(
  client: GraphQLClient,
  id: UUID,
): Promise<ProjectRelation> {
  const result = await client.request(GetProjectRelationDocument, { id });

  if (!result.projectRelation) {
    throw notFoundError("Project relation", id);
  }

  return result.projectRelation;
}

/**
 * Every dependency in the workspace.
 *
 * The root connection accepts no filter, so this cannot be narrowed to one
 * project — {@link listProjectRelations} covers that. Useful when the
 * question is "what depends on what" rather than "what does this depend on".
 */
export async function listAllProjectRelations(
  client: GraphQLClient,
  options: PaginationOptions = {},
): Promise<PaginatedResult<ProjectRelation>> {
  const { limit = 50, after } = options;

  const result = await client.request(ListAllProjectRelationsDocument, {
    first: limit,
    after,
  });

  return {
    nodes: result.projectRelations.nodes,
    pageInfo: result.projectRelations.pageInfo,
  };
}

export async function createProjectRelation(
  client: GraphQLClient,
  input: CreateProjectRelationInput,
): Promise<CreatedProjectRelation> {
  const result = await client.request(CreateProjectRelationDocument, {
    input: { ...input, type: PROJECT_RELATION_TYPE },
  });

  return requireMutationEntity(
    result.projectRelationCreate,
    "projectRelation",
    `Failed to relate project "${input.projectId}" to "${input.relatedProjectId}"`,
  );
}

export async function updateProjectRelation(
  client: GraphQLClient,
  id: UUID,
  input: UpdateProjectRelationInput,
): Promise<UpdatedProjectRelation> {
  const result = await client.request(UpdateProjectRelationDocument, {
    id,
    input,
  });

  return requireMutationEntity(
    result.projectRelationUpdate,
    "projectRelation",
    `Failed to update project relation "${id}"`,
  );
}

export async function deleteProjectRelation(
  client: GraphQLClient,
  id: UUID,
): Promise<{ id: string; success: true }> {
  const result = await client.request(DeleteProjectRelationDocument, { id });

  requireMutationSuccess(
    result.projectRelationDelete,
    `Failed to delete project relation "${id}"`,
  );

  return { id: result.projectRelationDelete.entityId, success: true };
}
