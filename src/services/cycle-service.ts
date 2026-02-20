import type { GraphQLClient } from "../client/graphql-client.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  type CycleFilter,
  GetCycleByIdDocument,
  type GetCycleByIdQuery,
  GetCyclesDocument,
  type GetCyclesQuery,
} from "../gql/graphql.js";

export interface Cycle {
  id: string;
  number: number;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  isNext: boolean;
  isPrevious: boolean;
}

export interface CycleDetail extends Cycle {
  issues: Array<{
    id: string;
    identifier: string;
    title: string;
    state: { name: string };
  }>;
}

export async function listCycles(
  client: GraphQLClient,
  teamId?: string,
  activeOnly: boolean = false,
  options: PaginationOptions = {},
): Promise<PaginatedResult<Cycle>> {
  const { limit = 50, after } = options;
  const filter: CycleFilter = {};

  if (teamId) {
    filter.team = { id: { eq: teamId } };
  }

  if (activeOnly) {
    filter.isActive = { eq: true };
  }

  const result = await client.request<GetCyclesQuery>(GetCyclesDocument, {
    first: limit,
    after,
    filter,
  });

  return {
    nodes: result.cycles.nodes.map((cycle) => ({
      id: cycle.id,
      number: cycle.number,
      name: cycle.name ?? `Cycle ${cycle.number}`,
      startsAt: cycle.startsAt,
      endsAt: cycle.endsAt,
      isActive: cycle.isActive,
      isNext: cycle.isNext,
      isPrevious: cycle.isPrevious,
    })),
    pageInfo: result.cycles.pageInfo,
  };
}

export async function getCycle(
  client: GraphQLClient,
  cycleId: string,
  issuesLimit: number = 50,
): Promise<CycleDetail> {
  const result = await client.request<GetCycleByIdQuery>(GetCycleByIdDocument, {
    id: cycleId,
    first: issuesLimit,
  });

  const cycle = result.cycle;

  if (!cycle) {
    throw new Error(`Cycle with ID "${cycleId}" not found`);
  }

  return {
    id: cycle.id,
    number: cycle.number,
    name: cycle.name ?? `Cycle ${cycle.number}`,
    startsAt: cycle.startsAt,
    endsAt: cycle.endsAt,
    isActive: cycle.isActive,
    isNext: cycle.isNext,
    isPrevious: cycle.isPrevious,
    issues: cycle.issues.nodes.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      state: { name: issue.state.name },
    })),
  };
}
