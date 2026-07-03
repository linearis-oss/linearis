import type { LinearSdkClient } from "../client/linear-client.js";
import { notFoundError } from "../common/errors.js";
import { isUuid } from "../common/identifier.js";

type TeamEstimationType =
  | "notUsed"
  | "exponential"
  | "fibonacci"
  | "linear"
  | "tShirt";

export interface TeamEstimateContext {
  teamId: string;
  teamKey: string;
  teamName: string;
  issueEstimationType: TeamEstimationType;
  issueEstimationExtended: boolean;
  issueEstimationAllowZero: boolean;
}

type TeamEstimateNode = {
  id: string;
  key: string;
  name: string;
  issueEstimationType: TeamEstimationType;
  issueEstimationExtended: boolean;
  issueEstimationAllowZero: boolean;
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

function toTeamEstimateNode(
  node: unknown,
  keyOrNameOrId: string,
): TeamEstimateNode {
  if (!isRecord(node)) {
    throw new Error(
      `Team "${keyOrNameOrId}" is missing required estimation context`,
    );
  }

  const id = node["id"];
  const key = node["key"];
  const name = node["name"];
  const issueEstimationType = node["issueEstimationType"];
  const issueEstimationExtended = node["issueEstimationExtended"];
  const issueEstimationAllowZero = node["issueEstimationAllowZero"];

  if (
    typeof id !== "string" ||
    typeof key !== "string" ||
    typeof name !== "string" ||
    !isTeamEstimationType(issueEstimationType) ||
    typeof issueEstimationExtended !== "boolean" ||
    typeof issueEstimationAllowZero !== "boolean"
  ) {
    throw new Error(
      `Team "${keyOrNameOrId}" is missing required estimation context`,
    );
  }

  return {
    id,
    key,
    name,
    issueEstimationType,
    issueEstimationExtended,
    issueEstimationAllowZero,
  };
}

function mapTeamNodeToEstimateContext(
  node: TeamEstimateNode,
): TeamEstimateContext {
  return {
    teamId: node.id,
    teamKey: node.key,
    teamName: node.name,
    issueEstimationType: node.issueEstimationType,
    issueEstimationExtended: node.issueEstimationExtended,
    issueEstimationAllowZero: node.issueEstimationAllowZero,
  };
}

export async function resolveTeamEstimateContext(
  client: LinearSdkClient,
  keyOrNameOrId: string,
): Promise<TeamEstimateContext> {
  if (isUuid(keyOrNameOrId)) {
    const byId = await client.sdk.teams({
      filter: { id: { eq: keyOrNameOrId } },
      first: 1,
    });
    if (byId.nodes.length > 0) {
      return mapTeamNodeToEstimateContext(
        toTeamEstimateNode(byId.nodes[0], keyOrNameOrId),
      );
    }
    throw notFoundError("Team", keyOrNameOrId);
  }

  const byKey = await client.sdk.teams({
    filter: { key: { eq: keyOrNameOrId } },
    first: 1,
  });
  if (byKey.nodes.length > 0) {
    return mapTeamNodeToEstimateContext(
      toTeamEstimateNode(byKey.nodes[0], keyOrNameOrId),
    );
  }

  const byName = await client.sdk.teams({
    filter: { name: { eq: keyOrNameOrId } },
    first: 1,
  });
  if (byName.nodes.length > 0) {
    return mapTeamNodeToEstimateContext(
      toTeamEstimateNode(byName.nodes[0], keyOrNameOrId),
    );
  }

  throw notFoundError("Team", keyOrNameOrId);
}

export async function resolveTeamId(
  client: LinearSdkClient,
  keyOrNameOrId: string,
): Promise<string> {
  if (isUuid(keyOrNameOrId)) return keyOrNameOrId;

  // Try by key first
  const byKey = await client.sdk.teams({
    filter: { key: { eq: keyOrNameOrId } },
    first: 1,
  });
  const [byKeyMatch] = byKey.nodes;
  if (byKeyMatch) return byKeyMatch.id;

  // Fall back to name
  const byName = await client.sdk.teams({
    filter: { name: { eq: keyOrNameOrId } },
    first: 1,
  });
  const [byNameMatch] = byName.nodes;
  if (byNameMatch) return byNameMatch.id;

  throw notFoundError("Team", keyOrNameOrId);
}
