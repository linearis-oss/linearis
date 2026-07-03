import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../../src/common/context.js";
import { InteractiveCancelledError } from "../../../src/common/errors.js";
import {
  collectInteractive,
  maybeCollectInteractive,
} from "../../../src/common/interactive/engine.js";
import type {
  PromptIO,
  PromptSpec,
} from "../../../src/common/interactive/types.js";

const CANCEL = Symbol("cancel");

const ctx = {} as CommandContext;

/**
 * Build a fake PromptIO from scripted answers keyed by prompt message. Records
 * the order in which primitives were invoked so ordering assertions are
 * possible.
 */
function fakeIO(
  answers: Record<string, string | string[] | boolean | symbol>,
  calls: string[] = [],
): PromptIO {
  return {
    text: async (o) => {
      calls.push(`text:${o.message}`);
      return (answers[o.message] as string | symbol) ?? "";
    },
    multiline: async (o) => {
      calls.push(`multiline:${o.message}`);
      return (answers[o.message] as string | symbol) ?? "";
    },
    select: async (o) => {
      calls.push(`select:${o.message}`);
      return (answers[o.message] as string | symbol) ?? "";
    },
    autocomplete: async (o) => {
      calls.push(`autocomplete:${o.message}`);
      return (answers[o.message] as string | symbol) ?? "";
    },
    multiselect: async (o) => {
      calls.push(`multiselect:${o.message}`);
      return (answers[o.message] as string[] | symbol) ?? [];
    },
    autocompleteMultiselect: async (o) => {
      calls.push(`autocompleteMultiselect:${o.message}`);
      return (answers[o.message] as string[] | symbol) ?? [];
    },
    confirm: async (o) => {
      calls.push(`confirm:${o.message}`);
      return (answers[o.message] as boolean | symbol) ?? false;
    },
    isCancel: (v) => v === CANCEL,
  };
}

interface Opts extends Record<string, unknown> {
  team?: string;
  title?: string;
  cycle?: string;
  project?: string;
  milestone?: string;
}

