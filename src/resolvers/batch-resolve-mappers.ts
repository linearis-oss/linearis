import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import type {
  BatchResolveForCreateQuery,
  IssueLabelFilter,
} from "../gql/graphql.js";
import { isViewerAlias } from "./user-resolver.js";

/**
 * Pure mappers shared by the batch resolvers (issue create/update and issue
 * search). Each turns a `BatchResolve*` response collection into resolved
 * UUIDs, reproducing the exact disambiguation / not-found / UUID-passthrough
 * semantics of the corresponding single-entity resolver.
 *
 * The three batch queries select identical node shapes, so the aliases below
 * (derived from `BatchResolveForCreate`) apply to all of them structurally.
 */

export type TeamNode = BatchResolveForCreateQuery["teams"]["nodes"][number];
export type UserNode = BatchResolveForCreateQuery["assignees"]["nodes"][number];
export type ProjectNode =
  BatchResolveForCreateQuery["projects"]["nodes"][number];
export type MilestoneNode = ProjectNode["projectMilestones"]["nodes"][number];
export type LabelNode = BatchResolveForCreateQuery["labels"]["nodes"][number];
export type StatusNode =
  BatchResolveForCreateQuery["statuses"]["nodes"][number];
export type CycleNode = BatchResolveForCreateQuery["cycles"]["nodes"][number];
export type ParentNode =
  BatchResolveForCreateQuery["parentIssues"]["nodes"][number];

/**
 * Builds an `IssueLabelFilter` matching each name case-insensitively (mirroring
 * `resolveLabelId`'s `eqIgnoreCase`). An empty list yields a filter that matches
 * nothing, so the batch query's `labels` field stays cheap when no labels are
 * requested.
 */
export function buildLabelFilter(names: string[]): IssueLabelFilter {
  if (names.length === 0) return { name: { in: [] } };
  return { or: names.map((name) => ({ name: { eqIgnoreCase: name } })) };
}

/**
 * Builds the `$assigneeQuery`/`$creatorQuery` variable for a user reference.
 *
 * Yields `null` — a lookup the batch query skips — for every reference the
 * query cannot match by display name or email: an absent flag, a UUID, and the
 * `me` alias, which names the caller rather than a value and is resolved
 * against `viewer` by the caller instead. Sending `me` as a name would only
 * come back empty, and {@link mapUser} would report it as an unknown user.
 */
export function buildUserQuery(ref: string | undefined): string | null {
  if (!ref || isUuid(ref) || isViewerAlias(ref)) return null;
  return ref;
}

/**
 * Two-phase user precedence, replicated purely from the `or:[displayName,email]`
 * result: an exact (case-insensitive) display-name match wins; multiple name
 * matches are ambiguous; otherwise the first email match is used. Matches
 * `resolveUserId`.
 */
export function mapUser(nodes: UserNode[], query: string): UUID {
  const lower = query.toLowerCase();

  const byName = nodes.filter((n) => n.displayName.toLowerCase() === lower);
  if (byName.length === 1) return asUuid((byName[0] as UserNode).id);
  if (byName.length > 1) {
    throw multipleMatchesError(
      "User",
      query,
      byName.map((u) => `${u.name} <${u.email}>`),
      "Use email or UUID to disambiguate",
    );
  }

  const byEmail = nodes.find((n) => n.email.toLowerCase() === lower);
  if (byEmail) return asUuid(byEmail.id);

  throw notFoundError("User", query);
}

/** Matches `resolveProjectId`: exactly one match, else not-found / ambiguous. */
export function mapProjectNode(
  nodes: ProjectNode[],
  query: string,
): ProjectNode {
  if (nodes.length === 0) throw notFoundError("Project", query);
  if (nodes.length > 1) {
    throw multipleMatchesError(
      "Project",
      query,
      nodes.map((project) => project.id),
      "provide project UUID",
    );
  }
  return nodes[0] as ProjectNode;
}

/** Convenience wrapper: {@link mapProjectNode} returning just the UUID. */
export function mapProjectId(nodes: ProjectNode[], query: string): UUID {
  return asUuid(mapProjectNode(nodes, query).id);
}

/** Matches `resolveLabelIds`: UUID passthrough, else case-insensitive name → id. */
export function mapLabels(requested: string[], nodes: LabelNode[]): UUID[] {
  return requested.map((label) => {
    if (isUuid(label)) return asUuid(label);
    const match = nodes.find(
      (n) => n.name.toLowerCase() === label.toLowerCase(),
    );
    if (!match) throw notFoundError("Label", label);
    return asUuid(match.id);
  });
}

/** Matches `resolveStatusId`: first match, scoped not-found context. */
export function mapStatus(
  nodes: StatusNode[],
  query: string,
  teamContext: string | undefined,
): UUID {
  const first = nodes[0];
  if (!first) throw notFoundError("Status", query, teamContext);
  return asUuid(first.id);
}

/** Matches `resolveCycleId`: prefer active > next > previous, else ambiguous. */
export function mapCycle(
  nodes: CycleNode[],
  query: string,
  teamLabel: string | undefined,
): UUID {
  if (nodes.length === 0) {
    throw notFoundError(
      "Cycle",
      query,
      teamLabel ? `for team ${teamLabel}` : undefined,
    );
  }

  let chosen =
    nodes.find((n) => n.isActive) ??
    nodes.find((n) => n.isNext) ??
    nodes.find((n) => n.isPrevious);
  if (!chosen && nodes.length === 1) chosen = nodes[0];

  if (!chosen) {
    const matches = nodes.map(
      (n) =>
        `${n.id} (${n.team?.key || "?"} / #${n.number} / ${
          n.startsAt ? new Date(n.startsAt).toISOString() : undefined
        })`,
    );
    throw multipleMatchesError(
      "cycle",
      query,
      matches,
      "use an ID or scope with --team",
    );
  }

  return asUuid(chosen.id);
}

/** Matches `resolveMilestoneId` scoped to a single project's milestones. */
export function mapMilestone(
  nodes: MilestoneNode[],
  query: string,
  projectName: string | undefined,
): UUID {
  if (nodes.length === 0) throw notFoundError("Milestone", query);
  if (nodes.length > 1) {
    throw multipleMatchesError(
      "milestone",
      query,
      nodes.map((m) => `"${m.name}" in project "${projectName ?? "?"}"`),
      "specify --project or use the milestone ID",
    );
  }
  return asUuid((nodes[0] as MilestoneNode).id);
}

/** Matches `resolveIssueId`: first match or not-found (UUID handled by caller). */
export function mapParent(nodes: ParentNode[], query: string): UUID {
  const first = nodes[0];
  if (!first) throw notFoundError("Issue", query);
  return asUuid(first.id);
}
