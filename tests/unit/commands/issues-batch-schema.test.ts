import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  KNOWN_ENTRY_KEYS,
  parseBatchCreateEntries,
} from "../../../src/commands/issues-batch.js";

/**
 * The published schema is the contract callers write their batch documents
 * against, so it has to stay in step with the parser that actually accepts
 * them. Nothing at runtime reads the schema — these tests are the only thing
 * standing between a new field and a schema that silently rejects it.
 */

const SCHEMA_PATH = fileURLToPath(
  new URL("../../../schemas/issues-batch-create.schema.json", import.meta.url),
);

interface BatchCreateSchema {
  $defs: {
    entry: {
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
      dependentRequired: Record<string, string[]>;
    };
  };
  examples: unknown[];
}

const schema = JSON.parse(
  readFileSync(SCHEMA_PATH, "utf8"),
) as BatchCreateSchema;
const entry = schema.$defs.entry;

describe("issues-batch-create.schema.json", () => {
  it("describes exactly the keys the parser accepts", () => {
    expect(Object.keys(entry.properties).sort()).toEqual(
      [...KNOWN_ENTRY_KEYS].sort(),
    );
  });

  it("rejects unknown keys, as the parser does", () => {
    expect(entry.additionalProperties).toBe(false);
  });

  it("requires the same fields the parser requires", () => {
    expect(entry.required.sort()).toEqual(["team", "title"]);
  });

  it("ties projectMilestone to project, as the parser does", () => {
    expect(entry.dependentRequired).toEqual({ projectMilestone: ["project"] });
  });

  it("only documents examples the parser accepts", () => {
    for (const example of schema.examples) {
      expect(() =>
        parseBatchCreateEntries(JSON.stringify(example)),
      ).not.toThrow();
    }
  });
});