describe("collectInteractive", () => {
  it("skips fields whose when() returns false", async () => {
    const calls: string[] = [];
    const io = fakeIO({ Milestone: "M1" }, calls);
    const spec: PromptSpec<Opts> = {
      fields: [
        {
          name: "milestone",
          kind: "text",
          message: "Milestone",
          when: (d) => d.project !== undefined,
        },
      ],
    };

    const result = await collectInteractive(ctx, spec, {}, io);

    expect(result.milestone).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("skips a field when the flag already provided it (skipIfProvided)", async () => {
    const calls: string[] = [];
    const io = fakeIO({ Title: "prompted" }, calls);
    const spec: PromptSpec<Opts> = {
      fields: [{ name: "title", kind: "text", message: "Title" }],
    };

    const result = await collectInteractive(
      ctx,
      spec,
      { title: "from-flag" },
      io,
    );

    expect(result.title).toBe("from-flag");
    expect(calls).toEqual([]);
  });

  it("re-prompts (does not skip) when skipIfProvided is false", async () => {
    const io = fakeIO({ Title: "prompted" });
    const spec: PromptSpec<Opts> = {
      fields: [
        {
          name: "title",
          kind: "text",
          message: "Title",
          skipIfProvided: false,
        },
      ],
    };

    const result = await collectInteractive(
      ctx,
      spec,
      { title: "from-flag" },
      io,
    );

    expect(result.title).toBe("prompted");
  });

  it("loads choices lazily so ordering deps hold (team before cycleChoices)", async () => {
    const calls: string[] = [];
    const io = fakeIO({ Team: "ENG", Cycle: "3" }, calls);

    const cycleChoices = vi.fn(async (_ctx, draft: Partial<Opts>) => {
      // The team must already be in the draft by the time cycle choices load.
      expect(draft.team).toBe("ENG");
      return [{ value: "3", label: "Cycle 3" }];
    });

    const spec: PromptSpec<Opts> = {
      fields: [
        {
          name: "team",
          kind: "select",
          message: "Team",
          choices: async () => [{ value: "ENG", label: "Engineering" }],
        },
        {
          name: "cycle",
          kind: "select",
          message: "Cycle",
          choices: cycleChoices,
        },
      ],
    };

    const result = await collectInteractive(ctx, spec, {}, io);

    expect(result.team).toBe("ENG");
    expect(result.cycle).toBe("3");
    expect(cycleChoices).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["select:Team", "select:Cycle"]);
  });

  it("throws InteractiveCancelledError on cancel", async () => {
    const io = fakeIO({ Title: CANCEL });
    const spec: PromptSpec<Opts> = {
      fields: [{ name: "title", kind: "text", message: "Title" }],
    };

    await expect(collectInteractive(ctx, spec, {}, io)).rejects.toBeInstanceOf(
      InteractiveCancelledError,
    );
  });

  it("passes the validate function through to the IO", async () => {
    const validate = vi.fn((v: string) =>
      v.length < 2 ? "too short" : undefined,
    );
    let seenValidate: ((v: string) => string | undefined) | undefined;
    const io: PromptIO = {
      ...fakeIO({}),
      text: async (o) => {
        seenValidate = o.validate;
        return "ok";
      },
    };
    const spec: PromptSpec<Opts> = {
      fields: [{ name: "title", kind: "text", message: "Title", validate }],
    };

    await collectInteractive(ctx, spec, {}, io);

    expect(seenValidate).toBe(validate);
    expect(seenValidate?.("x")).toBe("too short");
  });

  it("treats an empty answer as unset so it never overwrites a value", async () => {
    // A blank text prompt (clack returns "") or an empty-valued "none" choice
    // must leave the draft untouched, otherwise update builders that test
    // `!== undefined` would clear the existing value.
    const io = fakeIO({ Title: "", Team: "" });
    const spec: PromptSpec<Opts> = {
      fields: [
        { name: "title", kind: "text", message: "Title" },
        { name: "team", kind: "select", message: "Team" },
      ],
    };

    const result = await collectInteractive(ctx, spec, {}, io);

    expect("title" in result).toBe(false);
    expect("team" in result).toBe(false);
  });

  it("seeds the initial value from default(draft)", async () => {
    let seenInitial: string | undefined;
    const io: PromptIO = {
      ...fakeIO({}),
      text: async (o) => {
        seenInitial = o.initialValue;
        return o.initialValue ?? "";
      },
    };
    const spec: PromptSpec<Opts> = {
      fields: [
        {
          name: "title",
          kind: "text",
          message: "Title",
          default: (d) => `re: ${d.team ?? "none"}`,
        },
      ],
    };

    const result = await collectInteractive(ctx, spec, { team: "ENG" }, io);

    expect(seenInitial).toBe("re: ENG");
    expect(result.title).toBe("re: ENG");
  });
});

describe("maybeCollectInteractive positional picker", () => {
  const origStdin = process.stdin.isTTY;
  const origStdout = process.stdout.isTTY;
  const origCI = process.env["CI"];

  function setTTY(on: boolean): void {
    Object.defineProperty(process.stdin, "isTTY", {
      value: on,
      configurable: true,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      value: on,
      configurable: true,
    });
  }

  const emptySpec: PromptSpec<Record<string, never>> = { fields: [] };

  it("runs the picker when the positional is absent and gating passes", async () => {
    setTTY(true);
    process.env["CI"] = "";
    const picker = vi.fn(async () => "ENG-42");

    const result = await maybeCollectInteractive<Record<string, never>, string>(
      ctx,
      { interactive: true },
      {
        spec: emptySpec,
        options: {},
        missingRequired: true,
        positional: { name: "issue", value: undefined, picker },
        io: fakeIO({}),
      },
    );

    expect(picker).toHaveBeenCalledTimes(1);
    expect(result.positional).toBe("ENG-42");

    setTTY(!!origStdin && !!origStdout);
    process.env["CI"] = origCI ?? "";
  });

  it("does not run the picker when the positional is already provided", async () => {
    setTTY(true);
    process.env["CI"] = "";
    const picker = vi.fn(async () => "PICKED");

    const result = await maybeCollectInteractive<Record<string, never>, string>(
      ctx,
      { interactive: true },
      {
        spec: emptySpec,
        options: {},
        missingRequired: false,
        positional: { name: "issue", value: "ENG-1", picker },
        io: fakeIO({}),
      },
    );

    expect(picker).not.toHaveBeenCalled();
    expect(result.positional).toBe("ENG-1");

    setTTY(!!origStdin && !!origStdout);
    process.env["CI"] = origCI ?? "";
  });

  it("returns inputs untouched (no picker) when gating suppresses prompts", async () => {
    setTTY(false);
    const picker = vi.fn(async () => "PICKED");

    const result = await maybeCollectInteractive<Record<string, never>, string>(
      ctx,
      { interactive: true },
      {
        spec: emptySpec,
        options: {},
        missingRequired: true,
        positional: { name: "issue", value: undefined, picker },
        io: fakeIO({}),
      },
    );

    expect(picker).not.toHaveBeenCalled();
    expect(result.positional).toBeUndefined();

    setTTY(!!origStdin && !!origStdout);
  });
});
