export function notFoundError(
  entityType: string,
  identifier: string,
  context?: string,
): Error {
  const contextStr = context ? ` ${context}` : "";
  return new Error(`${entityType} "${identifier}"${contextStr} not found`);
}

export function multipleMatchesError(
  entityType: string,
  identifier: string,
  matches: string[],
  disambiguation: string,
): Error {
  const matchList = matches.join(", ");
  return new Error(
    `Multiple ${entityType}s found matching "${identifier}". ` +
      `Candidates: ${matchList}. ` +
      `Please ${disambiguation}.`,
  );
}

export function invalidParameterError(
  parameter: string,
  reason: string,
): Error {
  return new Error(`Invalid ${parameter}: ${reason}`);
}

export function requiresParameterError(
  flag: string,
  requiredFlag: string,
): Error {
  return new Error(`${flag} requires ${requiredFlag} to be specified`);
}

export const AUTH_ERROR_CODE = 42;

/**
 * Exit code for a malformed invocation (unknown command/option, wrong argument
 * count). Distinct from 1 — an application error such as "entity not found" —
 * so a caller can tell "I called the CLI wrong" from "the entity is missing".
 */
export const USAGE_ERROR_CODE = 2;

type UsageErrorCode =
  | "UNKNOWN_COMMAND"
  | "UNKNOWN_OPTION"
  | "MISSING_ARGUMENT"
  | "TOO_MANY_ARGUMENTS"
  | "MISSING_SUBCOMMAND"
  | "INVALID_USAGE";

/**
 * The exit-code-2 envelope. Classified in `cli-errors.ts` and written by
 * `outputUsageError`; it lives here, next to the exit code it carries, so those
 * two modules do not have to import each other.
 */
export interface UsageErrorPayload {
  error: UsageErrorCode;
  /** Single-line description of the failure. */
  message: string;
  /** Commander's near-miss hint, e.g. "Did you mean --limit?" — when it has one. */
  suggestion?: string;
  /** Space-joined path of the command that failed to parse, e.g. "linearis issues". */
  command: string;
  /** Present only when the failing scope has subcommands to choose from. */
  available_commands?: string[];
  instruction: string;
  exit_code: number;
}

export class AuthenticationError extends Error {
  readonly details: string;

  constructor(details?: string) {
    super("Linear API authentication failed.");
    this.name = "AuthenticationError";
    this.details = details ?? "Your stored token is invalid or expired.";
  }
}

const AUTH_ERROR_PATTERNS: ReadonlyArray<string> = [
  "authentication required",
  "unauthorized",
];

export function isAuthError(error: unknown): boolean {
  if (error instanceof AuthenticationError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase().trim();
    return AUTH_ERROR_PATTERNS.some((pattern) => msg === pattern);
  }
  return false;
}
