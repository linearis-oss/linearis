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
  buildUserQuery,
  mapCycle,
  mapLabels,
  mapParent,
  mapProjectId,
  mapUser,
  type UserNode,
} from "./batch-resolve-mappers.js";
import { resolveCycleId } from "./cycle-resolver.js";
import { resolveStatusId } from "./status-resolver.js";
import { isViewerAlias, resolveViewerId } from "./user-resolver.js";

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
 * Statuses and cycles are the exception: the batch query scopes both to the
 * team (matched client-side by name). When no team is given — or the name is
 * not among the returned nodes — resolution falls back to `resolveStatusId` /
 * `resolveCycleId`, which match globally, so filtering by status or cycle name
 * without a team keeps working.
 */
export async function resolveSearchFilterIds(
  gqlClient: GraphQLClient,
  input: SearchFilterResolutionInput,
): Promise<SearchFilterResolution> {
  const team = input.team;
  const teamIsUuid = team ? isUuid(team) : false;

  const assigneeQuery = buildUserQuery(input.assignee);
  const creatorQuery = buildUserQuery(input.creator);
  const wantsViewer =
    (!!input.assignee && isViewerAlias(input.assignee)) ||
    (!!input.creator && isViewerAlias(input.creator));
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

  // The viewer lookup is awaited together with the batch request: starting it
  // without awaiting it in the same expression would leave a rejection
  // unhandled whenever the batch request throws first, and an unhandled
  // rejection kills the process with a stack trace instead of the JSON error
  // envelope. One lookup serves both flags — `--assignee me --creator me` is a
  // perfectly ordinary "what am I working on that I filed" query.
  const [viewerId, response] = await Promise.all([
    wantsViewer ? resolveViewerId(gqlClient) : undefined,
    gqlClient.request(BatchResolveForSearchDocument, {
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
    }),
  ]);

  const resolved: SearchFilterResolution = {};

  if (team) {
    resolved.teamId = teamIsUuid
      ? asUuid(team)
      : mapSearchTeamId(response.teams.nodes, team);
  }

  if (input.assignee) {
    resolved.assigneeId = pickUserId(
      input.assignee,
      assigneeQuery,
      response.assignees.nodes,
      viewerId,
    );
  }

  if (input.creator) {
    resolved.creatorId = pickUserId(
      input.creator,
      creatorQuery,
      response.creators.nodes,
      viewerId,
    );
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
    if (isUuid(input.cycle)) {
      resolved.cycleId = asUuid(input.cycle);
    } else if (response.cycles.nodes.length > 0) {
      resolved.cycleId = mapCycle(
        response.cycles.nodes,
        input.cycle,
        resolved.teamId ?? input.team,
      );
    } else {
      // No cycles in the batch response (the query scopes them to a team, so
      // this is the no-team case) — resolve individually to match globally, as
      // resolveCycleId did before.
      resolved.cycleId = await resolveCycleId(
        gqlClient,
        input.cycle,
        resolved.teamId ?? input.team,
      );
    }
  }

  if (input.parent) {
    resolved.parentId = isUuid(input.parent)
      ? asUuid(input.parent)
      : mapParent(response.parentIssues.nodes, input.parent);
  }

  return resolved;
}

/**
 * Picks the id for one user-valued filter flag.
 *
 * `query` is non-null exactly when the batch response holds candidates to match
 * against; otherwise the reference is a UUID that passes through, or the `me`
 * alias, which takes the viewer id fetched alongside the batch request.
 */
function pickUserId(
  raw: string,
  query: string | null,
  nodes: UserNode[],
  viewerId: UUID | undefined,
): UUID {
  if (query) return mapUser(nodes, query);
  if (isUuid(raw)) return asUuid(raw);
  if (viewerId) return viewerId;
  throw notFoundError("User", raw);
}

type SearchTeamNode = { id: string; key: string; name: string };

/** Mirrors resolveTeamId: prefer key match, then name; else not-found. */
function mapSearchTeamId(nodes: SearchTeamNode[], raw: string): UUID {
  const match =
    nodes.find((n) => n.key === raw) ?? nodes.find((n) => n.name === raw);
  if (!match) throw notFoundError("Team", raw);
  return asUuid(match.id);
}
