import { type DocumentNode, Kind } from "graphql";
import { expect } from "vitest";

/**
 * Collect the names of every variable declared by the operation(s) in a
 * GraphQL document (e.g. `$projectId`, `$name` → "projectId", "name").
 */
function declaredVariableNames(doc: DocumentNode): Set<string> {
  const names = new Set<string>();
  for (const definition of doc.definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) {
      continue;
    }
    for (const variable of definition.variableDefinitions ?? []) {
      names.add(variable.variable.name.value);
    }
  }
  return names;
}

/**
 * Assert that every top-level key of the variables object passed to
 * `client.request` corresponds to a variable actually declared by the
 * document. This catches the input-shape-vs-declared-variable class of bug
 * (see issues #223 / #228): passing variables whose keys do not match the
 * mutation's declared variables (e.g. flat `$projectId`/`$name`/... against a
 * document declaring `$input`, or vice versa) would surface an undeclared key
 * here.
 */
export function assertVariablesMatchDocument(
  doc: DocumentNode,
  variables: Record<string, unknown>,
): void {
  const declared = declaredVariableNames(doc);
  const undeclared = Object.keys(variables).filter((key) => !declared.has(key));
  expect(
    undeclared,
    `Variables ${JSON.stringify(undeclared)} are not declared by the document (declared: ${JSON.stringify([...declared])})`,
  ).toEqual([]);
}
