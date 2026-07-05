import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import type { CommandContext } from "../../../src/common/context.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  allCycleChoices,
  cycleChoices,
  emojiChoices,
  initiativeChoices,
  labelChoices,
  milestoneChoices,
  optionalChoices,
  projectStatusChoices,
  statusChoices,
  teamChoices,
  withNoneChoice,
} from "../../../src/common/interactive/choices.js";
import { listWorkflowStates } from "../../../src/services/workflow-state-service.js";

const TEAM_UUID = "550e8400-e29b-41d4-a716-446655440000";

function mockCtx(request: ReturnType<typeof vi.fn>): CommandContext {
  return { gql: { request } as unknown as GraphQLClient };
}

describe("withNoneChoice", () => {
  it("prepends an empty-valued sentinel with the given label", () => {
    const result = withNoneChoice(
      [{ value: "t1", label: "Team One" }],
      "— all teams —",
    );

    expect(result).toEqual([
      { value: "", label: "— all teams —" },
      { value: "t1", label: "Team One" },
    ]);
  });
});

describe("optionalChoices", () => {
  it("prepends the leave-unchanged sentinel when the loader has options", async () => {
    const load = vi.fn().mockResolvedValue([{ value: "u1", label: "Ada" }]);

    const result = await optionalChoices(load, "Keep current")(
      mockCtx(vi.fn()),
      {},
    );

    expect(result).toEqual([
      { value: "", label: "Keep current" },
      { value: "u1", label: "Ada" },
    ]);
  });

  it("passes an empty list through so the engine skips the field", async () => {
    const load = vi.fn().mockResolvedValue([]);

    const result = await optionalChoices(load, "Keep current")(
      mockCtx(vi.fn()),
      {},
    );

    expect(result).toEqual([]);
  });
});

