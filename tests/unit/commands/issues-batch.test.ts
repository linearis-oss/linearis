import { describe, expect, it } from "vitest";
import { parseBatchCreateEntries } from "../../../src/commands/issues-batch.js";

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
      },
    ]);
  });

  it("accepts labels in the comma-separated flag form", () => {
    const [entry] = parseBatchCreateEntries(
      JSON.stringify([{ title: "T", team: "ENG", labels: "bug, urgent" }]),
    );

    expect(entry?.labels).toEqual(["bug", "urgent"]);
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
