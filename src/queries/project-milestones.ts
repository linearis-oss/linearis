/**
 * GraphQL query strings for project milestone operations
 *
 * This module loads and exports GraphQL queries from the .graphql files
 * for use with the GraphQLService rawRequest method.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the project-milestones files once at module initialization
const milestonesQueriesGraphQL = readFileSync(
  join(__dirname, "../../graphql/queries/project-milestones.graphql"),
  "utf-8"
);
const milestonesMutationsGraphQL = readFileSync(
  join(__dirname, "../../graphql/mutations/project-milestones.graphql"),
  "utf-8"
);

// Combine both files for extraction
const milestonesGraphQL = milestonesQueriesGraphQL + "\n\n" + milestonesMutationsGraphQL;

function extractOperation(source: string, operationName: string): string {
  // Extract fragments from issues.graphql since project-milestones uses CompleteIssueFields
  const issuesGraphQL = readFileSync(
    join(__dirname, "../../graphql/queries/issues.graphql"),
    "utf-8"
  );

  const fragmentPattern = /fragment\s+(\w+)\s+on\s+\w+\s*{[^}]*(?:{[^}]*}[^}]*)*}/gs;
  const fragments = new Map<string, string>();

  // Collect fragments from both files
  let match;
  while ((match = fragmentPattern.exec(source)) !== null) {
    fragments.set(match[1], match[0]);
  }
  while ((match = fragmentPattern.exec(issuesGraphQL)) !== null) {
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

export const LIST_PROJECT_MILESTONES_QUERY = extractOperation(milestonesGraphQL, "ListProjectMilestones");
export const GET_PROJECT_MILESTONE_BY_ID_QUERY = extractOperation(milestonesGraphQL, "GetProjectMilestoneById");
export const FIND_PROJECT_MILESTONE_BY_NAME_SCOPED = extractOperation(milestonesGraphQL, "FindProjectMilestoneScoped");
export const FIND_PROJECT_MILESTONE_BY_NAME_GLOBAL = extractOperation(milestonesGraphQL, "FindProjectMilestoneGlobal");
export const CREATE_PROJECT_MILESTONE_MUTATION = extractOperation(milestonesGraphQL, "CreateProjectMilestone");
export const UPDATE_PROJECT_MILESTONE_MUTATION = extractOperation(milestonesGraphQL, "UpdateProjectMilestone");
