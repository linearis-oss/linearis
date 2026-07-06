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
  answers: Record<string, string | string[] | boolean | Date | symbol>,
  calls: string[] = [],
  intro?: (message: string) => void,
): PromptIO {
  return {
    ...(intro !== undefined ? { intro } : {}),
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
    date: async (o) => {
      calls.push(`date:${o.message}`);
      return (answers[o.message] as Date | symbol) ?? "";
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

  it("gives a required text field a non-blank validator (composed with any base)", async () => {
    let received: ((value: string) => string | undefined) | undefined;
    const io: PromptIO = {
      ...fakeIO({}),
      text: async (o) => {
        received = o.validate;
        return "Acme";
      },
    };
    const spec: PromptSpec<Opts> = {
      fields: [
        {
          name: "title",
          kind: "text",
          message: "Title",
          required: true,
          validate: (v) => (v === "bad" ? "no bad" : undefined),
        },
      ],
    };

    await collectInteractive(ctx, spec, {}, io);

    expect(received).toBeDefined();
    // Blank is rejected in place instead of being accepted as "leave unset".
    expect(received?.("")).toBe("Title is required");
    expect(received?.("   ")).toBe("Title is required");
    // A non-blank value still runs the caller-supplied validator.
    expect(received?.("bad")).toBe("no bad");
    expect(received?.("Acme")).toBeUndefined();
  });

  it("does not add a required validator to an optional text field", async () => {
    let received: ((value: string) => string | undefined) | undefined = () =>
      "sentinel";
    const io: PromptIO = {
      ...fakeIO({}),
      text: async (o) => {
        received = o.validate;
        return "";
      },
    };
    const spec: PromptSpec<Opts> = {
      fields: [{ name: "title", kind: "text", message: "Title" }],
    };

    await collectInteractive(ctx, spec, {}, io);

    expect(received).toBeUndefined();
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

  it("renders spec.intro exactly once, before the first field that prompts", async () => {
    const intro = vi.fn();
    const io = fakeIO({ Title: "hello" }, [], intro);
    const spec: PromptSpec<Opts> = {
      intro: "Create a new issue",
      fields: [
        { name: "title", kind: "text", message: "Title" },
        { name: "project", kind: "text", message: "Project" },
      ],
    };

    await collectInteractive(ctx, spec, {}, io);

    expect(intro).toHaveBeenCalledTimes(1);
    expect(intro).toHaveBeenCalledWith("Create a new issue");
  });

  it("does not render spec.intro when every field is skipped/provided", async () => {
    const intro = vi.fn();
    const io = fakeIO({}, [], intro);
    const spec: PromptSpec<Opts> = {
      intro: "Create a new issue",
      fields: [{ name: "title", kind: "text", message: "Title" }],
    };

    await collectInteractive(ctx, spec, { title: "from-flag" }, io);

    expect(intro).not.toHaveBeenCalled();
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

  it("optional date: confirm gate accepted → picker value formatted to local YYYY-MM-DD", async () => {
    // March 5 2024, local time. Local getters must produce 2024-03-05
    // regardless of the runner's timezone (a naive toISOString could shift it).
    const picked = new Date(2024, 2, 5, 12, 0, 0);
    const calls: string[] = [];
    const io = fakeIO({ "Set a due date?": true, "Due date": picked }, calls);
    const spec: PromptSpec<Opts & { dueDate?: string }> = {
      fields: [{ name: "dueDate", kind: "date", message: "Due date" }],
    };

    const result = await collectInteractive(ctx, spec, {}, io);

    expect(result.dueDate).toBe("2024-03-05");
    expect(calls).toEqual(["confirm:Set a due date?", "date:Due date"]);
  });

  it("optional date: confirm gate declined → field left unset, picker never shown", async () => {
    const calls: string[] = [];
    const io = fakeIO({ "Set a due date?": false }, calls);
    const spec: PromptSpec<Opts & { dueDate?: string }> = {
      fields: [{ name: "dueDate", kind: "date", message: "Due date" }],
    };

    const result = await collectInteractive(ctx, spec, {}, io);

    expect("dueDate" in result).toBe(false);
    expect(calls).toEqual(["confirm:Set a due date?"]);
  });

  it("date: cancel in the picker throws InteractiveCancelledError", async () => {
    const io = fakeIO({ "Set a due date?": true, "Due date": CANCEL });
    const spec: PromptSpec<Opts & { dueDate?: string }> = {
      fields: [{ name: "dueDate", kind: "date", message: "Due date" }],
    };

    await expect(collectInteractive(ctx, spec, {}, io)).rejects.toBeInstanceOf(
      InteractiveCancelledError,
    );
  });

  it("date: cancel in the confirm gate throws InteractiveCancelledError", async () => {
    const io = fakeIO({ "Set a due date?": CANCEL });
    const spec: PromptSpec<Opts & { dueDate?: string }> = {
      fields: [{ name: "dueDate", kind: "date", message: "Due date" }],
    };

    await expect(collectInteractive(ctx, spec, {}, io)).rejects.toBeInstanceOf(
      InteractiveCancelledError,
    );
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

  it("runs the positional picker before the field wizard", async () => {
    setTTY(true);
    process.env["CI"] = "";
    const calls: string[] = [];
    const picker = vi.fn(async () => {
      calls.push("picker");
      return "ENG-42";
    });
    const spec: PromptSpec<{ title?: string } & Record<string, unknown>> = {
      fields: [{ name: "title", kind: "text", message: "Title" }],
    };

    const result = await maybeCollectInteractive<
      { title?: string } & Record<string, unknown>,
      string
    >(
      ctx,
      { interactive: true },
      {
        spec,
        options: {},
        missingRequired: true,
        positional: { name: "issue", value: undefined, picker },
        io: fakeIO({ Title: "hello" }, calls),
      },
    );

    // The user picks which entity to act on before being prompted for fields.
    expect(calls).toEqual(["picker", "text:Title"]);
    expect(result.positional).toBe("ENG-42");
    expect(result.options.title).toBe("hello");

    setTTY(!!origStdin && !!origStdout);
    process.env["CI"] = origCI ?? "";
  });
});
