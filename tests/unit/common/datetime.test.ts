import { describe, expect, it } from "vitest";
import { parseDateTimeOption } from "../../../src/common/datetime.js";

// Fixed reference instant so relative offsets are deterministic.
const now = new Date("2026-08-10T12:00:00.000Z");

describe("parseDateTimeOption", () => {
  it("resolves relative offsets against the supplied instant", () => {
    expect(parseDateTimeOption("--at", "+30m", now)).toBe(
      "2026-08-10T12:30:00.000Z",
    );
    expect(parseDateTimeOption("--at", "+2h", now)).toBe(
      "2026-08-10T14:00:00.000Z",
    );
    expect(parseDateTimeOption("--at", "+3d", now)).toBe(
      "2026-08-13T12:00:00.000Z",
    );
    expect(parseDateTimeOption("--at", "+1w", now)).toBe(
      "2026-08-17T12:00:00.000Z",
    );
  });

  it("normalizes ISO-8601 input to UTC", () => {
    expect(parseDateTimeOption("--at", "2026-08-14T09:00:00Z", now)).toBe(
      "2026-08-14T09:00:00.000Z",
    );
    expect(parseDateTimeOption("--at", "2026-08-14T09:00:00+02:00", now)).toBe(
      "2026-08-14T07:00:00.000Z",
    );
  });

  it("reads a bare date and a zoneless date-time as UTC", () => {
    expect(parseDateTimeOption("--until", "2026-08-20", now)).toBe(
      "2026-08-20T00:00:00.000Z",
    );
    expect(parseDateTimeOption("--until", "2026-08-20T17:30", now)).toBe(
      "2026-08-20T17:30:00.000Z",
    );
  });

  it("keeps a written day that falls on the previous UTC day", () => {
    // Guards the calendar check: this is valid input whose UTC day differs
    // from the day as written.
    expect(parseDateTimeOption("--at", "2026-08-14T01:00:00+05:00", now)).toBe(
      "2026-08-13T20:00:00.000Z",
    );
  });

  it("rejects a zero offset", () => {
    expect(() => parseDateTimeOption("--at", "+0h", now)).toThrow(
      /must be a positive offset/,
    );
  });

  it("rejects an offset that overflows the Date range, naming the flag", () => {
    // Without the range check this reached toISOString() and came back as a
    // bare RangeError("Invalid time value") mentioning neither flag nor value.
    expect(() => parseDateTimeOption("--at", "+99999999w", now)).toThrow(
      /Invalid --at: "\+99999999w" is too far in the future/,
    );
  });

  it("rejects a day that does not exist", () => {
    expect(() => parseDateTimeOption("--at", "2026-02-30", now)).toThrow(
      /is not a real date/,
    );
  });

  it("rejects free-form input, naming the flag", () => {
    expect(() => parseDateTimeOption("--at", "tomorrow", now)).toThrow(
      /Invalid --at: "tomorrow" must be an ISO-8601 date/,
    );
    expect(() => parseDateTimeOption("--at", "-2h", now)).toThrow(
      /must be an ISO-8601 date/,
    );
  });
});
