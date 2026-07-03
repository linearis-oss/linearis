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
