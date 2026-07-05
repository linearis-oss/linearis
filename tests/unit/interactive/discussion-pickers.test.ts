import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../../src/common/context.js";
import { InteractiveCancelledError } from "../../../src/common/errors.js";
import { asUuid, type UUID } from "../../../src/common/identifier.js";
import type { ChoicePicker } from "../../../src/common/interactive/pickers.js";
import type { PromptIO } from "../../../src/common/interactive/types.js";
import type { PaginatedResult } from "../../../src/common/types.js";
import type {
  DiscussionEntityKind,
  DiscussionThread,
} from "../../../src/services/discussion-service.js";

// The builder calls the real `listDiscussionReplies` service; stub it so the
// picker traversal can be exercised without a GraphQL client.
const { listDiscussionReplies } = vi.hoisted(() => ({
  listDiscussionReplies: vi.fn(),
}));
vi.mock("../../../src/services/discussion-service.js", async (orig) => ({
  ...(await orig<
    typeof import("../../../src/services/discussion-service.js")
  >()),
  listDiscussionReplies,
}));

const { makeDiscussionPickers } = await import(
  "../../../src/commands/discussion-pickers.js"
);

const CANCEL = Symbol("cancel");
const ctx = { gql: {} } as unknown as CommandContext;

function thread(id: string, parentId: string | null = null): DiscussionThread {
  return {
    id,
    body: `body of ${id}`,
    createdAt: "",
    editedAt: null,
    parentId,
    resolvedAt: null,
    resolvingComment: null,
    resolvingUser: null,
    user: { id: "u1", displayName: "Alice" },
  } as unknown as DiscussionThread;
}

function page(nodes: DiscussionThread[]): PaginatedResult<DiscussionThread> {
  return {
    nodes,
    pageInfo: {},
  } as unknown as PaginatedResult<DiscussionThread>;
}

/** Fake PromptIO whose `autocomplete` returns a scripted answer per message. */
function fakeIO(
  answers: Record<string, string | symbol>,
  notices: string[] = [],
): PromptIO {
  const unimplemented = async () => "";
  return {
    intro: (m) => notices.push(m),
    text: unimplemented,
    multiline: unimplemented,
    select: unimplemented,
    autocomplete: async (o) => answers[o.message] ?? "",
    multiselect: async () => [],
    autocompleteMultiselect: async () => [],
    confirm: async () => false,
    date: async () => new Date(),
    isCancel: (v) => v === CANCEL,
  };
}

interface Cfg {
  entityKind: DiscussionEntityKind;
  entityPicker: ChoicePicker;
  resolveEntityId: (ctx: CommandContext, human: string) => Promise<UUID>;
  listThreads: () => Promise<PaginatedResult<DiscussionThread>>;
}

function buildCfg(overrides: Partial<Cfg> = {}) {
  const entityPicker = vi.fn<ChoicePicker>(async () => "E1");
  const resolveEntityId = vi.fn(async () => asUuid("entity-uuid"));
  const listThreads = vi.fn(async () => page([thread("t1"), thread("t2")]));
  const cfg = {
    entityKind: "issue" as DiscussionEntityKind,
    entityPicker,
    resolveEntityId,
    listThreads,
    ...overrides,
  };
  return {
    pickers: makeDiscussionPickers(cfg),
    entityPicker,
    resolveEntityId,
    listThreads,
  };
}

describe("makeDiscussionPickers", () => {
  it("rootThreadPicker resolves entity then returns the chosen thread id", async () => {
    const { pickers, entityPicker, resolveEntityId } = buildCfg();
    const io = fakeIO({ Thread: "t2" });

    const result = await pickers.rootThreadPicker(ctx, io);

    expect(result).toBe("t2");
    expect(entityPicker).toHaveBeenCalledTimes(1);
    expect(resolveEntityId).toHaveBeenCalledWith(ctx, "E1");
  });

  it("re-prompts (does not abort) when the chosen entity has no threads", async () => {
    const listThreads = vi
      .fn<Cfg["listThreads"]>()
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([thread("t9")]));
    const { pickers, entityPicker } = buildCfg({ listThreads });
    const notices: string[] = [];
    const io = fakeIO({ Thread: "t9" }, notices);

    const result = await pickers.rootThreadPicker(ctx, io);

    expect(result).toBe("t9");
    expect(entityPicker).toHaveBeenCalledTimes(2);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("no discussion threads");
  });

  it("rootThreadPicker throws InteractiveCancelledError on cancel", async () => {
    const { pickers } = buildCfg();
    const io = fakeIO({ Thread: CANCEL });

    await expect(pickers.rootThreadPicker(ctx, io)).rejects.toBeInstanceOf(
      InteractiveCancelledError,
    );
  });

  it("commentOrReplyPicker offers the root thread AND its replies", async () => {
    listDiscussionReplies.mockResolvedValue(page([thread("r1", "t1")]));
    const { pickers } = buildCfg({
      listThreads: async () => page([thread("t1")]),
    });

    // Selecting the reply returns the reply id (root would return "t1").
    const io = fakeIO({ Thread: "t1", Comment: "r1" });
    const result = await pickers.commentOrReplyPicker(ctx, io);

    expect(result).toBe("r1");
    expect(listDiscussionReplies).toHaveBeenCalledWith(
      ctx.gql,
      asUuid("t1"),
      { limit: 50 },
      "issue",
    );
  });

  it("commentOrReplyPicker can return the root thread itself", async () => {
    listDiscussionReplies.mockResolvedValue(page([thread("r1", "t1")]));
    const { pickers } = buildCfg({
      listThreads: async () => page([thread("t1")]),
    });
    const io = fakeIO({ Thread: "t1", Comment: "t1" });

    expect(await pickers.commentOrReplyPicker(ctx, io)).toBe("t1");
  });

  it("replyPicker re-prompts when the chosen thread has no replies", async () => {
    listDiscussionReplies
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([thread("r5", "t1")]));
    const { pickers, entityPicker } = buildCfg({
      listThreads: async () => page([thread("t1")]),
    });
    const notices: string[] = [];
    const io = fakeIO({ Thread: "t1", Reply: "r5" }, notices);

    const result = await pickers.replyPicker(ctx, io);

    expect(result).toBe("r5");
    expect(entityPicker).toHaveBeenCalledTimes(2);
    expect(notices.some((n) => n.includes("no replies"))).toBe(true);
  });

  it.each([
    "issue",
    "project",
    "initiative",
  ] as const)("threads listing works for entityKind %s and forwards the kind to replies", async (entityKind) => {
    listDiscussionReplies.mockResolvedValue(page([thread("r1", "t1")]));
    const { pickers } = buildCfg({
      entityKind,
      listThreads: async () => page([thread("t1")]),
    });
    const io = fakeIO({ Thread: "t1", Reply: "r1" });

    const result = await pickers.replyPicker(ctx, io);

    expect(result).toBe("r1");
    expect(listDiscussionReplies).toHaveBeenLastCalledWith(
      ctx.gql,
      asUuid("t1"),
      { limit: 50 },
      entityKind,
    );
  });

  it("propagates cancellation thrown by the entity picker", async () => {
    const entityPicker = vi.fn<ChoicePicker>(async () => {
      throw new InteractiveCancelledError();
    });
    const { pickers } = buildCfg({ entityPicker });
    const io = fakeIO({});

    await expect(pickers.rootThreadPicker(ctx, io)).rejects.toBeInstanceOf(
      InteractiveCancelledError,
    );
  });
});
