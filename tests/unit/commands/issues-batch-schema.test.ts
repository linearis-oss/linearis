import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLEARABLE_PATCH_KEYS,
  KNOWN_ENTRY_KEYS,
  KNOWN_PATCH_KEYS,
  parseBatchCreateEntries,
  parseBatchUpdateDocument,
} from "../../../src/commands/issues-batch.js";

/**
 * The published schemas are the contract callers write their batch documents
 * against, so they have to stay in step with the parsers that actually accept
 * them. Nothing at runtime reads a schema — these tests are the only thing
 * standing between a new field and a schema that silently rejects it.
 */

const schemaPath = (name: string): string =>
  fileURLToPath(new URL(`../../../schemas/${name}`, import.meta.url));

const SCHEMA_PATH = schemaPath("issues-batch-create.schema.json");

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

interface SchemaBranch {
  type?: string;
  $ref?: string;
}

interface BatchUpdateSchema {
  required: string[];
  additionalProperties: boolean;
  $defs: {
    patch: {
      properties: Record<string, SchemaBranch & { oneOf?: SchemaBranch[] }>;
      additionalProperties: boolean;
      minProperties: number;
    };
  };
  examples: unknown[];
}

const updateSchema = JSON.parse(
  readFileSync(schemaPath("issues-batch-update.schema.json"), "utf8"),
) as BatchUpdateSchema;
const patch = updateSchema.$defs.patch;

/**
 * A property is clearable when the schema lets `null` through — either as an
 * inline `oneOf` branch or via the shared `nullableString` definition.
 */
const acceptsNull = (name: string): boolean => {
  const property = updateSchema.$defs.patch.properties[name];
  const branches = [property, ...(property?.oneOf ?? [])];

  return branches.some(
    (branch) =>
      branch?.type === "null" || branch?.$ref === "#/$defs/nullableString",
  );
};

describe("issues-batch-update.schema.json", () => {
  it("describes exactly the patch keys the parser accepts", () => {
    expect(Object.keys(patch.properties).sort()).toEqual(
      [...KNOWN_PATCH_KEYS].sort(),
    );
  });

  it("rejects unknown keys at both levels, as the parser does", () => {
    expect(updateSchema.additionalProperties).toBe(false);
    expect(patch.additionalProperties).toBe(false);
  });

  it("requires the targets and a patch that changes something", () => {
    expect(updateSchema.required.sort()).toEqual(["issues", "patch"]);
    expect(patch.minProperties).toBe(1);
  });

  it("allows null on exactly the fields the parser lets you clear", () => {
    // A schema that accepted null on a non-clearable field would wave through a
    // document the CLI then rejects; one that refused null on a clearable field
    // would flag a document that works.
    expect(Object.keys(patch.properties).filter(acceptsNull).sort()).toEqual(
      [...CLEARABLE_PATCH_KEYS].sort(),
    );
  });

  it("only documents examples the parser accepts", () => {
    for (const example of updateSchema.examples) {
      expect(() =>
        parseBatchUpdateDocument(JSON.stringify(example)),
      ).not.toThrow();
    }
  });
});
