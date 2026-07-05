import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../../src/common/context.js";
import { InteractiveCancelledError } from "../../../src/common/errors.js";
import { makeChoicePicker } from "../../../src/common/interactive/pickers.js";
import type {
  Choice,
  PromptIO,
} from "../../../src/common/interactive/types.js";

const CANCEL = Symbol("cancel");
const ctx = {} as CommandContext;

/** Fake PromptIO whose `select` returns a scripted answer per message. */
function fakeIO(answers: Record<string, string | symbol>): PromptIO {
  const unimplemented = async () => "";
  return {
    text: unimplemented,
    multiline: unimplemented,
    select: async (o) => answers[o.message] ?? "",
    autocomplete: unimplemented,
    multiselect: async () => [],
    autocompleteMultiselect: async () => [],
    confirm: async () => false,
    date: async () => new Date(),
    isCancel: (v) => v === CANCEL,
  };
}

describe("makeChoicePicker", () => {
  const choices: Choice[] = [{ value: "ENG-1", label: "ENG-1 Fix bug" }];

  it("returns the chosen value", async () => {
    const picker = makeChoicePicker("Issue", async () => choices);
    const result = await picker(ctx, fakeIO({ Issue: "ENG-1" }));
    expect(result).toBe("ENG-1");
  });

  it("throws InteractiveCancelledError on cancel", async () => {
    const picker = makeChoicePicker("Issue", async () => choices);
    await expect(picker(ctx, fakeIO({ Issue: CANCEL }))).rejects.toBeInstanceOf(
      InteractiveCancelledError,
    );
  });

  it("throws a clean error instead of rendering an empty select", async () => {
    // clack's select crashes on an empty option list, so the picker must guard.
    const load = vi.fn(async () => [] as Choice[]);
    const picker = makeChoicePicker("Issue", load);
    await expect(picker(ctx, fakeIO({}))).rejects.toThrow(
      "Invalid issue: none are available to choose from",
    );
  });
});
