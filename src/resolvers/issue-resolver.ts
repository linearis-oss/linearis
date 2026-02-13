import type { LinearSdkClient } from "../client/linear-client.js";
import { notFoundError } from "../common/errors.js";
import { isUuid, parseIssueIdentifier } from "../common/identifier.js";

/**
 * Resolves issue identifier to UUID.
 *
 * Accepts UUID or issue identifier (e.g., "ENG-123").
 *
 * @param client - Linear SDK client
 * @param issueIdOrIdentifier - Issue UUID or identifier
 * @returns Issue UUID
 * @throws Error if issue not found
 */
export async function resolveIssueId(
  client: LinearSdkClient,
  issueIdOrIdentifier: string,
): Promise<string> {
  if (isUuid(issueIdOrIdentifier)) return issueIdOrIdentifier;

  const { teamKey, issueNumber } = parseIssueIdentifier(issueIdOrIdentifier);

  const issues = await client.sdk.issues({
    filter: {
      number: { eq: issueNumber },
      team: { key: { eq: teamKey } },
    },
    first: 1,
  });

  if (issues.nodes.length === 0) {
    throw notFoundError("Issue", issueIdOrIdentifier);
  }

  return issues.nodes[0].id;
}
