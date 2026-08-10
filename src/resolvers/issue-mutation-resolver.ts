import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import {
  asUuid,
  isUuid,
  parseIssueIdentifier,
  type UUID,
} from "../common/identifier.js";
import {
  BatchResolveForCreateDocument,
  BatchResolveForUpdateDocument,
} from "../gql/graphql.js";
import {
  buildLabelFilter,
  mapCycle,
  mapLabels,
  mapMilestone,
  mapParent,
  mapProjectNode,
  mapStatus,
  mapUser,
  type ProjectNode,
  type TeamNode,
} from "./batch-resolve-mappers.js";
import type { TeamEstimateContext } from "./team-resolver.js";

/**
 * Batch resolver for issue create / update.
 *
 * Replaces the per-field sequential resolver calls (`resolveTeamId`,
 * `resolveUserId`, `resolveProjectId`, …) with a single `BatchResolve*`
 * GraphQL request, then maps the response back to UUIDs while preserving the
 * exact disambiguation, not-found and UUID-passthrough semantics of each
 * individual resolver.
 *
 * Create resolves everything in one request. Update inherently needs two
 * sequential requests — the target issue must be fetched first (its team /
 * project scope the status / cycle / milestone lookups) — the caller supplies
 * that context via {@link UpdateIssueContext}.
 */

const TEAM_ESTIMATION_TYPES = [
  "notUsed",
  "exponential",
  "fibonacci",
  "linear",
  "tShirt",
] as const;

type TeamEstimationType = (typeof TEAM_ESTIMATION_TYPES)[number];

function narrowEstimationType(
  value: string,
  teamLabel: string,
): TeamEstimationType {
  if ((TEAM_ESTIMATION_TYPES as readonly string[]).includes(value)) {
    return value as TeamEstimationType;
  }
  throw new Error(`Team "${teamLabel}" is missing required estimation context`);
}

// --- Create -----------------------------------------------------------------

export interface ResolveCreateIssueIdsInput {
  /** Team key, name or UUID. Required for create. */
  team: string;
  assignee?: string;
  project?: string;
  labels?: string[];
  /** Milestone name or UUID; requires {@link ResolveCreateIssueIdsInput.project}. */
  projectMilestone?: string;
  cycle?: string;
  status?: string;
  parentTicket?: string;
  /** When true, resolve the team's estimation config for `--estimate` validation. */
  withEstimateContext?: boolean;
}

export interface ResolvedCreateIssueIds {
  teamId: UUID;
  estimateContext?: TeamEstimateContext;
  assigneeId?: UUID;
  projectId?: UUID;
  labelIds?: UUID[];
  projectMilestoneId?: UUID;
  cycleId?: UUID;
  stateId?: UUID;
  parentId?: UUID;
}

/**
 * Resolves every human identifier needed to create an issue in a single
 * `BatchResolveForCreate` request.
 */
