#!/usr/bin/env node
/**
 * Counts the Linear root fields this CLI wires.
 *
 * The README's coverage section quotes a number ("wires N of them"). Before
 * this script that number was asserted by hand and drifted — it read 83 while
 * the documents held 81. Run this and paste the result rather than guessing.
 *
 * A "wired root field" is a top-level selection inside an operation in
 * `graphql/{queries,mutations}/*.graphql`. Fragments are skipped; a field
 * selected in several operations counts once. Note that a handful of names —
 * `projectUpdate`, for one — exist as both a query and a mutation, so the
 * operation count `--verify` reports is slightly higher than the name count.
 *
 *   node scripts/count-root-fields.mjs            # the count and the list
 *   node scripts/count-root-fields.mjs --json     # machine-readable
 *   node scripts/count-root-fields.mjs --verify   # also check against the live
 *                                                 # schema (needs network; the
 *                                                 # endpoint allows anonymous
 *                                                 # introspection)
 *
 * `--verify` reports the API-wide totals the README also quotes, and flags any
 * name that is not actually a root field — which would mean this parser has
 * mistaken a nested selection for one.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const graphqlRoot = path.join(repoRoot, "graphql");

/** Strip comments and string literals so braces and names parse cleanly. */
function stripNoise(source) {
  return source
    .replace(/"""[\s\S]*?"""/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/#[^\n]*/g, "");
}

/**
 * Extract the top-level selections of every operation in one document.
 *
 * Walks brace depth rather than using a GraphQL parser so the script stays
 * dependency-free: names at depth 1 inside an operation body are root fields.
 */
function rootFieldsIn(source) {
  const text = stripNoise(source);
  const found = new Set();
  const operation = /\b(query|mutation)\b[^{]*\{/g;

  let match = operation.exec(text);
  while (match !== null) {
    let depth = 1;
    let index = match.index + match[0].length;
    let expectFieldName = true;

    while (index < text.length && depth > 0) {
      const char = text[index];

      if (char === "{") {
        depth += 1;
        expectFieldName = false;
        index += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        expectFieldName = depth === 1;
        index += 1;
        continue;
      }

      if (char === "(") {
        // Skip the argument list wholesale; nothing in it is a root field.
        let parens = 1;
        index += 1;
        while (index < text.length && parens > 0) {
          if (text[index] === "(") parens += 1;
          if (text[index] === ")") parens -= 1;
          index += 1;
        }
        expectFieldName = false;
        continue;
      }

      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(index));
      if (name) {
        if (depth === 1 && expectFieldName) {
          // `alias: field` — the name before the colon is the caller's label,
          // not a root field. Leave expectFieldName set so the real one lands.
          const isAlias = /^\s*:/.test(text.slice(index + name[0].length));
          if (!isAlias) {
            found.add(name[0]);
            expectFieldName = false;
          }
        }
        index += name[0].length;
        continue;
      }

      if (char === "\n" || char === ",") {
        // A newline or comma at depth 1 ends one selection and starts the next.
        if (depth === 1) expectFieldName = true;
      } else if (char === ":") {
        // An alias: the name after the colon is the real field.
        if (depth === 1) expectFieldName = true;
      }

      index += 1;
    }

    operation.lastIndex = index;
    match = operation.exec(text);
  }

  return found;
}

const documents = ["queries", "mutations"].flatMap((kind) => {
  const dir = path.join(graphqlRoot, kind);
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".graphql"))
    .map((file) => path.join(dir, file));
});

const byField = new Map();
for (const file of documents) {
  const relative = path.relative(repoRoot, file);
  for (const field of rootFieldsIn(fs.readFileSync(file, "utf8"))) {
    const sources = byField.get(field) ?? [];
    sources.push(relative);
    byField.set(field, sources);
  }
}

const fields = [...byField.keys()].sort();

const ENDPOINT = "https://api.linear.app/graphql";

async function introspectRootFields() {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        'query { q: __type(name: "Query") { fields { name } } m: __type(name: "Mutation") { fields { name } } }',
    }),
  });

  if (!response.ok) {
    throw new Error(`introspection failed: HTTP ${response.status}`);
  }

  const { data, errors } = await response.json();
  if (errors) {
    throw new Error(`introspection failed: ${JSON.stringify(errors)}`);
  }

  return {
    queries: data.q.fields.map((field) => field.name),
    mutations: data.m.fields.map((field) => field.name),
  };
}

const verify = process.argv.includes("--verify");
const schema = verify ? await introspectRootFields() : null;

let report = null;
if (schema) {
  const wired = new Set(fields);
  const queries = schema.queries.filter((name) => wired.has(name));
  const mutations = schema.mutations.filter((name) => wired.has(name));
  const known = new Set([...schema.queries, ...schema.mutations]);

  report = {
    wired: queries.length + mutations.length,
    queries: { wired: queries.length, total: schema.queries.length },
    mutations: { wired: mutations.length, total: schema.mutations.length },
    total: schema.queries.length + schema.mutations.length,
    // A name like `projectUpdate` is both a query and a mutation, so the
    // operation count exceeds the count of distinct names.
    sharedNames: queries.filter((name) => mutations.includes(name)),
    notRootFields: fields.filter((name) => !known.has(name)),
  };
}

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      { count: fields.length, fields, ...(report && { report }) },
      null,
      2,
    ),
  );
} else {
  for (const field of fields) {
    console.log(field);
  }
  console.log(`\n${fields.length} distinct root field names wired`);

  if (report) {
    console.log(
      `${report.wired} of ${report.total} root operations ` +
        `(${report.queries.wired}/${report.queries.total} queries, ` +
        `${report.mutations.wired}/${report.mutations.total} mutations)`,
    );

    if (report.wired !== fields.length) {
      console.log(
        `${report.wired - fields.length} more operations than names: ` +
          "some names exist as both a query and a mutation " +
          `(${report.sharedNames.join(", ")})`,
      );
    }

    if (report.notRootFields.length > 0) {
      console.log(
        `\nnot root fields — this parser is wrong about: ${report.notRootFields.join(", ")}`,
      );
      process.exitCode = 1;
    }
  }
}
