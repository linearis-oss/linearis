import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import { resolveSearchFilterIds } from "../../../src/resolvers/issue-filter-resolver.js";

const {
  resolveTeamIdMock,
  resolveUserIdMock,
  resolveProjectIdMock,
  resolveStatusIdMock,
  resolveLabelIdsMock,
  resolveCycleIdMock,
  resolveIssueIdMock,
} = vi.hoisted(() => ({
  resolveTeamIdMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  resolveProjectIdMock: vi.fn(),
  resolveStatusIdMock: vi.fn(),
  resolveLabelIdsMock: vi.fn(),
  resolveCycleIdMock: vi.fn(),
  resolveIssueIdMock: vi.fn(),
}));

vi.mock("../../../src/resolvers/team-resolver.js", () => ({
  resolveTeamId: resolveTeamIdMock,
}));

vi.mock("../../../src/resolvers/user-resolver.js", () => ({
  resolveUserId: resolveUserIdMock,
}));

vi.mock("../../../src/resolvers/project-resolver.js", () => ({
  resolveProjectId: resolveProjectIdMock,
}));

vi.mock("../../../src/resolvers/status-resolver.js", () => ({
  resolveStatusId: resolveStatusIdMock,
}));

vi.mock("../../../src/resolvers/label-resolver.js", () => ({
  resolveLabelIds: resolveLabelIdsMock,
}));

vi.mock("../../../src/resolvers/cycle-resolver.js", () => ({
  resolveCycleId: resolveCycleIdMock,
}));

vi.mock("../../../src/resolvers/issue-resolver.js", () => ({
  resolveIssueId: resolveIssueIdMock,
}));

describe("resolveSearchFilterIds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes resolved team UUID to status/cycle lookups", async () => {
    const sdk = {} as unknown as LinearSdkClient;

    resolveTeamIdMock.mockResolvedValue("team-uuid");
    resolveStatusIdMock.mockResolvedValue("state-uuid");
    resolveCycleIdMock.mockResolvedValue("cycle-uuid");

    const result = await resolveSearchFilterIds(sdk, {
      team: "ENG",
      statusNames: ["Todo"],
      cycle: "Sprint 1",
    });

    expect(resolveTeamIdMock).toHaveBeenCalledWith(sdk, "ENG");
    expect(resolveStatusIdMock).toHaveBeenCalledWith(sdk, "Todo", "team-uuid");
    expect(resolveCycleIdMock).toHaveBeenCalledWith(
      sdk,
      "Sprint 1",
      "team-uuid",
    );
    expect(result).toEqual({
      teamId: "team-uuid",
      stateIds: ["state-uuid"],
      cycleId: "cycle-uuid",
    });
  });

  it("falls back to raw team input for cycle lookup when team not pre-resolved", async () => {
    const sdk = {} as unknown as LinearSdkClient;

    resolveCycleIdMock.mockResolvedValue("cycle-uuid");

    const result = await resolveSearchFilterIds(sdk, {
      cycle: "Sprint 2",
      team: "Engineering",
    });

    expect(resolveCycleIdMock).toHaveBeenCalledWith(
      sdk,
      "Sprint 2",
      "Engineering",
    );
    expect(result).toEqual({ cycleId: "cycle-uuid" });
  });
});
