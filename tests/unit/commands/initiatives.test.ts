import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({
    gql: { request: vi.fn() },
    sdk: { sdk: {} },
  })),
}));

vi.mock("../../../src/common/output.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/common/output.js")>();
  return {
    ...actual,
    outputSuccess: vi.fn(),
  };
});

vi.mock("../../../src/resolvers/initiative-resolver.js", () => ({
  resolveInitiativeId: vi.fn().mockResolvedValue("resolved-initiative-uuid"),
  resolveInitiativeRelationId: vi
    .fn()
    .mockResolvedValue("resolved-relation-uuid"),
  resolveInitiativeProjectLinkId: vi
    .fn()
    .mockResolvedValue("resolved-link-uuid"),
}));

vi.mock("../../../src/resolvers/project-resolver.js", () => ({
  resolveProjectId: vi.fn().mockResolvedValue("resolved-project-uuid"),
}));

vi.mock("../../../src/resolvers/team-resolver.js", () => ({
  resolveTeamId: vi.fn().mockResolvedValue("resolved-team-uuid"),
}));

vi.mock("../../../src/resolvers/user-resolver.js", () => ({
  resolveUserId: vi.fn().mockResolvedValue("resolved-user-uuid"),
}));

vi.mock("../../../src/services/initiative-service.js", () => ({
  listInitiatives: vi.fn().mockResolvedValue({
    nodes: [],
    pageInfo: { hasNextPage: false, endCursor: null },
  }),
  getInitiative: vi.fn().mockResolvedValue({ id: "resolved-initiative-uuid" }),
  createInitiative: vi
    .fn()
    .mockResolvedValue({ id: "resolved-initiative-uuid" }),
  updateInitiative: vi
    .fn()
    .mockResolvedValue({ id: "resolved-initiative-uuid" }),
  archiveInitiative: vi
    .fn()
    .mockResolvedValue({ id: "resolved-initiative-uuid" }),
  unarchiveInitiative: vi
    .fn()
    .mockResolvedValue({ id: "resolved-initiative-uuid" }),
  deleteInitiative: vi
    .fn()
    .mockResolvedValue({ id: "resolved-initiative-uuid", success: true }),
}));

vi.mock("../../../src/services/initiative-relation-service.js", () => ({
  createInitiativeRelation: vi
    .fn()
    .mockResolvedValue({ id: "resolved-relation-uuid" }),
  deleteInitiativeRelation: vi
    .fn()
    .mockResolvedValue({ id: "resolved-relation-uuid", success: true }),
}));

vi.mock("../../../src/services/initiative-project-service.js", () => ({
  createInitiativeProjectLink: vi
    .fn()
    .mockResolvedValue({ id: "resolved-link-uuid" }),
  deleteInitiativeProjectLink: vi
    .fn()
    .mockResolvedValue({ id: "resolved-link-uuid", success: true }),
}));

vi.mock("../../../src/services/initiative-update-service.js", () => ({
  listInitiativeUpdates: vi.fn().mockResolvedValue({
    nodes: [],
    pageInfo: { hasNextPage: false, endCursor: null },
  }),
  getInitiativeUpdate: vi
    .fn()
    .mockResolvedValue({ id: "resolved-update-uuid" }),
  createInitiativeUpdate: vi
    .fn()
    .mockResolvedValue({ id: "resolved-update-uuid" }),
  updateInitiativeUpdate: vi
    .fn()
    .mockResolvedValue({ id: "resolved-update-uuid" }),
  archiveInitiativeUpdate: vi
    .fn()
    .mockResolvedValue({ id: "resolved-update-uuid" }),
  unarchiveInitiativeUpdate: vi
    .fn()
    .mockResolvedValue({ id: "resolved-update-uuid" }),
}));

