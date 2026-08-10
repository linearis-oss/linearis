import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { notFoundError } from "../common/errors.js";
import {
  asUuid,
  isUuid,
  parseIssueIdentifier,
  type UUID,
} from "../common/identifier.js";
import { FindIssuesDocument, type IssueFilter } from "../gql/graphql.js";
import {
  resolveTeamEstimateContext,
  type TeamEstimateContext,
} from "./team-resolver.js";

/** Builds the FindIssues filter for a UUID or "TEAM-123" identifier. */
function issueLookupFilter(issueIdOrIdentifier: string): IssueFilter {
  if (isUuid(issueIdOrIdentifier)) {
    return { id: { eq: issueIdOrIdentifier } };
  }

  const { teamKey, issueNumber } = parseIssueIdentifier(issueIdOrIdentifier);
  return {
    number: { eq: issueNumber },
    team: { key: { eq: teamKey } },
  };
}

export interface IssueEstimateContext {
  issueId: UUID;
  team: TeamEstimateContext;
}

/**
 * Resolves issue identifier to UUID.
 *
 * Accepts UUID or issue identifier (e.g., "ENG-123").
 *
 * @param client - GraphQL client
 * @param issueIdOrIdentifier - Issue UUID or identifier
 * @returns Issue UUID
 * @throws Error if issue not found
 */
export async function resolveIssueId(
  client: GraphQLClient,
  issueIdOrIdentifier: string,
): Promise<UUID> {
  if (isUuid(issueIdOrIdentifier)) return asUuid(issueIdOrIdentifier);

  const { issues } = await client.request(FindIssuesDocument, {
    filter: issueLookupFilter(issueIdOrIdentifier),
    first: 1,
  });

  return asUuid(
    firstOrThrow(issues.nodes, () =>
      notFoundError("Issue", issueIdOrIdentifier),
    ).id,
  );
}

/** An issue reference resolved to its UUID plus the team that scopes it. */
export interface ResolvedIssueRef {
  ref: string;
  id: UUID;
  teamId: UUID;
  teamKey: string;
}

/**
 * Resolves a list of issue references in one request.
 *
 * Unlike {@link resolveIssueId} this also returns each issue's team, because
 * the batch-update caller needs it: `issueBatchUpdate` applies a single patch
 * to every target, so a status or cycle named by word can only be resolved
 * when all targets share one team. UUID references are looked up rather than
 * passed straight through for the same reason — the team is not derivable from
 * a UUID.
 *
 * Duplicate references collapse to one entry, preserving first-seen order.
 *
 * @throws Error if any reference does not match an issue
 */
export async function resolveIssueRefs(
  client: GraphQLClient,
  refs: readonly string[],
): Promise<ResolvedIssueRef[]> {
  const unique = [...new Set(refs)];

  if (unique.length === 0) {
    return [];
  }

  const { issues } = await client.request(FindIssuesDocument, {
    filter: { or: unique.map(issueLookupFilter) },
    first: unique.length,
  });

  return unique.map((ref) => {
    const node = issues.nodes.find((candidate) =>
      isUuid(ref)
        ? candidate.id === ref
        : matchesIdentifier(candidate, parseIssueIdentifier(ref)),
    );

    if (!node) {
      throw notFoundError("Issue", ref);
    }

    return {
      ref,
      id: asUuid(node.id),
      teamId: asUuid(node.team.id),
      teamKey: node.team.key,
    };
  });
}

function matchesIdentifier(
  node: { number: number; team: { key: string } },
  identifier: { teamKey: string; issueNumber: number },
): boolean {
  return (
    node.number === identifier.issueNumber &&
    node.team.key === identifier.teamKey
  );
}

export async function resolveIssueEstimateContext(
  client: GraphQLClient,
  issueIdOrIdentifier: string,
): Promise<IssueEstimateContext> {
  const { issues } = await client.request(FindIssuesDocument, {
    filter: issueLookupFilter(issueIdOrIdentifier),
    first: 1,
  });

  const node = firstOrThrow(issues.nodes, () =>
    notFoundError("Issue", issueIdOrIdentifier),
  );

  return {
    issueId: asUuid(node.id),
    team: await resolveTeamEstimateContext(client, node.team.id),
  };
}
