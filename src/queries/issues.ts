/**
 * Optimized GraphQL queries for issue operations
 *
 * This module contains highly optimized GraphQL queries that fetch
 * all necessary issue data in single requests, eliminating N+1 query
 * problem common with Linear SDK. Each query uses comprehensive
 * fragments to ensure consistent data structures.
 */

import {
  COMPLETE_ISSUE_FRAGMENT,
  COMPLETE_ISSUE_WITH_COMMENTS_FRAGMENT,
} from "./common.js";

/**
 * Get issues list with all relationships in single query
 *
 * Fetches paginated issues excluding completed ones,
 * ordered by most recently updated. Includes all relationships
 * for comprehensive issue data.
 */
export const GET_ISSUES_QUERY = `
  query GetIssues($first: Int!, $orderBy: PaginationOrderBy) {
    issues(
      first: $first
      orderBy: $orderBy
      filter: {
        state: { type: { neq: "completed" } }
      }
    ) {
      nodes {
        ${COMPLETE_ISSUE_FRAGMENT}
      }
    }
  }
`;

/**
 * Search issues with text search and all relationships in single query
 *
 * Provides full-text search across Linear issues with complete
 * relationship data for each match.
 */
export const SEARCH_ISSUES_QUERY = `
  query SearchIssues($term: String!, $first: Int!) {
    searchIssues(term: $term, first: $first, includeArchived: false) {
      nodes {
        ${COMPLETE_ISSUE_FRAGMENT}
      }
    }
  }
`;

/**
 * Search issues with advanced filters and all relationships in single query
 *
 * Supports filtering by team, assignee, project, and states.
 * Used by the advanced search functionality with multiple criteria.
 */
export const FILTERED_SEARCH_ISSUES_QUERY = `
  query FilteredSearchIssues(
    $first: Int!
    $filter: IssueFilter
    $orderBy: PaginationOrderBy
  ) {
    issues(
      first: $first
      filter: $filter
      orderBy: $orderBy
      includeArchived: false
    ) {
      nodes {
        ${COMPLETE_ISSUE_FRAGMENT}
      }
    }
  }
`;

/**
 * Batch resolve query for search filters
 *
 * Resolves human-readable identifiers to UUIDs in a single batch query.
 * Used to pre-resolve teams, projects, and assignees before executing
 * main search query to avoid N+1 queries.
 */
export const BATCH_RESOLVE_FOR_SEARCH_QUERY = `
  query BatchResolveForSearch(
    $teamKey: String
    $teamName: String
    $projectName: String
    $assigneeEmail: String
  ) {
    # Resolve team if provided
    teams(
      filter: {
        or: [
          { key: { eq: $teamKey } }
          { name: { eq: $teamName } }
        ]
      }
      first: 1
    ) {
      nodes {
        id
        key
        name
      }
    }

    # Resolve project if provided (case-insensitive to be user-friendly)
    projects(filter: { name: { eqIgnoreCase: $projectName } }, first: 1) {
      nodes {
        id
        name
      }
    }

    # Resolve user by email if provided
    users(filter: { email: { eq: $assigneeEmail } }, first: 1) {
      nodes {
        id
        name
        email
      }
    }
  }
`;

/**
 * Get single issue by UUID with comments and all relationships
 *
 * Fetches complete issue data including comments by direct UUID lookup.
 * Uses the comprehensive fragment with comment data for detailed view.
 */
export const GET_ISSUE_BY_ID_QUERY = `
  query GetIssue($id: String!) {
    issue(id: $id) {
      ${COMPLETE_ISSUE_WITH_COMMENTS_FRAGMENT}
    }
  }
`;

/**
 * Get issue by identifier (team key + number)
 *
 * Fetches issue using TEAM-123 format. Resolves team key and
 * issue number to find the exact issue, returning complete data with comments.
 */
export const GET_ISSUE_BY_IDENTIFIER_QUERY = `
  query GetIssueByIdentifier($teamKey: String!, $number: Float!) {
    issues(
      filter: {
        team: { key: { eq: $teamKey } }
        number: { eq: $number }
      }
      first: 1
    ) {
      nodes {
        ${COMPLETE_ISSUE_WITH_COMMENTS_FRAGMENT}
      }
    }
  }
`;

/**
 * Comprehensive batch resolve for update operations
 *
 * Resolves all necessary entity references in a single batch query
 * before issue update. Includes labels, projects, teams, and parent issues.
 * This prevents N+1 queries during update operations.
 */
