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
