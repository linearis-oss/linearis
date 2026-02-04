import type { LinearDocument } from "@linear/sdk";
import type { LinearSdkClient } from "../client/linear-client.js";

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
  client: LinearSdkClient,
  teamId?: string,
  activeOnly: boolean = false,
): Promise<Cycle[]> {
  const filter: LinearDocument.CycleFilter = {};

  if (teamId) {
    filter.team = { id: { eq: teamId } };
  }

  if (activeOnly) {
    filter.isActive = { eq: true };
  }

  const result = await client.sdk.cycles({ filter });

  return result.nodes.map((cycle) => ({
    id: cycle.id,
    number: cycle.number,
    name: cycle.name ?? `Cycle ${cycle.number}`,
    startsAt: new Date(cycle.startsAt).toISOString(),
    endsAt: new Date(cycle.endsAt).toISOString(),
    isActive: cycle.isActive,
    isNext: cycle.isNext,
    isPrevious: cycle.isPrevious,
  }));
}

export async function getCycle(
  client: LinearSdkClient,
  cycleId: string,
  issuesLimit: number = 50,
): Promise<CycleDetail> {
  const cycle = await client.sdk.cycle(cycleId);

  if (!cycle) {
    throw new Error(`Cycle with ID "${cycleId}" not found`);
  }

  const issues = await cycle.issues({ first: issuesLimit });

  return {
    id: cycle.id,
    number: cycle.number,
    name: cycle.name ?? `Cycle ${cycle.number}`,
    startsAt: new Date(cycle.startsAt).toISOString(),
    endsAt: new Date(cycle.endsAt).toISOString(),
    isActive: cycle.isActive,
    isNext: cycle.isNext,
    isPrevious: cycle.isPrevious,
    issues: await Promise.all(
      issues.nodes.map(async (issue) => {
        const state = await issue.state;
        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          state: { name: state?.name ?? "Unknown" },
        };
      }),
    ),
  };
}
