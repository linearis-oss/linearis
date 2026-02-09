import type { LinearDocument } from "@linear/sdk";
import type { LinearSdkClient } from "../client/linear-client.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { isUuid } from "../common/identifier.js";
import { resolveTeamId } from "./team-resolver.js";

/**
 * Resolves cycle identifier to UUID.
 *
 * Accepts UUID or cycle name. When multiple cycles match a name,
 * prefers active > next > previous. Use teamFilter to disambiguate.
 *
 * @param client - Linear SDK client
 * @param nameOrId - Cycle name or UUID
 * @param teamFilter - Optional team key/name/ID to scope search
 * @returns Cycle UUID
 * @throws Error if not found or multiple matches without clear preference
 */
export async function resolveCycleId(
  client: LinearSdkClient,
  nameOrId: string,
  teamFilter?: string,
): Promise<string> {
  if (isUuid(nameOrId)) return nameOrId;

  const filter: LinearDocument.CycleFilter = {
    name: { eq: nameOrId },
  };

  if (teamFilter) {
    const teamId = await resolveTeamId(client, teamFilter);
    filter.team = { id: { eq: teamId } };
  }

  const cyclesConnection = await client.sdk.cycles({
    filter,
    first: 10,
  });

  const nodes: Array<{
    id: string;
    name: string;
    number: number;
    startsAt?: string;
    isActive: boolean;
    isNext: boolean;
    isPrevious: boolean;
    team?: { id: string; key: string; name: string };
  }> = [];

  for (const cycle of cyclesConnection.nodes) {
    const team = await cycle.team;
    nodes.push({
      id: cycle.id,
      name: cycle.name ?? "",
      number: cycle.number,
      startsAt: cycle.startsAt
        ? new Date(cycle.startsAt).toISOString()
        : undefined,
      isActive: cycle.isActive,
      isNext: cycle.isNext,
      isPrevious: cycle.isPrevious,
      team: team ? { id: team.id, key: team.key, name: team.name } : undefined,
    });
  }

  if (nodes.length === 0) {
    throw notFoundError(
      "Cycle",
      nameOrId,
      teamFilter ? `for team ${teamFilter}` : undefined,
    );
  }

  // Disambiguate: prefer active, then next, then previous
  let chosen = nodes.find((n) => n.isActive);
  if (!chosen) chosen = nodes.find((n) => n.isNext);
  if (!chosen) chosen = nodes.find((n) => n.isPrevious);
  if (!chosen && nodes.length === 1) chosen = nodes[0];

  if (!chosen) {
    const matches = nodes.map(
      (n) => `${n.id} (${n.team?.key || "?"} / #${n.number} / ${n.startsAt})`,
    );
    throw multipleMatchesError(
      "cycle",
      nameOrId,
      matches,
      "use an ID or scope with --team",
    );
  }

  return chosen.id;
}
