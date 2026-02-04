/**
 * Creates a not found error with consistent formatting.
 */
export function notFoundError(
  entityType: string,
  identifier: string,
  context?: string,
): Error {
  const contextStr = context ? ` ${context}` : "";
  return new Error(`${entityType} "${identifier}"${contextStr} not found`);
}

/**
 * Creates an error for ambiguous identifier matches.
 */
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

/**
 * Creates an error for invalid parameter values.
 */
export function invalidParameterError(
  parameter: string,
  reason: string,
): Error {
  return new Error(`Invalid ${parameter}: ${reason}`);
}

/**
 * Creates an error when a flag requires another flag to be specified.
 */
export function requiresParameterError(
  flag: string,
  requiredFlag: string,
): Error {
  return new Error(`${flag} requires ${requiredFlag} to be specified`);
}
