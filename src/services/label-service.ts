import type { LinearSdkClient } from "../client/linear-client.js";

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export async function listLabels(
  client: LinearSdkClient,
  teamId?: string,
): Promise<Label[]> {
  const filter = teamId
    ? { team: { id: { eq: teamId } } }
    : undefined;

  const result = await client.sdk.issueLabels({ filter });

  return result.nodes.map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description,
  }));
}
