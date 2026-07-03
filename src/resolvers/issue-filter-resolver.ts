import type { GraphQLClient } from "../client/graphql-client.js";
import type { UUID } from "../common/identifier.js";
import { resolveCycleId } from "./cycle-resolver.js";
import { resolveIssueId } from "./issue-resolver.js";
import { resolveLabelIds } from "./label-resolver.js";
import { resolveProjectId } from "./project-resolver.js";
import { resolveStatusId } from "./status-resolver.js";
import { resolveTeamId } from "./team-resolver.js";
import { resolveUserId } from "./user-resolver.js";

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

export async function resolveSearchFilterIds(
  gqlClient: GraphQLClient,
  input: SearchFilterResolutionInput,
): Promise<SearchFilterResolution> {
  const resolved: SearchFilterResolution = {};

  if (input.team) {
    resolved.teamId = await resolveTeamId(gqlClient, input.team);
  }

  if (input.assignee) {
    resolved.assigneeId = await resolveUserId(gqlClient, input.assignee);
  }

  if (input.creator) {
    resolved.creatorId = await resolveUserId(gqlClient, input.creator);
  }

  if (input.project) {
    resolved.projectId = await resolveProjectId(gqlClient, input.project);
  }

  if (input.statusNames && input.statusNames.length > 0) {
    resolved.stateIds = await Promise.all(
      input.statusNames.map((status) =>
        resolveStatusId(gqlClient, status, resolved.teamId),
      ),
    );
  }

  if (input.labelNames && input.labelNames.length > 0) {
    resolved.labelIds = await resolveLabelIds(gqlClient, input.labelNames);
  }

  if (input.cycle) {
    resolved.cycleId = await resolveCycleId(
      gqlClient,
      input.cycle,
      resolved.teamId ?? input.team,
    );
  }

  if (input.parent) {
    resolved.parentId = await resolveIssueId(gqlClient, input.parent);
  }

  return resolved;
}