describe("listWorkflowStates", () => {
  it("queries the team-scoped states and sorts by position", async () => {
    const request = vi.fn().mockResolvedValue({
      workflowStates: {
        nodes: [
          { id: "s2", name: "Done", type: "completed", position: 2 },
          { id: "s1", name: "Todo", type: "unstarted", position: 1 },
        ],
      },
    });
    const client = { request } as unknown as GraphQLClient;

    const result = await listWorkflowStates(client, asUuid(TEAM_UUID));

    expect(request).toHaveBeenCalledWith(expect.anything(), {
      teamId: TEAM_UUID,
      first: 50,
    });
    expect(result.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});

describe("statusChoices", () => {
  it("returns [] when no team UUID is in the draft", async () => {
    const request = vi.fn();
    const result = await statusChoices(mockCtx(request), {});
    expect(result).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("maps team states to UUID-valued choices", async () => {
    const request = vi.fn().mockResolvedValue({
      workflowStates: {
        nodes: [{ id: "s1", name: "Todo", type: "unstarted", position: 1 }],
      },
    });

    const result = await statusChoices(mockCtx(request), { team: TEAM_UUID });

    expect(request).toHaveBeenCalledWith(expect.anything(), {
      teamId: TEAM_UUID,
      first: 50,
    });
    expect(result).toEqual([{ value: "s1", label: "Todo", hint: "unstarted" }]);
  });
});

const PROJECT_UUID = "660e8400-e29b-41d4-a716-446655440111";

describe("projectStatusChoices", () => {
  it("maps project statuses to UUID-valued choices", async () => {
    const request = vi.fn().mockResolvedValue({
      projectStatuses: {
        nodes: [
          { id: "ps1", name: "Backlog" },
          { id: "ps2", name: "Started" },
        ],
      },
    });

    const result = await projectStatusChoices(mockCtx(request));

    expect(result).toEqual([
      { value: "ps1", label: "Backlog" },
      { value: "ps2", label: "Started" },
    ]);
  });
});

describe("initiativeChoices", () => {
  it("maps initiatives to UUID-valued choices with status hints", async () => {
    const request = vi.fn().mockResolvedValue({
      initiatives: {
        nodes: [
          { id: "i1", name: "Q1 Goals", status: "Active" },
          { id: "i2", name: "Q2 Goals", status: null },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await initiativeChoices(mockCtx(request));

    expect(result).toEqual([
      { value: "i1", label: "Q1 Goals", hint: "Active" },
      { value: "i2", label: "Q2 Goals" },
    ]);
  });
});

describe("milestoneChoices", () => {
  it("returns [] when no project UUID is in the draft", async () => {
    const request = vi.fn();
    const result = await milestoneChoices(mockCtx(request), {});
    expect(result).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("loads milestones scoped to the draft project UUID", async () => {
    const request = vi.fn().mockResolvedValue({
      project: {
        projectMilestones: {
          nodes: [{ id: "m1", name: "Phase 1" }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    const result = await milestoneChoices(mockCtx(request), {
      project: PROJECT_UUID,
    });

    expect(result).toEqual([{ value: "m1", label: "Phase 1" }]);
  });
});

describe("teamChoices", () => {
  it("maps teams to UUID-valued choices with key hints", async () => {
    const request = vi.fn().mockResolvedValue({
      teams: {
        nodes: [{ id: "t1", name: "Engineering", key: "ENG" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await teamChoices(mockCtx(request));

    expect(result).toEqual([
      { value: "t1", label: "Engineering", hint: "ENG" },
    ]);
  });
});

describe("labelChoices", () => {
  it("scopes the label lookup to the draft team UUID", async () => {
    const request = vi.fn().mockResolvedValue({
      issueLabels: {
        nodes: [
          { id: "l1", name: "bug", color: "#f00", description: "defects" },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await labelChoices(mockCtx(request), { team: TEAM_UUID });

    const [, variables] = request.mock.calls[0];
    expect(variables.filter).toEqual({ team: { id: { eq: TEAM_UUID } } });
    expect(result).toEqual([{ value: "l1", label: "bug", hint: "defects" }]);
  });

  it("omits the team filter when no team UUID is in the draft", async () => {
    const request = vi.fn().mockResolvedValue({
      issueLabels: {
        nodes: [{ id: "l1", name: "bug", color: "#f00" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await labelChoices(mockCtx(request), {});

    const [, variables] = request.mock.calls[0];
    expect(variables.filter).toBeUndefined();
  });
});

describe("cycleChoices (cross-field: cycle needs team)", () => {
  const day = 24 * 60 * 60 * 1000;
  const iso = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * day).toISOString();

  it("scopes the lookup to the team, drops past cycles, and puts the current cycle first", async () => {
    const request = vi.fn().mockResolvedValue({
      cycles: {
        nodes: [
          // past cycle: ended before now → dropped
          {
            id: "past",
            number: 1,
            name: "Past",
            startsAt: iso(-28),
            endsAt: iso(-14),
            isActive: false,
            isNext: false,
            isPrevious: true,
          },
          // future cycle
          {
            id: "future",
            number: 3,
            name: "Future",
            startsAt: iso(14),
            endsAt: iso(28),
            isActive: false,
            isNext: true,
            isPrevious: false,
          },
          // current cycle: active, ends in the future
          {
            id: "current",
            number: 2,
            name: "Current",
            startsAt: iso(-3),
            endsAt: iso(11),
            isActive: true,
            isNext: false,
            isPrevious: false,
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await cycleChoices(mockCtx(request), { team: TEAM_UUID });

    const [, variables] = request.mock.calls[0];
    expect(variables.filter).toEqual({ team: { id: { eq: TEAM_UUID } } });
    // Past cycle excluded; current (active) first so it is the default.
    expect(result.map((c) => c.value)).toEqual(["current", "future"]);
    expect(result[0]?.hint).toBe("current");
  });
});

describe("allCycleChoices (read picker: keeps ended cycles)", () => {
  const day = 24 * 60 * 60 * 1000;
  const iso = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * day).toISOString();

  it("keeps past cycles and surfaces the active cycle first", async () => {
    const request = vi.fn().mockResolvedValue({
      cycles: {
        nodes: [
          {
            id: "past",
            number: 1,
            name: "Past",
            startsAt: iso(-28),
            endsAt: iso(-14),
            isActive: false,
            isNext: false,
            isPrevious: true,
          },
          {
            id: "future",
            number: 3,
            name: "Future",
            startsAt: iso(14),
            endsAt: iso(28),
            isActive: false,
            isNext: true,
            isPrevious: false,
          },
          {
            id: "current",
            number: 2,
            name: "Current",
            startsAt: iso(-3),
            endsAt: iso(11),
            isActive: true,
            isNext: false,
            isPrevious: false,
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await allCycleChoices(mockCtx(request), { team: TEAM_UUID });

    // Unlike cycleChoices, the past cycle is retained; active is first, then
    // remaining cycles most-recent-first by start date.
    expect(result.map((c) => c.value)).toEqual(["current", "future", "past"]);
  });
});

describe("emojiChoices", () => {
  it("maps common emoji to glyph-valued choices with shortcode hints", () => {
    const choices = emojiChoices();
    expect(choices.length).toBeGreaterThan(0);
    for (const choice of choices) {
      expect(typeof choice.value).toBe("string");
      expect(choice.value.length).toBeGreaterThan(0);
      expect(choice.hint).toBeDefined();
      expect(choice.label).toContain(`:${choice.hint}:`);
    }
  });
});
