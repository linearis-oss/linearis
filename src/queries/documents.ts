/**
 * GraphQL query strings for document operations
 *
 * This module loads and exports GraphQL queries from the .graphql files
 * for use with the GraphQLService rawRequest method.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the documents files once at module initialization
const documentsQueriesGraphQL = readFileSync(
  join(__dirname, "../../graphql/queries/documents.graphql"),
  "utf-8"
);
const documentsMutationsGraphQL = readFileSync(
  join(__dirname, "../../graphql/mutations/documents.graphql"),
  "utf-8"
);

// Combine both files for extraction
const documentsGraphQL = documentsQueriesGraphQL + "\n\n" + documentsMutationsGraphQL;

function extractOperation(source: string, operationName: string): string {
  // Extract fragments
  const fragmentPattern = /fragment\s+(\w+)\s+on\s+\w+\s*{[^}]*(?:{[^}]*}[^}]*)*}/gs;
  const fragments = new Map<string, string>();

  let match;
  while ((match = fragmentPattern.exec(source)) !== null) {
    fragments.set(match[1], match[0]);
  }

  // Find the operation
  const operationPattern = new RegExp(
    `(query|mutation)\\s+${operationName}\\s*\\([^)]*\\)\\s*{[\\s\\S]*?^}`,
    "m"
  );
  const opMatch = source.match(operationPattern);
  if (!opMatch) {
    throw new Error(`Operation ${operationName} not found in GraphQL file`);
  }

  const operation = opMatch[0];

  // Find all fragment spreads
  const spreadPattern = /\.\.\.\s*(\w+)/g;
  const usedFragments = new Set<string>();
  let spreadMatch;

  while ((spreadMatch = spreadPattern.exec(operation)) !== null) {
    usedFragments.add(spreadMatch[1]);
  }

  // Recursively collect nested fragments
  const collectFragments = (fragmentName: string, collected: Set<string>) => {
    if (collected.has(fragmentName)) return;

    const fragmentDef = fragments.get(fragmentName);
    if (!fragmentDef) return;

    collected.add(fragmentName);

    let nestedMatch;
    const nestedPattern = /\.\.\.\s*(\w+)/g;
    while ((nestedMatch = nestedPattern.exec(fragmentDef)) !== null) {
      collectFragments(nestedMatch[1], collected);
    }
  };

  const allFragments = new Set<string>();
  for (const frag of usedFragments) {
    collectFragments(frag, allFragments);
  }

  // Build the final query with fragments
  const fragmentDefs: string[] = [];
  for (const frag of allFragments) {
    const def = fragments.get(frag);
    if (def) fragmentDefs.push(def);
  }

  return fragmentDefs.length > 0
    ? `${fragmentDefs.join("\n\n")}\n\n${operation}`
    : operation;
}

export const GET_DOCUMENT_QUERY = extractOperation(documentsGraphQL, "GetDocument");
export const LIST_DOCUMENTS_QUERY = extractOperation(documentsGraphQL, "ListDocuments");
export const CREATE_DOCUMENT_MUTATION = extractOperation(documentsGraphQL, "DocumentCreate");
export const UPDATE_DOCUMENT_MUTATION = extractOperation(documentsGraphQL, "DocumentUpdate");
export const DELETE_DOCUMENT_MUTATION = extractOperation(documentsGraphQL, "DocumentDelete");
