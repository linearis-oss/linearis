// tests/unit/common/cli-errors.test.ts
import { Command, type CommanderError, InvalidArgumentError } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeUsageError,
  handleParseFailure,
  interceptParseErrors,
  type UsageErrorPayload,
} from "../../../src/common/cli-errors.js";

/**
 * Mirrors the shape of the real tree in `src/main.ts`: a root with an action
 * handler (the overview), domains whose action handler prints their own help
 * (`issues.action(() => issues.help())`), a subcommand group with no action
 * handler (`issues threads`, as built by `addCommentReactionCommands`), leaf
 * commands with declared arguments, and a `usage` subcommand at both the root
 * and domain level.
 */
function buildProgram() {
  const program = new Command();
  program
    .name("linearis")
    .description("CLI for Linear.app with JSON output")
    .version("1.2.3");
  program.action(() => console.log("overview"));

  const issues = program.command("issues").description("manage issues");
  issues.action(() => issues.help());

  const threads = issues
    .command("threads")
    .description("discussion thread reaction operations");
  threads
    .command("react")
    .argument("<thread>", "thread identifier")
    .action(() => {});

  const read = issues
    .command("read")
    .description("read an issue")
    .argument("<issue>", "issue identifier")
    .action(() => {});

  const list = issues
    .command("list")
    .description("list issues")
    .option("--limit <n>", "max results")
    .action(() => {});

  issues
    .command("usage")
    .description("show issues usage")
    .action(() => console.log("issues usage"));

  program
    .command("usage")
    .description("show overview")
    .action(() => console.log("usage"));

  return { program, issues, threads, read, list };
}

/**
 * Drive a parse failure and hand back the `CommanderError` raised by the
 * command we expect to fail. Only `target` gets an exit override, so the
 * assertion that `target` is the failing scope is part of the test rather than
 * a reimplementation of the production tree walk.
 */
async function captureFailure(
  program: Command,
  target: Command,
  argv: string[],
): Promise<CommanderError> {
  target.configureOutput({ writeErr: () => {} });
  let captured: CommanderError | undefined;
  target.exitOverride((error) => {
    captured = error;
    throw error;
  });
  await program.parseAsync(argv, { from: "user" }).catch(() => {});
  if (!captured) throw new Error(`expected ${target.name()} to fail parsing`);
  return captured;
}

