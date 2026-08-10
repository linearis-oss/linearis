import { invalidParameterError } from "./errors.js";

/**
 * Parsing for the CLI's point-in-time flags (`issues remind --at`,
 * `issues snooze --until`).
 *
 * `parseDueDate` in `identifier.ts` covers Linear's `TimelessDate` scalar —
 * a calendar day with no clock time. The flags here map to `DateTime`, so they
 * need a different shape: a full instant, plus a relative shorthand, because
 * "remind me in two hours" is the overwhelmingly common case and spelling it
 * as an absolute timestamp on a command line is miserable.
 */

/** `+2h`, `+30m`, `+3d`, `+1w` — a whole number of units after `now`. */
const RELATIVE_REGEX = /^\+(\d+)([mhdw])$/;

/**
 * ISO-8601 instants, with the time and zone both optional. A bare date is
 * accepted and read as midnight UTC; a date-time with no zone is also read as
 * UTC rather than local time, so the same command produces the same instant
 * regardless of where it runs.
 */
const ISO_REGEX =
  /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:?\d{2})?)?$/;

const UNIT_MILLISECONDS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parses a point-in-time flag value into an ISO-8601 UTC timestamp.
 *
 * @param flag - Flag name, used verbatim in the error message (e.g. `--at`)
 * @param value - Either `+<n>[mhdw]` or an ISO-8601 date / date-time
 * @param now - Reference instant for relative values; injected so the parser
 *   stays pure and testable
 * @throws Error if the value matches neither form, names a date that does not
 *   exist (e.g. `2026-02-30`), or lands outside the range a `Date` can hold
 */
export function parseDateTimeOption(
  flag: string,
  value: string,
  now: Date = new Date(),
): string {
  const relative = RELATIVE_REGEX.exec(value);
  if (relative) {
    const [, amountRaw, unit] = relative;
    // Both groups are guaranteed present when the regex matches.
    const amount = Number(amountRaw);
    const unitMs = UNIT_MILLISECONDS[unit as string];

    if (amount === 0 || unitMs === undefined) {
      throw invalidParameterError(
        flag,
        `"${value}" must be a positive offset, e.g. +2h`,
      );
    }

    // A large enough offset lands outside the representable range of a Date
    // (±100 million days), where `toISOString()` throws a bare RangeError that
    // names neither the flag nor the value. Report it like every other bad
    // value here instead.
    const instant = new Date(now.getTime() + amount * unitMs);
    if (Number.isNaN(instant.getTime())) {
      throw invalidParameterError(
        flag,
        `"${value}" is too far in the future to represent`,
      );
    }

    return instant.toISOString();
  }

  const iso = ISO_REGEX.exec(value);
  if (!iso) {
    throw invalidParameterError(
      flag,
      `"${value}" must be an ISO-8601 date or date-time (2026-08-14T09:00:00Z) ` +
        `or a relative offset (+2h, +3d)`,
    );
  }

  const [, date, time, zone] = iso;

  // The calendar day is checked on its own rather than by round-tripping the
  // parsed instant: with an explicit offset the UTC day legitimately differs
  // from the written one (`2026-08-14T01:00+05:00` is the 13th in UTC), so a
  // round-trip comparison would reject valid input.
  if (!isRealCalendarDay(date as string)) {
    throw invalidParameterError(flag, `"${value}" is not a real date`);
  }

  const parsed = new Date(`${date}T${time ?? "00:00:00"}${zone ?? "Z"}`);

  if (Number.isNaN(parsed.getTime())) {
    throw invalidParameterError(flag, `"${value}" is not a real date-time`);
  }

  return parsed.toISOString();
}

/** True when `YYYY-MM-DD` names a day that exists (rejects 2026-02-30). */
function isRealCalendarDay(date: string): boolean {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const utc = new Date(Date.UTC(year, month - 1, day));

  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}
