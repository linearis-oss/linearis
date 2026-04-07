import { LinearClient } from "@linear/sdk";
import { CommandOptions, getApiToken } from "./auth.js";
import {
  CreateCommentArgs,
  LinearComment,
  LinearIssue,
  LinearLabel,
  LinearProject,
} from "./linear-types.js";
import { isUuid } from "./uuid.js";
import { parseIssueIdentifier } from "./identifier-parser.js";
import { multipleMatchesError, notFoundError } from "./error-messages.js";

// Default pagination limit for Linear SDK queries to avoid complexity errors
const DEFAULT_CYCLE_PAGINATION_LIMIT = 250;

/**
 * Generic ID resolver that handles UUID validation and passthrough
 *
 * @param input - Input string that may be a UUID or identifier
 * @returns UUID as-is, or original string for non-UUID inputs
 */
function resolveId(input: string): string {
  if (isUuid(input)) {
    return input;
  }
  // Return as-is for non-UUID inputs that need further resolution
  return input;
}

/**
 * Build common GraphQL filter for name/key equality searches
 *
 * @param field - GraphQL field name
 * @param value - Value to match exactly
 * @returns GraphQL filter object
 */
function buildEqualityFilter(field: string, value: string): any {
  return {
    [field]: { eq: value },
  };
}

/**
 * Execute a Linear client query and handle "not found" errors consistently
 *
 * @param queryFn - Function that returns a promise with nodes array
 * @param entityName - Human-readable entity name for error messages
 * @param identifier - The identifier used in the query
 * @returns The first node from the result
 * @throws Error if no nodes are found
 */
async function executeLinearQuery<T>(
  queryFn: () => Promise<{ nodes: T[] }>,
  entityName: string,
  identifier: string,
): Promise<T> {
  const result = await queryFn();
  if (result.nodes.length === 0) {
    throw new Error(`${entityName} "${identifier}" not found`);
  }
  return result.nodes[0];
}

/**
 * Linear SDK service with smart ID resolution and optimized operations
 *
 * Provides fallback operations and comprehensive ID resolution for Linear entities.
 * This service handles human-friendly identifiers (TEAM-123, project names, etc.)
 * and resolves them to Linear UUIDs for API operations.
 *
 * Features:
 * - Smart ID resolution for teams, projects, labels, and issues
 * - Fallback operations when GraphQL optimizations aren't available
 * - Consistent error handling and messaging
 * - Batch operations where possible
 */
export class LinearService {
  private client: LinearClient;

  /**
   * Initialize Linear service with authentication
   *
   * @param apiToken - Linear API token for authentication
   */
  constructor(apiToken: string) {
    this.client = new LinearClient({ apiKey: apiToken });
  }

  /**
   * Resolve issue identifier to UUID (lightweight version for ID-only resolution)
   *
   * @param issueId - Either a UUID string or TEAM-123 format identifier
   * @returns The resolved UUID string
   * @throws Error if the issue identifier format is invalid or issue not found
   *
   * @example
   * ```typescript
   * // Using UUID
   * const uuid1 = await resolveIssueId("123e4567-e89b-12d3-a456-426614174000");
   *
   * // Using TEAM-123 format
   * const uuid2 = await resolveIssueId("ABC-123");
   * ```
   */
  async resolveIssueId(issueId: string): Promise<string> {
    // Return UUID as-is
    if (isUuid(issueId)) {
      return issueId;
    }

    // Parse identifier (ABC-123 format) and resolve to UUID
    const { teamKey, issueNumber } = parseIssueIdentifier(issueId);

    const issues = await this.client.issues({
      filter: {
        number: { eq: issueNumber },
        team: { key: { eq: teamKey } },
      },
      first: 1,
    });

    if (issues.nodes.length === 0) {
      throw new Error(`Issue with identifier "${issueId}" not found`);
    }

    return issues.nodes[0].id;
  }

