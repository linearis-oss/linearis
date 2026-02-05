import type { GraphQLClient } from "../client/graphql-client.js";
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
): Promise<Project[]> {
  const result = await client.request<GetProjectsQuery>(GetProjectsDocument, {
    first: 50,
  });

  return result.projects.nodes.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    state: project.state,
    targetDate: project.targetDate ?? undefined,
    slugId: project.slugId,
  }));
}
