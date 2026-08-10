import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  buildBatchUpdateContext,
  buildBatchUpdateInput,
  parseBatchCreateEntries,
  validateBatchUpdateEstimate,
} from "../../../src/commands/issues-batch.js";
import { asUuid } from "../../../src/common/identifier.js";
import type { ResolvedIssueRef } from "../../../src/resolvers/issue-resolver.js";

describe("parseBatchCreateEntries", () => {
  it("accepts the single-issue flag names as keys", () => {
    const entries = parseBatchCreateEntries(
      JSON.stringify([
        {
          title: "Fix login",
          team: "ENG",
          assignee: "alice",
          priority: 2,
          estimate: 3,
          project: "Auth",
          projectMilestone: "Beta",
          labels: ["bug", "urgent"],
          cycle: "Cycle 4",
          status: "Todo",
          parentTicket: "ENG-1",
          description: "body",
          dueDate: "2026-09-01",
          subscribers: ["bob"],
          delegate: "carol",
        },
      ]),
    );

    expect(entries).toEqual([
      {
        title: "Fix login",
        team: "ENG",
        assignee: "alice",
        priority: 2,
        estimate: 3,
        project: "Auth",
        projectMilestone: "Beta",
        labels: ["bug", "urgent"],
        cycle: "Cycle 4",
        status: "Todo",
        parentTicket: "ENG-1",
        description: "body",
        dueDate: "2026-09-01",
        subscribers: ["bob"],
        delegate: "carol",
      },
    ]);
  });

  it("accepts labels and subscribers in the comma-separated flag form", () => {
    const [entry] = parseBatchCreateEntries(
      JSON.stringify([
        {
          title: "T",
          team: "ENG",
          labels: "bug, urgent",
          subscribers: "bob, carol",
        },
      ]),
    );

    expect(entry?.labels).toEqual(["bug", "urgent"]);
    expect(entry?.subscribers).toEqual(["bob", "carol"]);
  });

  it("locates the entry when a comma-separated list has empty segments", () => {
    // parseCommaSeparated speaks in flags: on its own it reports a bare
    // "comma-separated list", which in a hundred-entry document says nothing
    // about where to look.
    expect(() =>
      parseBatchCreateEntries(
        JSON.stringify([
          { title: "A", team: "ENG" },
          { title: "B", team: "ENG", labels: "a,,b" },
        ]),
      ),
    ).toThrow(/batch document entry 1: has "labels" with empty segments/);
  });

  it("names the offending key when a list is not a list of strings", () => {
    expect(() =>
      parseBatchCreateEntries(
        JSON.stringify([{ title: "T", team: "ENG", subscribers: [1] }]),
      ),
    ).toThrow(/entry 0: has "subscribers" that is not a non-empty array/);
  });

  it("rejects an unknown key rather than dropping it", () => {
    // A typo that silently created the whole batch without the assignee would
    // be much harder to unpick than a rejected command.
    expect(() =>
      parseBatchCreateEntries(
        JSON.stringify([{ title: "T", team: "ENG", assingee: "alice" }]),
      ),
    ).toThrow(/entry 0: has unknown key "assingee"/);
  });

  it("requires title and team on every entry, naming the entry", () => {
    expect(() =>
      parseBatchCreateEntries(
        JSON.stringify([{ title: "T", team: "ENG" }, { title: "U" }]),
      ),
    ).toThrow(/entry 1: requires a non-empty string "team"/);
  });

  it("requires a project alongside a milestone", () => {
    expect(() =>
      parseBatchCreateEntries(
        JSON.stringify([{ title: "T", team: "ENG", projectMilestone: "Beta" }]),
      ),
    ).toThrow(/entry 0: has projectMilestone without project/);
  });

  it("validates due dates with the same parser as the flag", () => {
    expect(() =>
      parseBatchCreateEntries(
        JSON.stringify([{ title: "T", team: "ENG", dueDate: "01-09-2026" }]),
      ),
    ).toThrow(/Invalid due date format/);
  });

  it("rejects an out-of-range priority", () => {
    expect(() =>
      parseBatchCreateEntries(
        JSON.stringify([{ title: "T", team: "ENG", priority: 9 }]),
      ),
    ).toThrow(/entry 0: has "priority" outside the allowed range/);
  });

  it("rejects documents that are not a non-empty array of objects", () => {
    expect(() => parseBatchCreateEntries("not json")).toThrow(
      /is not valid JSON/,
    );
    expect(() => parseBatchCreateEntries('{"title":"T"}')).toThrow(
      /must be a JSON array of issue objects/,
    );
    expect(() => parseBatchCreateEntries("[]")).toThrow(/must not be empty/);
    expect(() => parseBatchCreateEntries("[1]")).toThrow(
      /entry 0: must be an object/,
    );
  });
});

