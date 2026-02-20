import type { GraphQLClient } from "../client/graphql-client.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import { GetProjectsDocument, type GetProjectsQuery } from "../gql/graphql.js";

export interface Project {
  id: string;
  name: string;
  description: string;
  state: string;
  targetDate?: string;
  slugId: string;
}

export async function listProjects(
  client: GraphQLClient,
  options: PaginationOptions = {},
): Promise<PaginatedResult<Project>> {
  const { limit = 50, after } = options;
  const result = await client.request<GetProjectsQuery>(GetProjectsDocument, {
    first: limit,
    after,
  });

  return {
    nodes: result.projects.nodes.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      state: project.state,
      targetDate: project.targetDate ?? undefined,
      slugId: project.slugId,
    })),
    pageInfo: result.projects.pageInfo,
  };
}
