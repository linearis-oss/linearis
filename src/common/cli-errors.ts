import type { Command, CommanderError } from "commander";
import {
  AuthenticationError,
  USAGE_ERROR_CODE,
  type UsageErrorPayload,
} from "./errors.js";
import { outputAuthError, outputError, outputUsageError } from "./output.js";

type UsageErrorCode = UsageErrorPayload["error"];

/**
 * Pairs a Commander parse failure with the `Command` that raised it.
 *
 * Commander's `CommanderError` carries only a message and a code, so the scope
 * of the failure ("which command was being parsed?") would otherwise have to be
 * reconstructed from `argv` — which needs option-arity heuristics to tell an
 * option value from a subcommand name. Capturing the `Command` at throw time in
 * the per-command `exitOverride` callback avoids that entirely.
 *
 * Module-private: it never escapes {@link handleParseFailure}.
 */
class CliUsageError extends Error {
  readonly commanderError: CommanderError;
  readonly command: Command;

  constructor(commanderError: CommanderError, command: Command) {
    super(commanderError.message);
    this.name = "CliUsageError";
    this.commanderError = commanderError;
    this.command = command;
  }
}

/** "linearis issues read" for a leaf command, walking up via `parent`. */
function commandPath(command: Command): string {
  const parts: string[] = [];
  let current: Command | null = command;
  while (current) {
    parts.unshift(current.name());
    current = current.parent;
  }
  return parts.join(" ");
}

/**
 * Nearest command (self or ancestor) that owns a `usage` subcommand. Every
 * domain registers one and so does the root, so this always resolves to a
 * runnable suggestion.
 */
function usageScope(command: Command): Command {
  let current: Command | null = command;
  while (current) {
    if (current.commands.some((c) => c.name() === "usage")) return current;
    current = current.parent;
  }
  return command;
}

function classify(error: CommanderError, command: Command): UsageErrorCode {
  switch (error.code) {
    case "commander.unknownCommand":
      return "UNKNOWN_COMMAND";
    case "commander.excessArguments":
      // A domain command (`issues`) declares no arguments but has subcommands,
      // and its overview action handler makes Commander treat an unrecognised
      // subcommand as an excess operand rather than an unknown command.
      return command.commands.length > 0 &&
        command.registeredArguments.length === 0
        ? "UNKNOWN_COMMAND"
        : "TOO_MANY_ARGUMENTS";
    case "commander.unknownOption":
      return "UNKNOWN_OPTION";
    case "commander.missingArgument":
      return "MISSING_ARGUMENT";
    // Commander asks a command to print its own help when it has subcommands,
    // no action handler and no operand to dispatch on (`linearis issues`).
    case "commander.help":
      return "MISSING_SUBCOMMAND";
    default:
      return "INVALID_USAGE";
  }
}

/** The first operand Commander could not account for, if there is one. */
function offendingToken(
  error: CommanderError,
  command: Command,
): string | undefined {
  return error.code === "commander.unknownCommand"
    ? command.args[0]
    : command.args[command.registeredArguments.length];
}

/**
 * Split Commander's near-miss hint off the message.
 *
 * With `showSuggestionAfterError` (on by default) Commander appends the hint as
 * a parenthesised second line — `unknown option '--limt'\n(Did you mean
 * --limit?)`. Reusing that verbatim would put an embedded newline in a
 * machine-readable field, so the first line stays `message` and the hint gets
 * its own key, unwrapped from its parentheses.
 */
function splitSuggestion(raw: string): {
  message: string;
  suggestion?: string;
} {
  const [first = "", ...rest] = raw.split("\n");
  const message = first.replace(/^error: /, "");
  const hint = rest
    .join(" ")
    .trim()
    .replace(/^\((.*)\)$/, "$1");
  return hint.length > 0 ? { message, suggestion: hint } : { message };
}

/**
 * Turn a Commander parse failure into the JSON envelope the CLI contract
 * promises. Pure — exported for tests.
 */
export function describeUsageError(
  error: CommanderError,
  command: Command,
): UsageErrorPayload {
  const code = classify(error, command);
  const path = commandPath(command);
  const usagePath = commandPath(usageScope(command));
  const token = offendingToken(error, command);

  // The message Commander raises `commander.help` with is its internal
  // "(outputHelp)" placeholder, so this code needs its own phrasing rather than
  // the generic message fallback.
  const missingSubcommand = code === "MISSING_SUBCOMMAND";

  // The hint is worth keeping even where the message is rewritten: an unknown
  // subcommand is exactly the case Commander can suggest a near miss for.
  const { message: commanderMessage, suggestion } = splitSuggestion(
    error.message,
  );
  const message =
    code === "UNKNOWN_COMMAND" && token !== undefined
      ? `Unknown command "${token}" for "${path}".`
      : missingSubcommand
        ? `Missing subcommand for "${path}".`
        : commanderMessage;

  const instruction =
    code === "UNKNOWN_COMMAND" || missingSubcommand
      ? `Run '${usagePath} usage' to list valid subcommands.`
      : `Run '${usagePath} usage' to see the valid arguments and options.`;

  const available = command.commands.map((c) => c.name());

  return {
    error: code,
    message,
    ...(suggestion !== undefined ? { suggestion } : {}),
    command: path,
    ...(available.length > 0 ? { available_commands: available } : {}),
    instruction,
    exit_code: USAGE_ERROR_CODE,
  };
}

/**
 * Install per-command exit callbacks so a parse failure surfaces as a
 * `CliUsageError` carrying its `Command`, and silence Commander's plain-text
 * stderr writes.
 *
 * `Command.error()` writes the message to stderr *before* calling `_exit`, so
 * suppressing `writeErr` is what keeps stderr JSON-only; the same text is still
 * available on `CommanderError.message`.
 *
 * Must be called after every command has been registered, so the walk sees the
 * whole tree.
 */
export function interceptParseErrors(program: Command): void {
  const install = (cmd: Command): void => {
    cmd.exitOverride((err) => {
      throw new CliUsageError(err, cmd);
    });
    cmd.configureOutput({ writeErr: () => {} });
    for (const child of cmd.commands) install(child);
  };
  install(program);
}

/**
 * Terminal handler for anything escaping `program.parseAsync()`. Before this
 * existed the promise was neither awaited nor caught, so a rejection during
 * parsing surfaced as a raw Node unhandled-rejection stack trace.
 */
export function handleParseFailure(error: unknown): void {
  if (error instanceof CliUsageError) {
    // `--help`, `--version` and a bare `linearis <domain>` throw with exit code
    // 0 after writing to stdout: success, not a usage error.
    if (error.commanderError.exitCode === 0) {
      process.exit(0);
      return;
    }
    outputUsageError(describeUsageError(error.commanderError, error.command));
    return;
  }
  // Defensive: no Commander-registered option parser in this CLI throws, and
  // action handlers are already wrapped by handleCommand().
  if (error instanceof AuthenticationError) {
    outputAuthError(error);
    return;
  }
  outputError(error instanceof Error ? error : new Error(String(error)));
}