export async function resolveCreateIssueIds(
  client: GraphQLClient,
  input: ResolveCreateIssueIdsInput,
): Promise<ResolvedCreateIssueIds> {
  const teamIsUuid = isUuid(input.team);
  const assigneeQuery =
    input.assignee && !isUuid(input.assignee) ? input.assignee : null;
  const projectName =
    input.project && !isUuid(input.project) ? input.project : null;
  const projectIdVar =
    input.project && isUuid(input.project) ? input.project : null;
  const milestoneName =
    input.projectMilestone && !isUuid(input.projectMilestone)
      ? input.projectMilestone
      : null;
  const statusName =
    input.status && !isUuid(input.status) ? input.status : null;
  const cycleName = input.cycle && !isUuid(input.cycle) ? input.cycle : null;
  const labelNames = (input.labels ?? []).filter((l) => !isUuid(l));

  const parent =
    input.parentTicket && !isUuid(input.parentTicket)
      ? parseIssueIdentifier(input.parentTicket)
      : null;

  const response = await client.request(BatchResolveForCreateDocument, {
    teamKey: teamIsUuid ? null : input.team,
    teamName: teamIsUuid ? null : input.team,
    teamId: teamIsUuid ? input.team : null,
    assigneeQuery,
    projectName,
    projectId: projectIdVar,
    labelFilter: buildLabelFilter(labelNames),
    statusName,
    cycleName,
    milestoneName,
    parentTeamKey: parent?.teamKey ?? null,
    parentIssueNumber: parent?.issueNumber ?? null,
  });

  // Team (required). Prefer key match, then name, then id — mirrors resolveTeamId.
  const teamNode = teamIsUuid
    ? response.teams.nodes.find((n) => n.id === input.team)
    : findTeamNode(response.teams.nodes, input.team);
  const teamId: UUID =
    teamIsUuid && !teamNode
      ? asUuid(input.team)
      : asUuid(requireTeam(teamNode, input.team).id);

  const resolved: ResolvedCreateIssueIds = { teamId };

  if (input.withEstimateContext) {
    const node = requireTeam(teamNode, input.team);
    resolved.estimateContext = {
      teamId: asUuid(node.id),
      teamKey: node.key,
      teamName: node.name,
      issueEstimationType: narrowEstimationType(
        node.issueEstimationType,
        input.team,
      ),
      issueEstimationExtended: node.issueEstimationExtended,
      issueEstimationAllowZero: node.issueEstimationAllowZero,
    };
  }

  if (input.assignee) {
    resolved.assigneeId = isUuid(input.assignee)
      ? asUuid(input.assignee)
      : mapUser(response.assignees.nodes, input.assignee);
  }

  let matchedProject: ProjectNode | undefined;
  if (input.project) {
    if (isUuid(input.project)) {
      resolved.projectId = asUuid(input.project);
      matchedProject = response.projects.nodes.find(
        (n) => n.id === input.project,
      );
    } else {
      matchedProject = mapProjectNode(response.projects.nodes, input.project);
      resolved.projectId = asUuid(matchedProject.id);
    }
  }

  if (input.labels && input.labels.length > 0) {
    resolved.labelIds = mapLabels(input.labels, response.labels.nodes);
  }

  if (input.projectMilestone) {
    resolved.projectMilestoneId = isUuid(input.projectMilestone)
      ? asUuid(input.projectMilestone)
      : mapMilestone(
          matchedProject?.projectMilestones.nodes ?? [],
          input.projectMilestone,
          matchedProject?.name,
        );
  }

  if (input.cycle) {
    resolved.cycleId = isUuid(input.cycle)
      ? asUuid(input.cycle)
      : mapCycle(response.cycles.nodes, input.cycle, input.team);
  }

  if (input.status) {
    resolved.stateId = isUuid(input.status)
      ? asUuid(input.status)
      : mapStatus(response.statuses.nodes, input.status, `for team ${teamId}`);
  }

  if (input.parentTicket) {
    resolved.parentId = isUuid(input.parentTicket)
      ? asUuid(input.parentTicket)
      : mapParent(response.parentIssues.nodes, input.parentTicket);
  }

  return resolved;
}

/**
 * Resolves the human identifiers for a whole batch of issues to create.
 *
 * Each entry still resolves through {@link resolveCreateIssueIds}, so the
 * disambiguation and not-found semantics are identical to a single create —
 * a batch must not quietly accept a team name that `issues create` would
 * reject. What changes is the round-trip count: entries naming the same set of
 * references (the usual case, where a batch shares a team and project and
 * differs only in title) are collapsed onto one in-flight request via a
 * promise cache, so the cost is one `BatchResolveForCreate` per *distinct*
 * reference set rather than per row.
 *
 * Field-level memoization would collapse more, but status, cycle and milestone
 * lookups are scoped by the entry's own team and project, so a per-field cache
 * cannot be keyed correctly without duplicating that scoping here.
 */
export async function resolveBatchCreateIssueIds(
  client: GraphQLClient,
  entries: readonly ResolveCreateIssueIdsInput[],
): Promise<ResolvedCreateIssueIds[]> {
  const inFlight = new Map<string, Promise<ResolvedCreateIssueIds>>();

  return Promise.all(
    entries.map((entry) => {
      const key = batchCreateCacheKey(entry);
      const cached = inFlight.get(key);
      if (cached) return cached;

      const pending = resolveCreateIssueIds(client, entry);
      inFlight.set(key, pending);
      return pending;
    }),
  );
}

/**
 * Stable cache key over exactly the fields {@link resolveCreateIssueIds} reads.
 * Title and description are absent by construction — they never reach the
 * resolver — so two entries with the same key resolve to the same UUIDs.
 */
function batchCreateCacheKey(entry: ResolveCreateIssueIdsInput): string {
  return JSON.stringify([
    entry.team,
    entry.assignee ?? null,
    entry.project ?? null,
    entry.labels ?? null,
    entry.projectMilestone ?? null,
    entry.cycle ?? null,
    entry.status ?? null,
    entry.parentTicket ?? null,
    entry.withEstimateContext ?? false,
  ]);
}

function findTeamNode(nodes: TeamNode[], raw: string): TeamNode | undefined {
  return nodes.find((n) => n.key === raw) ?? nodes.find((n) => n.name === raw);
}

function requireTeam(node: TeamNode | undefined, raw: string): TeamNode {
  if (!node) throw notFoundError("Team", raw);
  return node;
}

// --- Update -----------------------------------------------------------------

/** Context derived from the target issue (already fetched) that scopes lookups. */
export interface UpdateIssueContext {
  /** The issue's team UUID — scopes status / cycle resolution. */
  teamId?: UUID;
  /** The issue's team key — used in cycle not-found messages. */
  teamKey?: string;
  /** The issue's current project name — scopes milestone resolution. */
  projectName?: string;
}

