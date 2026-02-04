import type { LinearSdkClient } from "../client/linear-client.js";

export interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

export async function listUsers(
  client: LinearSdkClient,
  activeOnly: boolean = false,
): Promise<User[]> {
  const filter = activeOnly ? { active: { eq: true } } : undefined;
  const result = await client.sdk.users({ filter });

  return result.nodes.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    active: user.active,
  }));
}