describe("describeUsageError", () => {
  it("reports an unknown domain against the root scope", async () => {
    const { program } = buildProgram();
    const error = await captureFailure(program, program, [
      "issue",
      "read",
      "ABC-123",
    ]);

    const payload = describeUsageError(error, program);

    expect(payload.error).toBe("UNKNOWN_COMMAND");
    expect(payload.message).toBe('Unknown command "issue" for "linearis".');
    expect(payload.command).toBe("linearis");
    expect(payload.available_commands).toEqual(["issues", "usage"]);
    expect(payload.instruction).toBe(
      "Run 'linearis usage' to list valid subcommands.",
    );
    expect(payload.exit_code).toBe(2);
  });

  it("reports an unknown subcommand against the domain scope", async () => {
    const { program, issues } = buildProgram();
    const error = await captureFailure(program, issues, [
      "issues",
      "get",
      "ABC-123",
    ]);

    const payload = describeUsageError(error, issues);

    // Commander raises excessArguments (not unknownCommand) here because the
    // domain has an action handler and no declared arguments.
    expect(error.code).toBe("commander.excessArguments");
    expect(payload.error).toBe("UNKNOWN_COMMAND");
    expect(payload.message).toBe(
      'Unknown command "get" for "linearis issues".',
    );
    expect(payload.command).toBe("linearis issues");
    expect(payload.available_commands).toEqual([
      "threads",
      "read",
      "list",
      "usage",
    ]);
    expect(payload.instruction).toBe(
      "Run 'linearis issues usage' to list valid subcommands.",
    );
  });

  it("reports excess arguments on a leaf command", async () => {
    const { program, read } = buildProgram();
    const error = await captureFailure(program, read, [
      "issues",
      "read",
      "ABC-123",
      "EXTRA",
    ]);

    const payload = describeUsageError(error, read);

    expect(payload.error).toBe("TOO_MANY_ARGUMENTS");
    expect(payload.message).toContain("too many arguments for 'read'");
    expect(payload.message).not.toContain("error: ");
    expect(payload.command).toBe("linearis issues read");
    // A leaf has no subcommands, so the key is omitted entirely.
    expect(payload).not.toHaveProperty("available_commands");
    expect(payload.instruction).toBe(
      "Run 'linearis issues usage' to see the valid arguments and options.",
    );
  });

  it("reports a missing required argument", async () => {
    const { program, read } = buildProgram();
    const error = await captureFailure(program, read, ["issues", "read"]);

    const payload = describeUsageError(error, read);

    expect(payload.error).toBe("MISSING_ARGUMENT");
    expect(payload.message).toBe("missing required argument 'issue'");
    expect(payload.command).toBe("linearis issues read");
  });

  it("reports an unknown option", async () => {
    const { program, list } = buildProgram();
    const error = await captureFailure(program, list, [
      "issues",
      "list",
      "--bogus",
    ]);

    const payload = describeUsageError(error, list);

    expect(payload.error).toBe("UNKNOWN_OPTION");
    expect(payload.message).toBe("unknown option '--bogus'");
    expect(payload.command).toBe("linearis issues list");
  });

  it("maps a genuine commander.unknownCommand to UNKNOWN_COMMAND", async () => {
    // A parent without an action handler routes unrecognised operands through
    // unknownCommand() instead of _excessArguments().
    const program = new Command();
    program.name("linearis");
    program.command("issues").description("manage issues");
    program.command("usage").description("show overview");

    const error = await captureFailure(program, program, ["bogus"]);

    expect(error.code).toBe("commander.unknownCommand");
    const payload = describeUsageError(error, program);
    expect(payload.error).toBe("UNKNOWN_COMMAND");
    expect(payload.message).toBe('Unknown command "bogus" for "linearis".');
  });

  it("names the scope when a subcommand group gets no subcommand", async () => {
    const { program, threads } = buildProgram();
    const error = await captureFailure(program, threads, ["issues", "threads"]);

    const payload = describeUsageError(error, threads);

    // Commander asks the group to print its own help, with exit code 1 and the
    // internal "(outputHelp)" placeholder as the message.
    expect(error.code).toBe("commander.help");
    expect(error.exitCode).toBe(1);
    expect(payload.error).toBe("INVALID_USAGE");
    expect(payload.message).toBe(
      'Missing subcommand for "linearis issues threads".',
    );
    expect(payload.command).toBe("linearis issues threads");
    expect(payload.available_commands).toEqual(["react"]);
    expect(payload.instruction).toBe(
      "Run 'linearis issues usage' to list valid subcommands.",
    );
    expect(payload.exit_code).toBe(2);
  });

  it("falls back to INVALID_USAGE for other Commander failures", async () => {
    const { program, list } = buildProgram();
    list.option("--count <n>", "count", () => {
      throw new InvalidArgumentError("must be a positive integer");
    });

    const error = await captureFailure(program, list, [
      "issues",
      "list",
      "--count",
      "x",
    ]);

    const payload = describeUsageError(error, list);

    expect(payload.error).toBe("INVALID_USAGE");
    expect(payload.command).toBe("linearis issues list");
    expect(payload.exit_code).toBe(2);
  });
});

describe("interceptParseErrors + handleParseFailure", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runCli(argv: string[]): Promise<void> {
    const { program } = buildProgram();
    interceptParseErrors(program);
    await program.parseAsync(argv, { from: "user" }).catch(handleParseFailure);
  }

  function emittedPayload(): UsageErrorPayload {
    const raw = consoleErrorSpy.mock.calls[0]?.[0] as string;
    return JSON.parse(raw) as UsageErrorPayload;
  }

  it("emits a JSON envelope on stderr and exits 2", async () => {
    await runCli(["issues", "get", "ABC-123"]);

    expect(emittedPayload()).toMatchObject({
      error: "UNKNOWN_COMMAND",
      command: "linearis issues",
      exit_code: 2,
    });
    expect(exitSpy).toHaveBeenCalledWith(2);
    // Commander's plain-text message must not reach stderr alongside the JSON.
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("emits an envelope instead of help text for a bare subcommand group", async () => {
    await runCli(["issues", "threads"]);

    expect(emittedPayload()).toMatchObject({
      error: "INVALID_USAGE",
      message: 'Missing subcommand for "linearis issues threads".',
      command: "linearis issues threads",
      exit_code: 2,
    });
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["--help"],
    ["--version"],
    ["issues"],
  ])("leaves %s untouched and exits 0", async (arg) => {
    await runCli([arg]);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(exitSpy).not.toHaveBeenCalledWith(2);
    // All three throw an exit-code-0 CommanderError after writing to stdout:
    // `--help` and a bare domain via `help()`, `--version` via its own writer.
    expect(
      stdoutSpy.mock.calls.length + consoleLogSpy.mock.calls.length,
    ).toBeGreaterThan(0);
  });

  it("routes a non-Commander rejection to outputError", () => {
    handleParseFailure(new Error("boom"));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: "boom" }, null, 2),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("wraps a non-Error rejection", () => {
    handleParseFailure("plain string");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: "plain string" }, null, 2),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