describe("buildBatchUpdateContext", () => {
  const target = (teamKey: string): ResolvedIssueRef => ({
    ref: `${teamKey}-1`,
    id: asUuid("11111111-1111-4111-8111-111111111111"),
    teamId: asUuid("22222222-2222-4222-8222-222222222222"),
    teamKey,
  });

  it("scopes lookups to the only team when all targets share one", () => {
    const context = buildBatchUpdateContext([target("ENG"), target("ENG")], {
      issues: "ENG-1,ENG-2",
      status: "Todo",
    });

    expect(context).toEqual({
      teamId: asUuid("22222222-2222-4222-8222-222222222222"),
      teamKey: "ENG",
    });
  });

  it("rejects a named status or cycle spanning teams", () => {
    for (const options of [
      { issues: "ENG-1,OPS-1", status: "Todo" },
      { issues: "ENG-1,OPS-1", cycle: "Cycle 4" },
    ]) {
      expect(() =>
        buildBatchUpdateContext([target("ENG"), target("OPS")], options),
      ).toThrow(/cannot be resolved by name across teams ENG, OPS/);
    }
  });

  it("lets a UUID status or cycle through as the documented escape hatch", () => {
    // The error message advises passing a UUID; a UUID needs no team to
    // resolve against, so the guard must not reject it as well.
    const context = buildBatchUpdateContext([target("ENG"), target("OPS")], {
      issues: "ENG-1,OPS-1",
      status: "33333333-3333-4333-8333-333333333333",
      cycle: "44444444-4444-4444-8444-444444444444",
    });

    expect(context).toEqual({});
  });
});

describe("validateBatchUpdateEstimate", () => {
  const ENG_TEAM = "22222222-2222-4222-8222-222222222222";
  const OPS_TEAM = "55555555-5555-4555-8555-555555555555";

  const target = (teamKey: string, teamId: string): ResolvedIssueRef => ({
    ref: `${teamKey}-1`,
    id: asUuid("11111111-1111-4111-8111-111111111111"),
    teamId: asUuid(teamId),
    teamKey,
  });

  const teamResponse = (
    id: string,
    key: string,
    issueEstimationType: string,
  ) => ({
    teams: {
      nodes: [
        {
          id,
          key,
          name: key,
          issueEstimationType,
          issueEstimationExtended: false,
          issueEstimationAllowZero: false,
        },
      ],
    },
  });

  it("rejects an estimate outside the team's scale before sending anything", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(teamResponse(ENG_TEAM, "ENG", "fibonacci"));
    const client = { request } as unknown as GraphQLClient;

    await expect(
      validateBatchUpdateEstimate(client, [target("ENG", ENG_TEAM)], {
        issues: "ENG-1",
        estimate: "7",
      }),
    ).rejects.toThrow(/must be one of \[1, 2, 3, 5, 8\] for team "ENG"/);
  });

  it("accepts an estimate that is on the scale", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(teamResponse(ENG_TEAM, "ENG", "fibonacci"));
    const client = { request } as unknown as GraphQLClient;

    await expect(
      validateBatchUpdateEstimate(client, [target("ENG", ENG_TEAM)], {
        issues: "ENG-1",
        estimate: "5",
      }),
    ).resolves.toBeUndefined();
  });

  it("checks every team the batch spans, not just the first", async () => {
    // One patch applies the same estimate to all targets, so an estimate that
    // is valid on one team's scale and not another's must still be rejected.
    const request = vi
      .fn()
      .mockResolvedValueOnce(teamResponse(ENG_TEAM, "ENG", "fibonacci"))
      .mockResolvedValueOnce(teamResponse(OPS_TEAM, "OPS", "linear"));
    const client = { request } as unknown as GraphQLClient;

    await expect(
      validateBatchUpdateEstimate(
        client,
        [target("ENG", ENG_TEAM), target("OPS", OPS_TEAM)],
        { issues: "ENG-1,OPS-1", estimate: "8" },
      ),
    ).rejects.toThrow(/for team "OPS"/);
  });

  it("looks each distinct team up once and skips the lookup entirely without --estimate", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(teamResponse(ENG_TEAM, "ENG", "fibonacci"));
    const client = { request } as unknown as GraphQLClient;

    await validateBatchUpdateEstimate(
      client,
      [target("ENG", ENG_TEAM), target("ENG", ENG_TEAM)],
      { issues: "ENG-1,ENG-2", estimate: "3" },
    );
    expect(request).toHaveBeenCalledTimes(1);

    await validateBatchUpdateEstimate(client, [target("ENG", ENG_TEAM)], {
      issues: "ENG-1",
      title: "no estimate here",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("buildBatchUpdateInput", () => {
  const CYCLE = asUuid("66666666-6666-4666-8666-666666666666");
  const MILESTONE = asUuid("77777777-7777-4777-8777-777777777777");

  it("detaches the cycle with --clear-cycle", () => {
    expect(
      buildBatchUpdateInput({ issues: "ENG-1", clearCycle: true }, {}),
    ).toEqual({ cycleId: null });
  });

  it("detaches the milestone with --clear-project-milestone", () => {
    expect(
      buildBatchUpdateInput(
        { issues: "ENG-1", clearProjectMilestone: true },
        {},
      ),
    ).toEqual({ projectMilestoneId: null });
  });

  it("still sets a cycle or milestone when the clear flags are absent", () => {
    expect(
      buildBatchUpdateInput(
        { issues: "ENG-1", cycle: "Cycle 4", projectMilestone: "Beta" },
        { cycleId: CYCLE, projectMilestoneId: MILESTONE },
      ),
    ).toEqual({ cycleId: CYCLE, projectMilestoneId: MILESTONE });
  });
});
