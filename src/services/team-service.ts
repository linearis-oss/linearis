import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import type { BrandUuidFields, UUID } from "../common/identifier.js";
import {
  requireMutationEntity,
  requireMutationSuccess,
} from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  AddTeamMemberDocument,
  type AddTeamMemberMutation,
  CreateTeamDocument,
  type CreateTeamMutation,
  GetTeamByIdDocument,
  type GetTeamByIdQuery,
  GetTeamMembershipsDocument,
  type GetTeamMembershipsQuery,
  GetTeamsDocument,
  RemoveTeamMemberDocument,
  type TeamCreateInput,
  type TeamUpdateInput,
  UpdateTeamDocument,
  type UpdateTeamMutation,
} from "../gql/graphql.js";

// Team projection types
export type TeamEstimateOption = {
  value: number;
  label: string;
};

export type TeamEstimationSource = "self" | "parent" | "self_fallback";

export type TeamDetail = NonNullable<GetTeamByIdQuery["team"]> & {
  validEstimates: TeamEstimateOption[];
  estimationSource: TeamEstimationSource;
};

export interface Team {
  id: string;
  key: string;
  name: string;
}

export type CreatedTeam = NonNullable<CreateTeamMutation["teamCreate"]["team"]>;
export type UpdatedTeam = NonNullable<UpdateTeamMutation["teamUpdate"]["team"]>;
export type TeamMembership = NonNullable<
  AddTeamMemberMutation["teamMembershipCreate"]["teamMembership"]
>;

// Mutable team fields the command layer may set. UUIDs (parentId) are
// pre-resolved by the command before reaching the service.
type TeamMutableFields =
  | "name"
  | "key"
  | "description"
  | "private"
  | "icon"
  | "color"
  | "timezone"
  | "parentId"
  | "issueEstimationType"
  | "issueEstimationExtended"
  | "issueEstimationAllowZero"
  | "defaultIssueEstimate"
  | "inheritIssueEstimation"
  | "cyclesEnabled"
  | "cycleDuration"
  | "cycleCooldownTime"
  | "cycleStartDay"
  | "triageEnabled"
  | "requirePriorityToLeaveTriage"
  | "autoClosePeriod"
  | "autoArchivePeriod";

export type CreateTeamInput = BrandUuidFields<
  Pick<TeamCreateInput, TeamMutableFields>,
  "parentId"
>;
export type UpdateTeamInput = BrandUuidFields<
  Pick<TeamUpdateInput, TeamMutableFields>,
  "parentId"
>;

export interface AddTeamMemberInput {
  teamId: UUID;
  userId: UUID;
  owner?: boolean;
}

export interface RemoveTeamMemberInput {
  teamId: UUID;
  userId: UUID;
}

export type DeletedTeamMembership = {
  id: string;
  success: true;
};

type TeamMembershipNode =
  GetTeamMembershipsQuery["team"]["memberships"]["nodes"][number];

interface GetTeamInput {
  id: UUID;
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
    const parentResult = await client.request(GetTeamByIdDocument, {
      id: team.parent.id,
    });

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
  const result = await client.request(GetTeamsDocument, {
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
  const result = await client.request(GetTeamByIdDocument, {
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

export async function createTeam(
  client: GraphQLClient,
  input: CreateTeamInput,
): Promise<CreatedTeam> {
  const gqlInput: TeamCreateInput = input;
  const result = await client.request(CreateTeamDocument, { input: gqlInput });

  return requireMutationEntity(
    result.teamCreate,
    "team",
    `Failed to create team "${input.name}"`,
  );
}

export async function updateTeam(
  client: GraphQLClient,
  id: UUID,
  input: UpdateTeamInput,
): Promise<UpdatedTeam> {
  const gqlInput: TeamUpdateInput = input;
  const result = await client.request(UpdateTeamDocument, {
    id,
    input: gqlInput,
  });

  return requireMutationEntity(
    result.teamUpdate,
    "team",
    `Failed to update team "${id}"`,
  );
}

async function fetchTeamMemberships(
  client: GraphQLClient,
  teamId: UUID,
): Promise<TeamMembershipNode[]> {
  const nodes: TeamMembershipNode[] = [];
  let after: string | undefined;

  while (true) {
    const result = await client.request(GetTeamMembershipsDocument, {
      id: teamId,
      after,
    });

    if (!result.team) {
      throw notFoundError("Team", teamId);
    }

    const { memberships } = result.team;
    nodes.push(...memberships.nodes);

    if (!memberships.pageInfo.hasNextPage || !memberships.pageInfo.endCursor) {
      break;
    }

    after = memberships.pageInfo.endCursor;
  }

  return nodes;
}

export async function listTeamMembers(
  client: GraphQLClient,
  input: GetTeamInput,
): Promise<{ nodes: TeamMembershipNode[] }> {
  return { nodes: await fetchTeamMemberships(client, input.id) };
}

export async function addTeamMember(
  client: GraphQLClient,
  input: AddTeamMemberInput,
): Promise<TeamMembership> {
  const result = await client.request(AddTeamMemberDocument, {
    input: {
      teamId: input.teamId,
      userId: input.userId,
      ...(input.owner === undefined ? {} : { owner: input.owner }),
    },
  });

  return requireMutationEntity(
    result.teamMembershipCreate,
    "teamMembership",
    `Failed to add user "${input.userId}" to team "${input.teamId}"`,
  );
}

export async function removeTeamMember(
  client: GraphQLClient,
  input: RemoveTeamMemberInput,
): Promise<DeletedTeamMembership> {
  const memberships = await fetchTeamMemberships(client, input.teamId);
  const membership = memberships.find((m) => m.user?.id === input.userId);

  if (!membership) {
    throw notFoundError(
      "Team member",
      input.userId,
      `on team "${input.teamId}"`,
    );
  }

  const result = await client.request(RemoveTeamMemberDocument, {
    id: membership.id,
  });

  requireMutationSuccess(
    result.teamMembershipDelete,
    `Failed to remove user "${input.userId}" from team "${input.teamId}"`,
  );

  return { id: result.teamMembershipDelete.entityId, success: true };
}