  /**
   * Get all teams in the workspace
   *
   * @returns Array of teams with id, key, name, and description
   */
  async getTeams(): Promise<any[]> {
    const teamsConnection = await this.client.teams({
      first: 100,
    });

    // Sort by name client-side since Linear API doesn't support orderBy: "name"
    const teams = teamsConnection.nodes.map((team) => ({
      id: team.id,
      key: team.key,
      name: team.name,
      description: team.description || null,
    }));

    return teams.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get all users in the workspace
   *
   * @param activeOnly - If true, return only active users
   * @returns Array of users with id, name, displayName, email, and active status
   */
  async getUsers(activeOnly?: boolean): Promise<any[]> {
    const filter: any = {};

    if (activeOnly) {
      filter.active = { eq: true };
    }

    const usersConnection = await this.client.users({
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      first: 100,
    });

    // Sort by name client-side since Linear API doesn't support orderBy: "name"
    const users = usersConnection.nodes.map((user) => ({
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      active: user.active,
    }));

    return users.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get all projects
   */
  async getProjects(): Promise<LinearProject[]> {
    const projects = await this.client.projects({
      first: 100,
      orderBy: "updatedAt" as any,
      includeArchived: false,
    });

    // Fetch all relationships in parallel for all projects
    const projectsWithData = await Promise.all(
      projects.nodes.map(async (project) => {
        const [teams, lead] = await Promise.all([
          project.teams(),
          project.lead,
        ]);
        return { project, teams, lead };
      }),
    );

    return projectsWithData.map(({ project, teams, lead }) => ({
      id: project.id,
      name: project.name,
      description: project.description || undefined,
      state: project.state,
      progress: project.progress,
      teams: teams.nodes.map((team: any) => ({
        id: team.id,
        key: team.key,
        name: team.name,
      })),
      lead: lead
        ? {
          id: lead.id,
          name: lead.name,
        }
        : undefined,
      // Convert date objects to ISO 8601 strings for JSON serialization
      targetDate: project.targetDate
        ? new Date(project.targetDate).toISOString()
        : undefined,
      createdAt: project.createdAt
        ? new Date(project.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: project.updatedAt
        ? new Date(project.updatedAt).toISOString()
        : new Date().toISOString(),
    }));
  }

  /**
   * Resolve team key or name to team ID
   */
  async resolveTeamId(teamKeyOrNameOrId: string): Promise<string> {
    // Use generic ID resolver
    const resolved = resolveId(teamKeyOrNameOrId);
    if (resolved === teamKeyOrNameOrId && isUuid(teamKeyOrNameOrId)) {
      return teamKeyOrNameOrId;
    }

    // Try to find by key first (like "ABC"), then by name
    try {
      const team = await executeLinearQuery(
        () =>
          this.client.teams({
            filter: buildEqualityFilter("key", teamKeyOrNameOrId),
            first: 1,
          }),
        "Team",
        teamKeyOrNameOrId,
      );
      return team.id;
    } catch (_error) {
      // Not every caller passes a team key; fall back to an exact name lookup.
      const team = await executeLinearQuery(
        () =>
          this.client.teams({
            filter: buildEqualityFilter("name", teamKeyOrNameOrId),
            first: 1,
          }),
        "Team",
        teamKeyOrNameOrId,
      );
      return team.id;
    }
  }

  /**
   * Resolve status name to status ID for a specific team
   */
  async resolveStatusId(statusName: string, teamId?: string): Promise<string> {
    // Return UUID as-is
    if (isUuid(statusName)) {
      return statusName;
    }

    // Build filter for workflow states
    const filter: any = {
      name: { eqIgnoreCase: statusName },
    };

    // If teamId is provided, filter by team
    if (teamId) {
      filter.team = { id: { eq: teamId } };
    }

    const statuses = await this.client.workflowStates({
      filter,
      first: 1,
    });

    if (statuses.nodes.length === 0) {
      const context = teamId ? ` for team ${teamId}` : "";
      throw new Error(`Status "${statusName}"${context} not found`);
    }

    return statuses.nodes[0].id;
  }

  /**
   * Get all labels (workspace and team-specific)
   */
  async getLabels(teamFilter?: string): Promise<{ labels: LinearLabel[] }> {
    const labels: LinearLabel[] = [];

    if (teamFilter) {
      // Get labels for specific team only
      const teamId = await this.resolveTeamId(teamFilter);
      const team = await this.client.team(teamId);
      const teamLabels = await this.client.issueLabels({
        filter: { team: { id: { eq: teamId } } },
        first: 100,
      });

      for (const label of teamLabels.nodes) {
        // Skip group labels (isGroup: true) as they're containers, not actual labels
        if (label.isGroup) {
          continue;
        }

        const parent = await label.parent;

        const labelData: LinearLabel = {
          id: label.id,
          name: label.name,
          color: label.color,
          scope: "team",
          team: {
            id: team.id,
            name: team.name,
          },
        };

        // Add group info if this label has a parent group
        if (parent) {
          // Fetch the parent label details to get the name
          const parentLabel = await this.client.issueLabel(parent.id);
          labelData.group = {
            id: parent.id,
            name: parentLabel.name,
          };
        }

        labels.push(labelData);
      }
    } else {
      // Get all labels (workspace + team labels)
      const allLabels = await this.client.issueLabels({
        first: 100,
      });

      for (const label of allLabels.nodes) {
        // Skip group labels (isGroup: true) as they're containers, not actual labels
        if (label.isGroup) {
          continue;
        }

        const [team, parent] = await Promise.all([
          label.team,
          label.parent,
        ]);

        const labelData: LinearLabel = {
          id: label.id,
          name: label.name,
          color: label.color,
          scope: team ? "team" : "workspace",
        };

        // Add team info if this is a team-specific label
        if (team) {
          labelData.team = {
            id: team.id,
            name: team.name,
          };
        }

        // Add group info if this label has a parent group
        if (parent) {
          // Fetch the parent label details to get the name
          const parentLabel = await this.client.issueLabel(parent.id);
          labelData.group = {
            id: parent.id,
            name: parentLabel.name,
          };
        }

        labels.push(labelData);
      }
    }

    return { labels };
  }

  /**
   * Create comment on issue
   */
  async createComment(args: CreateCommentArgs): Promise<LinearComment> {
    const payload = await this.client.createComment({
      issueId: args.issueId,
      body: args.body,
    });

    if (!payload.success) {
      throw new Error("Failed to create comment");
    }

    // Fetch the created comment to return full data
    const comment = await payload.comment;
    if (!comment) {
      throw new Error("Failed to retrieve created comment");
    }

    const user = await comment.user;
    if (!user) {
      throw new Error("Failed to retrieve comment user information");
    }

    return {
      id: comment.id,
      body: comment.body,
      user: {
        id: user.id,
        name: user.name,
      },
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  /**
   * Get all cycles with automatic pagination
   *
   * @param teamFilter - Optional team key, name, or ID to filter cycles
   * @param activeOnly - If true, return only active cycles
   * @returns Array of cycles with team information
   *
   * @remarks
   * Uses Linear SDK automatic pagination with 250 cycles per request.
   * This method will make multiple API calls if necessary to fetch all
   * matching cycles.
   *
   * For workspaces with hundreds of cycles, consider using team filtering
   * to reduce result set size and improve performance.
   */
  async getCycles(teamFilter?: string, activeOnly?: boolean): Promise<any[]> {
    const filter: any = {};

    if (teamFilter) {
      const teamId = await this.resolveTeamId(teamFilter);
      filter.team = { id: { eq: teamId } };
    }

    if (activeOnly) {
      filter.isActive = { eq: true };
    }

    const cyclesConnection = await this.client.cycles({
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      orderBy: "createdAt" as any,
      first: DEFAULT_CYCLE_PAGINATION_LIMIT,
    });

    // Fetch all relationships in parallel for all cycles
    // Note: Uses Promise.all - entire operation fails if any team fetch fails.
    // This ensures data consistency (all cycles have team data or none do).
    // If partial failures are acceptable, use Promise.allSettled instead.
    const cyclesWithData = await Promise.all(
      cyclesConnection.nodes.map(async (cycle) => {
        const team = await cycle.team;
        return {
          id: cycle.id,
          name: cycle.name,
          number: cycle.number,
          // Convert date objects to ISO 8601 strings for JSON serialization
          startsAt: cycle.startsAt
            ? new Date(cycle.startsAt).toISOString()
            : undefined,
          endsAt: cycle.endsAt
            ? new Date(cycle.endsAt).toISOString()
            : undefined,
          isActive: cycle.isActive,
          isPrevious: cycle.isPrevious,
          isNext: cycle.isNext,
          progress: cycle.progress,
          issueCountHistory: cycle.issueCountHistory,
          team: team
            ? {
              id: team.id,
              key: team.key,
              name: team.name,
            }
            : undefined,
        };
      }),
    );

    return cyclesWithData;
  }

  /**
   * Get single cycle by ID with issues
   *
   * @param cycleId - Cycle UUID
   * @param issuesLimit - Maximum issues to fetch (default 50)
   * @returns Cycle with issues
   *
   * @remarks
   * This method does not paginate issues. If a cycle has more issues than
   * the limit, only the first N will be returned sorted by creation date.
   *
   * Linear API limits single requests to 250 items. Values above 250 may
   * result in errors or truncation.
   *
   * To get all issues in a large cycle, either:
   * 1. Increase the limit (up to 250)
   * 2. Fetch issues separately using the issues API with pagination
   * 3. Make multiple requests with cursor-based pagination
   */
  async getCycleById(cycleId: string, issuesLimit: number = 50): Promise<any> {
    const cycle = await this.client.cycle(cycleId);

    const [team, issuesConnection] = await Promise.all([
      cycle.team,
      cycle.issues({ first: issuesLimit }),
    ]);

    const issues = [];
    for (const issue of issuesConnection.nodes) {
      const [state, assignee, issueTeam, project, labels] = await Promise.all([
        issue.state,
        issue.assignee,
        issue.team,
        issue.project,
        issue.labels(),
      ]);

      issues.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description || undefined,
        priority: issue.priority,
        estimate: issue.estimate || undefined,
        state: state ? { id: state.id, name: state.name } : undefined,
        assignee: assignee
          ? { id: assignee.id, name: assignee.name }
          : undefined,
        team: issueTeam
          ? { id: issueTeam.id, key: issueTeam.key, name: issueTeam.name }
          : undefined,
        project: project ? { id: project.id, name: project.name } : undefined,
        labels: labels.nodes.map((label: any) => ({
          id: label.id,
          name: label.name,
        })),
        createdAt: issue.createdAt
          ? new Date(issue.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: issue.updatedAt
          ? new Date(issue.updatedAt).toISOString()
          : new Date().toISOString(),
      });
    }

    return {
      id: cycle.id,
      name: cycle.name,
      number: cycle.number,
      // Convert date objects to ISO 8601 strings for JSON serialization
      startsAt: cycle.startsAt
        ? new Date(cycle.startsAt).toISOString()
        : undefined,
      endsAt: cycle.endsAt ? new Date(cycle.endsAt).toISOString() : undefined,
      isActive: cycle.isActive,
      progress: cycle.progress,
      issueCountHistory: cycle.issueCountHistory,
      team: team
        ? {
          id: team.id,
          key: team.key,
          name: team.name,
        }
        : undefined,
      issues,
    };
  }

  /**
   * Resolve cycle by name or ID
   */
  async resolveCycleId(
    cycleNameOrId: string,
    teamFilter?: string,
  ): Promise<string> {
    // Return UUID as-is
    if (isUuid(cycleNameOrId)) {
      return cycleNameOrId;
    }

    // Build filter for name-based lookup
    const filter: any = {
      name: { eq: cycleNameOrId },
    };

    // If teamId is provided, filter by team
    if (teamFilter) {
      const teamId = await this.resolveTeamId(teamFilter);
      filter.team = { id: { eq: teamId } };
    }

    const cyclesConnection = await this.client.cycles({
      filter,
      first: 10,
    });

    const cyclesData = cyclesConnection.nodes;

    const nodes = [];
    for (const cycle of cyclesData) {
      const team = await cycle.team;
      nodes.push({
        id: cycle.id,
        name: cycle.name,
        number: cycle.number,
        startsAt: cycle.startsAt
          ? new Date(cycle.startsAt).toISOString()
          : undefined,
        isActive: cycle.isActive,
        isNext: cycle.isNext,
        isPrevious: cycle.isPrevious,
        team: team
          ? { id: team.id, key: team.key, name: team.name }
          : undefined,
      });
    }

    if (nodes.length === 0) {
      throw notFoundError(
        "Cycle",
        cycleNameOrId,
        teamFilter ? `for team ${teamFilter}` : undefined,
      );
    }

    // Disambiguate: prefer active, then next, then previous
    let chosen = nodes.find((n: any) => n.isActive);
    if (!chosen) chosen = nodes.find((n: any) => n.isNext);
    if (!chosen) chosen = nodes.find((n: any) => n.isPrevious);
    if (!chosen && nodes.length === 1) chosen = nodes[0];

    if (!chosen) {
      const matches = nodes.map((n: any) =>
        `${n.id} (${n.team?.key || "?"} / #${n.number} / ${n.startsAt})`
      );
      throw multipleMatchesError(
        "cycle",
        cycleNameOrId,
        matches,
        "use an ID or scope with --team",
      );
    }

    return chosen.id;
  }

  /**
   * Resolve project identifier to UUID
   *
   * @param projectNameOrId - Project name or UUID
   * @returns Project UUID
   * @throws Error if project not found
   */
  async resolveProjectId(projectNameOrId: string): Promise<string> {
    if (isUuid(projectNameOrId)) {
      return projectNameOrId;
    }

    // Use case-insensitive matching for better UX
    const filter = { name: { eqIgnoreCase: projectNameOrId } };
    const projectsConnection = await this.client.projects({ filter, first: 1 });

    if (projectsConnection.nodes.length === 0) {
      throw new Error(`Project "${projectNameOrId}" not found`);
    }

    return projectsConnection.nodes[0].id;
  }
}

/**
 * Create LinearService instance with authentication
 */
export async function createLinearService(
  options: CommandOptions,
): Promise<LinearService> {
  const apiToken = await getApiToken(options);
  return new LinearService(apiToken);
}
