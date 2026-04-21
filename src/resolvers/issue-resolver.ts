import type { LinearSdkClient } from "../client/linear-client.js";
import { notFoundError } from "../common/errors.js";
import { isUuid, parseIssueIdentifier } from "../common/identifier.js";
import type { TeamEstimateContext } from "./team-resolver.js";

type TeamEstimationType =
  | "notUsed"
  | "exponential"
  | "fibonacci"
  | "linear"
  | "tShirt";

type IssueEstimateNode = {
  id: string;
  team: {
    id: string;
    key: string;
    name: string;
    issueEstimationType: TeamEstimationType;
    issueEstimationExtended: boolean;
    issueEstimationAllowZero: boolean;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeamEstimationType(value: unknown): value is TeamEstimationType {
  return (
    value === "notUsed" ||
    value === "exponential" ||
    value === "fibonacci" ||
    value === "linear" ||
    value === "tShirt"
  );
}

function toIssueEstimateNode(
  node: unknown,
  issueIdOrIdentifier: string,
): IssueEstimateNode {
  if (!isRecord(node)) {
    throw new Error(
      `Issue "${issueIdOrIdentifier}" is missing required team estimation context`,
    );
  }

  const issueId = node.id;
  const team = node.team;

  if (typeof issueId !== "string" || !isRecord(team)) {
    throw new Error(
      `Issue "${issueIdOrIdentifier}" is missing required team estimation context`,
    );
  }

  const teamId = team.id;
  const teamKey = team.key;
  const teamName = team.name;
  const issueEstimationType = team.issueEstimationType;
  const issueEstimationExtended = team.issueEstimationExtended;
  const issueEstimationAllowZero = team.issueEstimationAllowZero;

  if (
    typeof teamId !== "string" ||
    typeof teamKey !== "string" ||
    typeof teamName !== "string" ||
    !isTeamEstimationType(issueEstimationType) ||
    typeof issueEstimationExtended !== "boolean" ||
    typeof issueEstimationAllowZero !== "boolean"
  ) {
    throw new Error(
      `Issue "${issueIdOrIdentifier}" is missing required team estimation context`,
    );
  }

  return {
    id: issueId,
    team: {
      id: teamId,
      key: teamKey,
      name: teamName,
      issueEstimationType,
      issueEstimationExtended,
      issueEstimationAllowZero,
    },
  };
}

function mapIssueNodeToEstimateContext(
  node: IssueEstimateNode,
): IssueEstimateContext {
  return {
    issueId: node.id,
    team: {
      teamId: node.team.id,
      teamKey: node.team.key,
      teamName: node.team.name,
      issueEstimationType: node.team.issueEstimationType,
      issueEstimationExtended: node.team.issueEstimationExtended,
      issueEstimationAllowZero: node.team.issueEstimationAllowZero,
    },
  };
}

export interface IssueEstimateContext {
  issueId: string;
  team: TeamEstimateContext;
}

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

export async function resolveIssueEstimateContext(
  client: LinearSdkClient,
  issueIdOrIdentifier: string,
): Promise<IssueEstimateContext> {
  const issues = isUuid(issueIdOrIdentifier)
    ? await client.sdk.issues({
        filter: { id: { eq: issueIdOrIdentifier } },
        first: 1,
      })
    : await client.sdk.issues({
        filter: {
          number: {
            eq: parseIssueIdentifier(issueIdOrIdentifier).issueNumber,
          },
          team: {
            key: { eq: parseIssueIdentifier(issueIdOrIdentifier).teamKey },
          },
        },
        first: 1,
      });

  if (issues.nodes.length === 0) {
    throw notFoundError("Issue", issueIdOrIdentifier);
  }

  return mapIssueNodeToEstimateContext(
    toIssueEstimateNode(issues.nodes[0], issueIdOrIdentifier),
  );
}