export interface ResolveUpdateIssueIdsInput {
  assignee?: string;
  project?: string;
  labels?: string[];
  projectMilestone?: string;
  cycle?: string;
  status?: string;
  parentTicket?: string;
}

export interface ResolvedUpdateIssueIds {
  assigneeId?: UUID;
  projectId?: UUID;
  /** Resolved label UUIDs (add/remove/overwrite set math stays in the command). */
  labelIds?: UUID[];
  projectMilestoneId?: UUID;
  cycleId?: UUID;
  stateId?: UUID;
  parentId?: UUID;
}

/**
 * Resolves the new values for an issue update in a single
 * `BatchResolveForUpdate` request. Status / cycle / milestone are scoped by the
 * target issue's own team / project supplied in {@link UpdateIssueContext}.
 *
 * When both `--project` and `--project-milestone` are given, the milestone is
 * resolved within the *new* project (an intentional improvement over the prior
 * behavior, which scoped it to the issue's old project).
 */
export async function resolveUpdateIssueIds(
  client: GraphQLClient,
  input: ResolveUpdateIssueIdsInput,
  context: UpdateIssueContext,
): Promise<ResolvedUpdateIssueIds> {
  const assigneeQuery =
    input.assignee && !isUuid(input.assignee) ? input.assignee : null;

  // projectName scopes both --project resolution and milestone lookup: the new
  // project when --project is a name, else the issue's current project.
  const projectNameVar =
    input.project && !isUuid(input.project)
      ? input.project
      : (context.projectName ?? null);
  const projectIdVar =
    input.project && isUuid(input.project) ? input.project : null;

  const milestoneName =
    input.projectMilestone && !isUuid(input.projectMilestone)
      ? input.projectMilestone
      : null;
  const statusName =
    input.status && !isUuid(input.status) ? input.status : null;
  const cycleName = input.cycle && !isUuid(input.cycle) ? input.cycle : null;
  const labelNames = (input.labels ?? []).filter((l) => !isUuid(l));

  const parent =
    input.parentTicket && !isUuid(input.parentTicket)
      ? parseIssueIdentifier(input.parentTicket)
      : null;

  const response = await client.request(BatchResolveForUpdateDocument, {
    assigneeQuery,
    projectName: projectNameVar,
    projectId: projectIdVar,
    labelFilter: buildLabelFilter(labelNames),
    statusName,
    cycleName,
    teamKey: context.teamKey ?? null,
    teamId: context.teamId ?? null,
    milestoneName,
    parentTeamKey: parent?.teamKey ?? null,
    parentIssueNumber: parent?.issueNumber ?? null,
  });

  const resolved: ResolvedUpdateIssueIds = {};

  if (input.assignee) {
    resolved.assigneeId = isUuid(input.assignee)
      ? asUuid(input.assignee)
      : mapUser(response.assignees.nodes, input.assignee);
  }

  // The projects field matches by projectNameVar/projectIdVar; the matched node
  // is reused for milestone scoping.
  const matchedProject: ProjectNode | undefined = isUuid(input.project ?? "")
    ? response.projects.nodes.find((n) => n.id === input.project)
    : response.projects.nodes.find(
        (n) => n.name.toLowerCase() === (projectNameVar ?? "").toLowerCase(),
      );

  if (input.project) {
    resolved.projectId = isUuid(input.project)
      ? asUuid(input.project)
      : asUuid(mapProjectNode(response.projects.nodes, input.project).id);
  }

  if (input.labels && input.labels.length > 0) {
    resolved.labelIds = mapLabels(input.labels, response.labels.nodes);
  }

  if (input.projectMilestone) {
    resolved.projectMilestoneId = isUuid(input.projectMilestone)
      ? asUuid(input.projectMilestone)
      : mapMilestone(
          matchedProject?.projectMilestones.nodes ?? [],
          input.projectMilestone,
          matchedProject?.name ?? projectNameVar ?? undefined,
        );
  }

  if (input.cycle) {
    resolved.cycleId = isUuid(input.cycle)
      ? asUuid(input.cycle)
      : mapCycle(response.cycles.nodes, input.cycle, context.teamKey);
  }

  if (input.status) {
    resolved.stateId = isUuid(input.status)
      ? asUuid(input.status)
      : mapStatus(
          response.statuses.nodes,
          input.status,
          context.teamId ? `for team ${context.teamId}` : undefined,
        );
  }

  if (input.parentTicket) {
    resolved.parentId = isUuid(input.parentTicket)
      ? asUuid(input.parentTicket)
      : mapParent(response.parentIssues.nodes, input.parentTicket);
  }

  return resolved;
}
