/**
 * GraphQL queries and mutations for project operations
 *
 * Contains project-specific queries including the create mutation.
 * Uses consistent response structure matching LinearProject type.
 */

/**
 * Project response fragment with all relationships
 *
 * Includes teams, lead, and all standard project fields.
 * Used for consistent responses across project operations.
 */
export const PROJECT_FRAGMENT = `
  id
  name
  description
  state
  progress
  teams {
    nodes {
      id
      key
      name
    }
  }
  lead {
    id
    name
  }
  targetDate
  startDate
  createdAt
  updatedAt
`;

/**
 * Create project mutation with complete response
 *
 * Creates a new project and returns complete project data including
 * all relationships. TeamIds is required by the GraphQL API.
 */
export const CREATE_PROJECT_MUTATION = `
  mutation CreateProject($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      success
      project {
        ${PROJECT_FRAGMENT}
      }
    }
  }
`;

/**
 * List projects query with filtering
 *
 * Fetches projects with optional team filtering.
 * Returns complete project data for each result.
 */
export const LIST_PROJECTS_QUERY = `
  query ListProjects($first: Int!, $filter: ProjectFilter) {
    projects(first: $first, filter: $filter) {
      nodes {
        ${PROJECT_FRAGMENT}
      }
    }
  }
`;
