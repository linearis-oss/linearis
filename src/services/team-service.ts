import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  PaginatedResult,
  PaginationOptions,
  TeamDetail,
  TeamEstimateOption,
  TeamEstimationSource,
} from "../common/types.js";
import {
  GetTeamByIdDocument,
  type GetTeamByIdQuery,
  GetTeamsDocument,
  type GetTeamsQuery,
} from "../gql/graphql.js";

export interface Team {
  id: string;
  key: string;
  name: string;
}

interface GetTeamInput {
  id: string;
}

type TeamConfigSource = Pick<
  TeamDetail,
  "issueEstimationType" | "issueEstimationExtended" | "issueEstimationAllowZero"
>;

function deriveValidEstimates(config: TeamConfigSource): TeamEstimateOption[] {
  const type = config.issueEstimationType;
  const extended = config.issueEstimationExtended;
  const allowZero = config.issueEstimationAllowZero;

  let base: TeamEstimateOption[] = [];

  switch (type) {
    case "fibonacci":
      base = [1, 2, 3, 5, 8, ...(extended ? [13, 21] : [])].map((value) => ({
        value,
        label: String(value),
      }));
      break;
    case "exponential":
      base = [1, 2, 4, 8, 16, ...(extended ? [32, 64] : [])].map((value) => ({
        value,
        label: String(value),
      }));
      break;
    case "linear":
      base = [1, 2, 3, 4, 5, ...(extended ? [6, 7] : [])].map((value) => ({
        value,
        label: String(value),
      }));
      break;
    case "tShirt": {
      const mapping: TeamEstimateOption[] = [
        { value: 1, label: "XS" },
        { value: 2, label: "S" },
        { value: 3, label: "M" },
        { value: 5, label: "L" },
        { value: 8, label: "XL" },
      ];
      const extendedValues: TeamEstimateOption[] = extended
        ? [
            { value: 13, label: "XXL" },
            { value: 21, label: "XXXL" },
          ]
        : [];
      base = [...mapping, ...extendedValues];
      break;
    }
    case "notUsed":
      base = [];
      break;
    default:
      base = [];
      break;
  }

  if (!allowZero || type === "notUsed" || base.length === 0) {
    return base;
  }

  return [{ value: 0, label: "0" }, ...base];
}

async function resolveEffectiveEstimationConfig(
  client: GraphQLClient,
  team: NonNullable<GetTeamByIdQuery["team"]>,
): Promise<{ config: TeamConfigSource; source: TeamEstimationSource }> {
  if (!team.inheritIssueEstimation || !team.parent?.id) {
    return { config: team, source: "self" };
  }

  try {
    const parentResult = await client.request<GetTeamByIdQuery>(
      GetTeamByIdDocument,
      {
        id: team.parent.id,
      },
    );

    if (!parentResult.team) {
      return { config: team, source: "self_fallback" };
    }

    return { config: parentResult.team, source: "parent" };
  } catch {
    return { config: team, source: "self_fallback" };
  }
}

export async function listTeams(
  client: GraphQLClient,
  options: PaginationOptions = {},
): Promise<PaginatedResult<Team>> {
  const { limit = 50, after } = options;
  const result = await client.request<GetTeamsQuery>(GetTeamsDocument, {
    first: limit,
    after,
  });
  return {
    nodes: result.teams.nodes,
    pageInfo: result.teams.pageInfo,
  };
}

export async function getTeam(
  client: GraphQLClient,
  input: GetTeamInput,
): Promise<TeamDetail> {
  const result = await client.request<GetTeamByIdQuery>(GetTeamByIdDocument, {
    id: input.id,
  });

  if (!result.team) {
    throw new Error(`Team with ID "${input.id}" not found`);
  }

  const { config, source } = await resolveEffectiveEstimationConfig(
    client,
    result.team,
  );

  return {
    ...result.team,
    validEstimates: deriveValidEstimates(config),
    estimationSource: source,
  };
}
