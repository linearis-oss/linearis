import type { LinearSdkClient } from "../client/linear-client.js";

export interface Project {
  id: string;
  name: string;
  description: string;
  state: string;
  targetDate?: string;
  slugId: string;
}

export async function listProjects(
  client: LinearSdkClient,
): Promise<Project[]> {
  const result = await client.sdk.projects();

  return result.nodes.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    state: project.state,
    targetDate: project.targetDate
      ? new Date(project.targetDate).toISOString()
      : undefined,
    slugId: project.slugId,
  }));
}
