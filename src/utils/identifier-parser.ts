/**
 * Represents a parsed Linear issue identifier in the format TEAM-123
 */
export interface ParsedIssueIdentifier {
  /** The team key (e.g., "ABC" from "ABC-123") */
  teamKey: string;
  /** The issue number (e.g., 123 from "ABC-123") */
  issueNumber: number;
}

/**
 * Parses a Linear issue identifier string in the format TEAM-123
 * 
 * @param identifier - The issue identifier to parse (e.g., "ABC-123")
 * @returns A ParsedIssueIdentifier object with teamKey and issueNumber
 * @throws Error if the identifier format is invalid
 * 
 * @example
 * ```typescript
 * const parsed = parseIssueIdentifier("ABC-123");
 * console.log(parsed.teamKey); // "ABC"
 * console.log(parsed.issueNumber); // 123
 * ```
 */
export function parseIssueIdentifier(identifier: string): ParsedIssueIdentifier {
  const parts = identifier.split("-");
  
  if (parts.length !== 2) {
    throw new Error(
      `Invalid issue identifier format: "${identifier}". Expected format: TEAM-123`,
    );
  }
  
  const teamKey = parts[0];
  const issueNumber = parseInt(parts[1]);
  
  if (isNaN(issueNumber)) {
    throw new Error(`Invalid issue number in identifier: "${identifier}"`);
  }
  
  return { teamKey, issueNumber };
}

/**
 * Safely attempts to parse a Linear issue identifier without throwing errors
 * 
 * @param identifier - The issue identifier to parse (e.g., "ABC-123")
 * @returns A ParsedIssueIdentifier object if valid, otherwise null
 * 
 * @example
 * ```typescript
 * const parsed = tryParseIssueIdentifier("ABC-123");
 * if (parsed) {
 *   console.log(`Team: ${parsed.teamKey}, Number: ${parsed.issueNumber}`);
 * } else {
 *   console.log("Invalid identifier format");
 * }
 * ```
 */
export function tryParseIssueIdentifier(identifier: string): ParsedIssueIdentifier | null {
  try {
    return parseIssueIdentifier(identifier);
  } catch (_error) {
    // Invalid TEAM-123 values are expected in permissive parsing paths.
    return null;
  }
}
