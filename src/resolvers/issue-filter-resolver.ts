import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import {
  asUuid,
  isUuid,
  parseIssueIdentifier,
  type UUID,
} from "../common/identifier.js";
import { BatchResolveForSearchDocument } from "../gql/graphql.js";
import {
  buildLabelFilter,
  mapCycle,
  mapLabels,
  mapParent,
  mapProjectId,
  mapUser,
} from "./batch-resolve-mappers.js";
import { resolveStatusId } from "./status-resolver.js";

export interface SearchFilterResolutionInput {
  team?: string;
  assignee?: string;
  creator?: string;
  project?: string;
  statusNames?: string[];
  labelNames?: string[];
  cycle?: string;
  parent?: string;
}

export interface SearchFilterResolution {
  teamId?: UUID;
  assigneeId?: UUID;
  creatorId?: UUID;
  projectId?: UUID;
  stateIds?: UUID[];
  labelIds?: UUID[];
  cycleId?: UUID;
  parentId?: UUID;
}

/**
 * Resolves every human identifier in a search filter in a single
 * `BatchResolveForSearch` request, preserving the exact semantics of the
 * individual resolvers via the shared batch mappers.
 *
 * Statuses are the one exception: the batch query returns the workflow states
 * of the scoped team (matched client-side by name). When no team is given — or
 * a name is not among the returned states — resolution falls back to
 * `resolveStatusId`, which matches globally, so status filtering without a team
 * keeps working.
 */
export async function resolveSearchFilterIds(
  gqlClient: GraphQLClient,
  input: SearchFilterResolutionInput,
): Promise<SearchFilterResolution> {
  const team = input.team;
  const teamIsUuid = team ? isUuid(team) : false;

  const assigneeQuery =
    input.assignee && !isUuid(input.assignee) ? input.assignee : null;
  const creatorQuery =
    input.creator && !isUuid(input.creator) ? input.creator : null;
  const projectName =
    input.project && !isUuid(input.project) ? input.project : null;
  const projectIdVar =
    input.project && isUuid(input.project) ? input.project : null;
  const cycleName = input.cycle && !isUuid(input.cycle) ? input.cycle : null;
  const labelNames = (input.labelNames ?? []).filter((l) => !isUuid(l));

  const parent =
    input.parent && !isUuid(input.parent)
      ? parseIssueIdentifier(input.parent)
      : null;

  const response = await gqlClient.request(BatchResolveForSearchDocument, {
    teamKey: team && !teamIsUuid ? team : null,
    teamName: team && !teamIsUuid ? team : null,
    teamId: team && teamIsUuid ? team : null,
    assigneeQuery,
    creatorQuery,
    projectName,
    projectId: projectIdVar,
    labelFilter: buildLabelFilter(labelNames),
    cycleName,
    parentTeamKey: parent?.teamKey ?? null,
    parentIssueNumber: parent?.issueNumber ?? null,
    milestoneName: null,
  });

  const resolved: SearchFilterResolution = {};

  if (team) {
    resolved.teamId = teamIsUuid
      ? asUuid(team)
      : mapSearchTeamId(response.teams.nodes, team);
  }

  if (input.assignee) {
    resolved.assigneeId = isUuid(input.assignee)
      ? asUuid(input.assignee)
      : mapUser(response.assignees.nodes, input.assignee);
  }

  if (input.creator) {
    resolved.creatorId = isUuid(input.creator)
      ? asUuid(input.creator)
      : mapUser(response.creators.nodes, input.creator);
  }

  if (input.project) {
    resolved.projectId = isUuid(input.project)
      ? asUuid(input.project)
      : mapProjectId(response.projects.nodes, input.project);
  }

  if (input.statusNames && input.statusNames.length > 0) {
    resolved.stateIds = await Promise.all(
      input.statusNames.map((name) => {
        if (isUuid(name)) return asUuid(name);
        const match = response.statuses.nodes.find(
          (n) => n.name.toLowerCase() === name.toLowerCase(),
        );
        if (match) return asUuid(match.id);
        // Not among the scoped team's states (or no team given) — resolve
        // individually to match globally, as resolveStatusId did before.
        return resolveStatusId(gqlClient, name, resolved.teamId);
      }),
    );
  }

  if (input.labelNames && input.labelNames.length > 0) {
    resolved.labelIds = mapLabels(input.labelNames, response.labels.nodes);
  }

  if (input.cycle) {
    resolved.cycleId = isUuid(input.cycle)
      ? asUuid(input.cycle)
      : mapCycle(
          response.cycles.nodes,
          input.cycle,
          resolved.teamId ?? input.team,
        );
  }

  if (input.parent) {
    resolved.parentId = isUuid(input.parent)
      ? asUuid(input.parent)
      : mapParent(response.parentIssues.nodes, input.parent);
  }

  return resolved;
}

type SearchTeamNode = { id: string; key: string; name: string };

/** Mirrors resolveTeamId: prefer key match, then name; else not-found. */
function mapSearchTeamId(nodes: SearchTeamNode[], raw: string): UUID {
  const match =
    nodes.find((n) => n.key === raw) ?? nodes.find((n) => n.name === raw);
  if (!match) throw notFoundError("Team", raw);
  return asUuid(match.id);
}