import { setupInitiativesCommands } from "../../../src/commands/initiatives/index.js";
import { outputSuccess } from "../../../src/common/output.js";
import { resolveInitiativeId } from "../../../src/resolvers/initiative-resolver.js";
import { resolveProjectId } from "../../../src/resolvers/project-resolver.js";
import { resolveUserId } from "../../../src/resolvers/user-resolver.js";
import {
  createInitiativeProjectLink,
  deleteInitiativeProjectLink,
} from "../../../src/services/initiative-project-service.js";
import {
  createInitiativeRelation,
  deleteInitiativeRelation,
} from "../../../src/services/initiative-relation-service.js";
import {
  listInitiatives,
  updateInitiative,
} from "../../../src/services/initiative-service.js";
import {
  createInitiativeUpdate,
  listInitiativeUpdates,
} from "../../../src/services/initiative-update-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupInitiativesCommands(program);
  return program;
}

describe("initiatives list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("parses and forwards includeArchived and supported sort", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--include-archived",
      "--sort-by",
      "updatedAt",
      "--limit",
      "5",
    ]);

    expect(listInitiatives).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        includeArchived: true,
        limit: 5,
        orderBy: "updatedAt",
      }),
    );
    expect(outputSuccess).toHaveBeenCalled();
  });

  it("validates invalid sort-order", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--sort-by",
      "updatedAt",
      "--sort-order",
      "sideways",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --sort-order"),
    );
    expect(listInitiatives).not.toHaveBeenCalled();
  });

  it("rejects unsupported sort-by values", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--sort-by",
      "name",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "not supported by current Linear initiatives API",
      ),
    );
    expect(listInitiatives).not.toHaveBeenCalled();
  });

  it("rejects sort-order because API does not support direction", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--sort-by",
      "updatedAt",
      "--sort-order",
      "desc",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "is not supported by current Linear initiatives API",
      ),
    );
    expect(listInitiatives).not.toHaveBeenCalled();
  });

  it("forwards supported filters including resolved owner", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--name",
      "Growth",
      "--owner",
      "Alice",
    ]);

    expect(resolveUserId).toHaveBeenCalledWith(expect.anything(), "Alice");
    expect(listInitiatives).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: expect.objectContaining({
          name: { eqIgnoreCase: "Growth" },
          owner: { id: { eq: "resolved-user-uuid" } },
        }),
      }),
    );
  });
});

describe("initiatives update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("rejects no-op update", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "update",
      "Growth",
    ]);

    expect(updateInitiative).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("at least one option must be provided"),
    );
  });
});

describe("initiative relations and projects wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("wires relate", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "relate",
      "Parent",
      "Child",
    ]);

    expect(resolveInitiativeId).toHaveBeenCalledTimes(2);
    expect(createInitiativeRelation).toHaveBeenCalledWith(expect.anything(), {
      parentId: "resolved-initiative-uuid",
      childId: "resolved-initiative-uuid",
    });
  });

  it("wires unrelate", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "unrelate",
      "Parent",
      "Child",
    ]);

    expect(deleteInitiativeRelation).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-relation-uuid",
    );
  });

  it("wires add-project", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "add-project",
      "Growth",
      "Website",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(expect.anything(), "Website");
    expect(createInitiativeProjectLink).toHaveBeenCalledWith(
      expect.anything(),
      {
        initiativeId: "resolved-initiative-uuid",
        projectId: "resolved-project-uuid",
      },
    );
  });

  it("wires remove-project", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "remove-project",
      "Growth",
      "Website",
    ]);

    expect(deleteInitiativeProjectLink).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-link-uuid",
    );
  });
});

describe("initiative updates wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("wires updates list", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "updates",
      "list",
      "--initiative",
      "Growth",
      "--include-archived",
      "--limit",
      "7",
    ]);

    expect(listInitiativeUpdates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        initiativeId: "resolved-initiative-uuid",
        includeArchived: true,
        limit: 7,
      }),
    );
  });

  it("wires updates create with title positional", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "updates",
      "create",
      "Weekly update",
      "--initiative",
      "Growth",
      "--body",
      "Steady progress",
      "--health",
      "onTrack",
    ]);

    expect(createInitiativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        initiativeId: "resolved-initiative-uuid",
        title: "Weekly update",
        body: "Steady progress",
      }),
    );
  });
});
