import type { LinearSdkClient } from "../client/linear-client.js";

export interface Team {
  id: string;
  key: string;
  name: string;
}

export async function listTeams(client: LinearSdkClient): Promise<Team[]> {
  const result = await client.sdk.teams();
  return result.nodes.map((team) => ({
    id: team.id,
    key: team.key,
    name: team.name,
  }));
}
