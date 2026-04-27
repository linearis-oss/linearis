import type { LinearSdkClient } from "../client/linear-client.js";
import { notFoundError } from "../common/errors.js";
import { isUuid, parseIssueIdentifier } from "../common/identifier.js";
import {
  resolveTeamEstimateContext,
  type TeamEstimateContext,
} from "./team-resolver.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== "object" && typeof value !== "function") || !value) {
    return false;
  }

  return typeof (value as { then?: unknown }).then === "function";
}

async function resolveRelationValue(value: unknown): Promise<unknown> {
  return isPromiseLike(value) ? await value : value;
}

function getTeamLookupFromRelation(team: unknown): string | undefined {
  if (!isRecord(team)) return undefined;

  if (typeof team.id === "string") return team.id;
  if (typeof team.key === "string") return team.key;

  return undefined;
}

async function getIssueTeamLookup(
  node: Record<string, unknown>,
): Promise<string | undefined> {
  if (typeof node.teamId === "string") return node.teamId;

  return getTeamLookupFromRelation(await resolveRelationValue(node.team));
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
  const issueIsUuid = isUuid(issueIdOrIdentifier);
  const issues = await (issueIsUuid
    ? client.sdk.issues({
        filter: { id: { eq: issueIdOrIdentifier } },
        first: 1,
      })
    : (() => {
        const { teamKey, issueNumber } =
          parseIssueIdentifier(issueIdOrIdentifier);

        return client.sdk.issues({
          filter: {
            number: { eq: issueNumber },
            team: { key: { eq: teamKey } },
          },
          first: 1,
        });
      })());

  if (issues.nodes.length === 0) {
    throw notFoundError("Issue", issueIdOrIdentifier);
  }

  const issueNode = issues.nodes[0];
  if (!isRecord(issueNode) || typeof issueNode.id !== "string") {
    throw new Error(
      `Issue "${issueIdOrIdentifier}" is missing required team context`,
    );
  }

  const teamLookup = await getIssueTeamLookup(issueNode);
  if (!teamLookup) {
    throw new Error(
      `Issue "${issueIdOrIdentifier}" is missing required team context`,
    );
  }

  return {
    issueId: issueNode.id,
    team: await resolveTeamEstimateContext(client, teamLookup),
  };
}
