const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export interface IssueIdentifier {
  teamKey: string;
  issueNumber: number;
}

/** @throws Error if identifier format is invalid */
export function parseIssueIdentifier(identifier: string): IssueIdentifier {
  const parts = identifier.split("-");

  if (parts.length !== 2) {
    throw new Error(
      `Invalid issue identifier format: "${identifier}". Expected format: TEAM-123`,
    );
  }

  const teamKey = parts[0];
  const issueNumber = parseInt(parts[1], 10);

  if (Number.isNaN(issueNumber)) {
    throw new Error(`Invalid issue number in identifier: "${identifier}"`);
  }

  return { teamKey, issueNumber };
}

export function tryParseIssueIdentifier(
  identifier: string,
): IssueIdentifier | null {
  try {
    return parseIssueIdentifier(identifier);
  } catch {
    return null;
  }
}
