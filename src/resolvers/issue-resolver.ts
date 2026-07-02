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

/** Narrow projection of the SDK issue node fields the team lookup consumes. */
interface IssueTeamProjection {
  id: string;
  teamId?: string;
  team?: unknown; // relation; may be a value or PromiseLike (SDK quirk)
}

/** Narrow projection of a resolved team relation node. */
interface TeamLookupProjection {
  id?: string;
  key?: string;
}

function toIssueTeamProjection(
  node: unknown,
  ref: string,
): IssueTeamProjection {
  if (!isRecord(node) || typeof node.id !== "string") {
    throw new Error(`Issue "${ref}" is missing required team context`);
  }

  return {
    id: node.id,
    teamId: typeof node.teamId === "string" ? node.teamId : undefined,
    team: node.team,
  };
}

function toTeamLookupProjection(
  team: unknown,
): TeamLookupProjection | undefined {
  if (!isRecord(team)) return undefined;

  return {
    id: typeof team.id === "string" ? team.id : undefined,
    key: typeof team.key === "string" ? team.key : undefined,
  };
}

function getTeamLookupFromRelation(team: unknown): string | undefined {
  const relation = toTeamLookupProjection(team);
  return relation?.id ?? relation?.key;
}

async function getIssueTeamLookup(
  projection: IssueTeamProjection,
): Promise<string | undefined> {
  if (projection.teamId) return projection.teamId;

  return getTeamLookupFromRelation(await resolveRelationValue(projection.team));
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

  const projection = toIssueTeamProjection(
    issues.nodes[0],
    issueIdOrIdentifier,
  );

  const teamLookup = await getIssueTeamLookup(projection);
  if (!teamLookup) {
    throw new Error(
      `Issue "${issueIdOrIdentifier}" is missing required team context`,
    );
  }

  return {
    issueId: projection.id,
    team: await resolveTeamEstimateContext(client, teamLookup),
  };
}
