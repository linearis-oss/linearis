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
  const [teamKey, issueNumberRaw, ...rest] = identifier.split("-");

  if (
    teamKey === undefined ||
    issueNumberRaw === undefined ||
    rest.length > 0
  ) {
    throw new Error(
      `Invalid issue identifier format: "${identifier}". Expected format: TEAM-123`,
    );
  }

  const issueNumber = parseInt(issueNumberRaw, 10);

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
    // parseIssueIdentifier throws on invalid format — return null per try-parse contract
    return null;
  }
}

const DUE_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @throws Error if date format is invalid or date doesn't exist */
export function parseDueDate(value: string): string {
  const match = DUE_DATE_REGEX.exec(value);
  if (!match) {
    throw new Error(
      `Invalid due date format: "${value}". Expected format: YYYY-MM-DD`,
    );
  }

  // The three capture groups are guaranteed present when the regex matches.
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid due date: "${value}". The date does not exist.`);
  }

  return value;
}