export const BATCH_RESOLVE_FOR_UPDATE_QUERY = `
  query BatchResolveForUpdate(
    $labelNames: [String!]
    $projectName: String
    $teamKey: String
    $issueNumber: Float
    $milestoneName: String
  ) {
    # Resolve labels if provided
    labels: issueLabels(filter: { name: { in: $labelNames } }) {
      nodes {
        id
        name
        isGroup
        parent {
          id
          name
        }
        children {
          nodes {
            id
            name
          }
        }
      }
    }

    # Resolve project if provided (case-insensitive to be user-friendly)
    projects(filter: { name: { eqIgnoreCase: $projectName } }, first: 1) {
      nodes {
        id
        name
        projectMilestones {
          nodes {
            id
            name
          }
        }
      }
    }

    # Resolve milestone if provided (standalone query in case no project context)
    milestones: projectMilestones(
      filter: { name: { eq: $milestoneName } }
      first: 1
    ) {
      nodes {
        id
        name
      }
    }

    # Resolve issue identifier if provided
    issues(
      filter: {
        and: [
          { team: { key: { eq: $teamKey } } }
          { number: { eq: $issueNumber } }
        ]
      }
      first: 1
    ) {
      nodes {
        id
        identifier
        labels {
          nodes {
            id
            name
          }
        }
        project {
          id
          projectMilestones {
            nodes {
              id
              name
            }
          }
        }
      }
    }
  }
`;

/**
 * Create issue mutation with complete response
 *
 * Creates a new issue and returns complete issue data including
 * all relationships. Uses the comprehensive fragment to ensure
 * consistent data structure with read operations.
 */
export const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        ${COMPLETE_ISSUE_WITH_COMMENTS_FRAGMENT}
      }
    }
  }
`;

/**
 * Update issue mutation with complete response
 *
 * Updates an existing issue and returns complete issue data with
 * all relationships. Ensures consistency between update and read
 * operations by using the same fragment structure.
 */
export const UPDATE_ISSUE_MUTATION = `
  mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        ${COMPLETE_ISSUE_WITH_COMMENTS_FRAGMENT}
      }
    }
  }
`;

/**
 * Comprehensive batch resolve for create operations
 *
 * Resolves all entity references needed for issue creation in a single
 * batch query. Prevents N+1 queries during issue creation by
 * pre-resolving teams, projects, labels, and parent issues.
 */
export const BATCH_RESOLVE_FOR_CREATE_QUERY = `
  query BatchResolveForCreate(
    $teamKey: String
    $teamName: String
    $projectName: String
    $labelNames: [String!]
    $parentTeamKey: String
    $parentIssueNumber: Float
  ) {
    # Resolve team if provided
    teams(
      filter: {
        or: [
          { key: { eq: $teamKey } }
          { name: { eq: $teamName } }
        ]
      }
      first: 1
    ) {
      nodes {
        id
        key
        name
      }
    }

    # Resolve project if provided (case-insensitive to be user-friendly)
    projects(filter: { name: { eqIgnoreCase: $projectName } }, first: 1) {
      nodes {
        id
        name
        projectMilestones {
          nodes { id name }
        }
        # Projects don't own cycles directly, but include teams for context if needed
      }
    }

    # Resolve labels if provided
    labels: issueLabels(filter: { name: { in: $labelNames } }) {
      nodes {
        id
        name
        isGroup
        parent {
          id
          name
        }
        children {
          nodes {
            id
            name
          }
        }
      }
    }

    # Resolve parent issue if provided
    parentIssues: issues(
      filter: {
        and: [
          { team: { key: { eq: $parentTeamKey } } }
          { number: { eq: $parentIssueNumber } }
        ]
      }
      first: 1
    ) {
      nodes {
        id
        identifier
      }
    }

    # Resolve cycles by name (team-scoped lookup is preferred but we also provide global fallback)

  }
`;

/**
 * File upload mutation to get signed upload URL
 *
 * Returns signed URL and headers for uploading file to Linear's cloud storage.
 * This is step 1 of the three-step upload process.
 *
 * @see {@link https://linear.app/docs/graphql/mutations#fileUpload}
 */
export const FILE_UPLOAD_MUTATION = `
  mutation FileUpload(
    $contentType: String!
    $filename: String!
    $size: Int!
    $makePublic: Boolean
    $metaData: JSON
  ) {
    fileUpload(
      contentType: $contentType
      filename: $filename
      size: $size
      makePublic: $makePublic
      metaData: $metaData
    ) {
      success
      lastSyncId
      uploadFile {
        uploadUrl
        assetUrl
        headers {
          key
          value
        }
        contentType
        filename
        size
      }
    }
  }
`;

/**
 * Attachment creation mutation to attach uploaded files to issues
 *
 * Creates attachment metadata for an issue using the assetUrl from fileUpload.
 * This is step 3 of the three-step upload process.
 *
 * @see {@link https://linear.app/docs/graphql/mutations#attachmentCreate}
 */
export const ATTACHMENT_CREATE_MUTATION = `
  mutation AttachmentCreate(
    $issueId: String!
    $title: String!
    $url: String!
    $subtitle: String
    $metadata: JSONObject
  ) {
    attachmentCreate(
      input: {
        issueId: $issueId
        title: $title
        url: $url
        subtitle: $subtitle
        metadata: $metadata
      }
    ) {
      success
      lastSyncId
      attachment {
        id
        url
        title
        subtitle
        metadata
        createdAt
      }
    }
  }
`;
