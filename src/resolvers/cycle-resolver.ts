import type { GraphQLClient } from "../client/graphql-client.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import {
  FindCycleGlobalDocument,
  FindCycleScopedDocument,
} from "../gql/graphql.js";
import { resolveTeamId } from "./team-resolver.js";

/**
 * Resolves cycle identifier to UUID.
 *
 * Accepts UUID or cycle name. When multiple cycles match a name,
 * prefers active > next > previous. Use teamFilter to disambiguate.
 *
 * @param client - GraphQL client
 * @param nameOrId - Cycle name or UUID
 * @param teamFilter - Optional team key/name/ID to scope search
 * @returns Cycle UUID
 * @throws Error if not found or multiple matches without clear preference
 */
export async function resolveCycleId(
  client: GraphQLClient,
  nameOrId: string,
  teamFilter?: string,
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  const matched = teamFilter
    ? (
        await client.request(FindCycleScopedDocument, {
          name: nameOrId,
          teamId: await resolveTeamId(client, teamFilter),
        })
      ).cycles.nodes
    : (await client.request(FindCycleGlobalDocument, { name: nameOrId })).cycles
        .nodes;

  const nodes = matched.map((cycle) => ({
    id: cycle.id,
    number: cycle.number,
    isActive: cycle.isActive,
    isNext: cycle.isNext,
    isPrevious: cycle.isPrevious,
    ...(cycle.startsAt
      ? { startsAt: new Date(cycle.startsAt).toISOString() }
      : {}),
    ...(cycle.team ? { team: { key: cycle.team.key } } : {}),
  }));

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

  return asUuid(chosen.id);
}
