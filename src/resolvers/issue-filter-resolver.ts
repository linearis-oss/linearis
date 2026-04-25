import type { LinearSdkClient } from "../client/linear-client.js";
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
  teamId?: string;
  assigneeId?: string;
  creatorId?: string;
  projectId?: string;
  stateIds?: string[];
  labelIds?: string[];
  cycleId?: string;
  parentId?: string;
}

export async function resolveSearchFilterIds(
  sdkClient: LinearSdkClient,
  input: SearchFilterResolutionInput,
): Promise<SearchFilterResolution> {
  const resolved: SearchFilterResolution = {};

  if (input.team) {
    resolved.teamId = await resolveTeamId(sdkClient, input.team);
  }

  if (input.assignee) {
    resolved.assigneeId = await resolveUserId(sdkClient, input.assignee);
  }

  if (input.creator) {
    resolved.creatorId = await resolveUserId(sdkClient, input.creator);
  }

  if (input.project) {
    resolved.projectId = await resolveProjectId(sdkClient, input.project);
  }

  if (input.statusNames && input.statusNames.length > 0) {
    resolved.stateIds = await Promise.all(
      input.statusNames.map((status) =>
        resolveStatusId(sdkClient, status, resolved.teamId),
      ),
    );
  }

  if (input.labelNames && input.labelNames.length > 0) {
    resolved.labelIds = await resolveLabelIds(sdkClient, input.labelNames);
  }

  if (input.cycle) {
    resolved.cycleId = await resolveCycleId(
      sdkClient,
      input.cycle,
      resolved.teamId ?? input.team,
    );
  }

  if (input.parent) {
    resolved.parentId = await resolveIssueId(sdkClient, input.parent);
  }

  return resolved;
}
