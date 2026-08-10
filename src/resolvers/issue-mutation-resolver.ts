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
  buildUserQuery,
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
import { resolveTeamId, type TeamEstimateContext } from "./team-resolver.js";
import {
  isViewerAlias,
  resolveUserId,
  resolveViewerId,
} from "./user-resolver.js";

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
  /** User references (name, email, UUID or `me`) to subscribe on creation. */
  subscribers?: string[];
  delegate?: string;
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
  subscriberIds?: UUID[];
  delegateId?: UUID;
}

/**
 * Resolves the user-valued references that the `BatchResolve*` queries cannot.
 *
 * `--subscribers` is a list and `--delegate` a second single user, neither of
 * which the batch query's one `$assigneeQuery` variable can express. They go
 * through `resolveUserId` in parallel instead, which keeps the name/email
 * disambiguation identical to every other user flag and costs nothing when the
 * flags are absent.
 *
 * `--assignee` normally *is* the batch query's variable, but `me` matches no
 * display name or email, so that one spelling is diverted here too — otherwise
 * an alias the help text and the JSON Schema both advertise would come back as
 * `User "me" not found`.
 */
async function resolveIssueUserRefs(
  client: GraphQLClient,
  input: { subscribers?: string[]; delegate?: string; assignee?: string },
): Promise<{ subscriberIds?: UUID[]; delegateId?: UUID; assigneeId?: UUID }> {
  const [subscriberIds, delegateId, assigneeId] = await Promise.all([
    input.subscribers
      ? Promise.all(input.subscribers.map((ref) => resolveUserId(client, ref)))
      : undefined,
    input.delegate ? resolveUserId(client, input.delegate) : undefined,
    input.assignee && isViewerAlias(input.assignee)
      ? resolveViewerId(client)
      : undefined,
  ]);

  return {
    ...(subscriberIds && { subscriberIds }),
    ...(delegateId && { delegateId }),
    ...(assigneeId && { assigneeId }),
  };
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
  const assigneeQuery = buildUserQuery(input.assignee);
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

  // Awaited together with the batch request: starting the user lookups without
  // awaiting them in the same expression would leave a rejection unhandled
  // whenever the batch request throws first, and an unhandled rejection kills
  // the process with a stack trace instead of the JSON error envelope.
  const [userRefs, response] = await Promise.all([
    resolveIssueUserRefs(client, input),
    client.request(BatchResolveForCreateDocument, {
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
    }),
  ]);

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

  // A `me` assignee has no name to match; it is resolved against `viewer` in
  // userRefs and spread over `resolved` on the way out.
  if (assigneeQuery) {
    resolved.assigneeId = mapUser(response.assignees.nodes, assigneeQuery);
  } else if (input.assignee && isUuid(input.assignee)) {
    resolved.assigneeId = asUuid(input.assignee);
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

  return { ...resolved, ...userRefs };
}

/** How many distinct reference sets resolve at once (see below for why). */
const BATCH_CREATE_RESOLVE_CONCURRENCY = 5;

/**
 * Resolves the human identifiers for a whole batch of issues to create.
 *
 * Each entry still resolves through {@link resolveCreateIssueIds}, so the
 * disambiguation and not-found semantics are identical to a single create —
 * a batch must not quietly accept a team name that `issues create` would
 * reject. What changes is the round-trip count: entries naming the same set of
 * references (the usual case, where a batch shares a team and project and
 * differs only in title) are deduplicated up front, so the cost is one
 * `BatchResolveForCreate` per *distinct* reference set rather than per row.
 *
 * Field-level memoization would collapse more, but status, cycle and milestone
 * lookups are scoped by the entry's own team and project, so a per-field cache
 * cannot be keyed correctly without duplicating that scoping here.
 *
 * The distinct sets are then resolved in bounded waves rather than all at once.
 * Deduplication helps the common batch that shares a team and project, but a
 * heterogeneous import — the case this command exists for — has as many
 * distinct sets as rows, and firing every `BatchResolveForCreate` (plus its
 * user lookups) simultaneously is how a large import earns a rate-limit
 * rejection instead of a result.
 */
export async function resolveBatchCreateIssueIds(
  client: GraphQLClient,
  entries: readonly ResolveCreateIssueIdsInput[],
): Promise<ResolvedCreateIssueIds[]> {
  // Deduplicate first so the concurrency window counts real requests: a batch
  // of 100 rows sharing one reference set should still cost one wave.
  const keys = entries.map(batchCreateCacheKey);
  const unique = new Map<string, ResolveCreateIssueIdsInput>();
  for (const [index, key] of keys.entries()) {
    if (!unique.has(key)) {
      unique.set(key, entries[index] as ResolveCreateIssueIdsInput);
    }
  }

  const resolvedByKey = new Map<string, ResolvedCreateIssueIds>();
  const pending = [...unique];

  for (let i = 0; i < pending.length; i += BATCH_CREATE_RESOLVE_CONCURRENCY) {
    const wave = pending.slice(i, i + BATCH_CREATE_RESOLVE_CONCURRENCY);
    const resolved = await Promise.all(
      wave.map(([, entry]) => resolveCreateIssueIds(client, entry)),
    );
    for (const [offset, [key]] of wave.entries()) {
      resolvedByKey.set(key, resolved[offset] as ResolvedCreateIssueIds);
    }
  }

  return keys.map((key) => resolvedByKey.get(key) as ResolvedCreateIssueIds);
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
    entry.subscribers ?? null,
    entry.delegate ?? null,
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
  /** Destination team for a move; also rescopes status / cycle resolution. */
  team?: string;
  subscribers?: string[];
  delegate?: string;
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
  teamId?: UUID;
  /** Resolved subscriber UUIDs (add/remove/overwrite set math stays in the command). */
  subscriberIds?: UUID[];
  delegateId?: UUID;
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
  const assigneeQuery = buildUserQuery(input.assignee);

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

  // Both lookups are awaited in the same expression: starting one without
  // awaiting it would leave a rejection unhandled whenever the other throws
  // first, and an unhandled rejection kills the process with a stack trace
  // instead of the JSON error envelope.
  //
  // A team move rescopes the lookups: a status or cycle named alongside
  // `--team` belongs to the *destination* team's workflow, not the team the
  // issue is leaving. This is the one lookup that cannot be batched with the
  // rest, since its result is an input to them.
  const [userRefs, destinationTeamId] = await Promise.all([
    resolveIssueUserRefs(client, input),
    input.team ? resolveTeamId(client, input.team) : undefined,
  ]);
  const scope: UpdateIssueContext = destinationTeamId
    ? { teamId: destinationTeamId }
    : context;

  const response = await client.request(BatchResolveForUpdateDocument, {
    assigneeQuery,
    projectName: projectNameVar,
    projectId: projectIdVar,
    labelFilter: buildLabelFilter(labelNames),
    statusName,
    cycleName,
    teamKey: scope.teamKey ?? null,
    teamId: scope.teamId ?? null,
    milestoneName,
    parentTeamKey: parent?.teamKey ?? null,
    parentIssueNumber: parent?.issueNumber ?? null,
  });

  const resolved: ResolvedUpdateIssueIds = destinationTeamId
    ? { teamId: destinationTeamId }
    : {};

  // As in create: `me` carries no name to match and arrives via userRefs.
  if (assigneeQuery) {
    resolved.assigneeId = mapUser(response.assignees.nodes, assigneeQuery);
  } else if (input.assignee && isUuid(input.assignee)) {
    resolved.assigneeId = asUuid(input.assignee);
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
      : mapCycle(response.cycles.nodes, input.cycle, scope.teamKey);
  }

  if (input.status) {
    resolved.stateId = isUuid(input.status)
      ? asUuid(input.status)
      : mapStatus(
          response.statuses.nodes,
          input.status,
          scope.teamId ? `for team ${scope.teamId}` : undefined,
        );
  }

  if (input.parentTicket) {
    resolved.parentId = isUuid(input.parentTicket)
      ? asUuid(input.parentTicket)
      : mapParent(response.parentIssues.nodes, input.parentTicket);
  }

  return { ...resolved, ...userRefs };
}
