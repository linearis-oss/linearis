import { GraphQLService } from "./graphql-service.js";
import { LinearService } from "./linear-service.js";
import {
  CREATE_PROJECT_MUTATION,
  LIST_PROJECTS_QUERY,
} from "../queries/projects.js";
import { LinearProject, ProjectCreateArgs } from "./linear-types.js";

/**
 * Raw project response from GraphQL API
 * Transforms to LinearProject format
 */
interface GraphQLProjectResponse {
  id: string;
  name: string;
  description?: string;
  state: string;
  progress: number;
  teams: {
    nodes: Array<{
      id: string;
      key: string;
      name: string;
    }>;
  };
  lead?: {
    id: string;
    name: string;
  };
  targetDate?: string;
  startDate?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GraphQL-optimized projects service
 *
 * Provides create and list operations using optimized GraphQL queries.
 * Uses smart ID resolution for teams and leads.
 */
export class GraphQLProjectsService {
  constructor(
    private graphqlService: GraphQLService,
    private linearService: LinearService,
  ) {}

  /**
   * Transform GraphQL response to LinearProject format
   */
  private transformProject(project: GraphQLProjectResponse): LinearProject {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      state: project.state,
      progress: project.progress,
      teams: project.teams.nodes,
      lead: project.lead,
      targetDate: project.targetDate,
      startDate: project.startDate,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  /**
   * Resolve team identifiers to UUIDs
   *
   * Accepts team keys (e.g., "ENG"), names (e.g., "Engineering"), or UUIDs.
   * Returns array of resolved team UUIDs.
   */
  private async resolveTeamIds(teamIds: string[]): Promise<string[]> {
    const resolvedIds: string[] = [];

    for (const teamId of teamIds) {
      // If it looks like a UUID, use it directly
      if (this.isUUID(teamId)) {
        resolvedIds.push(teamId);
      } else {
        // Resolve team by key or name
        const resolved = await this.linearService.resolveTeamId(teamId);
        if (!resolved) {
          throw new Error(`Team not found: "${teamId}"`);
        }
        resolvedIds.push(resolved);
      }
    }

    return resolvedIds;
  }

  /**
   * Validate user ID is a UUID
   *
   * Linear API requires UUID for leadId - no name resolution available.
   */
  private validateUserId(userId: string): string {
    if (!this.isUUID(userId)) {
      throw new Error(
        `Lead ID must be a UUID (got "${userId}"). Use 'linearis users list' to find user UUIDs.`,
      );
    }
    return userId;
  }

  /**
   * Check if string is a UUID
   */
  private isUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      str,
    );
  }

  /**
   * Create a new project
   *
   * @param args Project creation arguments with human-friendly identifiers
   * @returns Created project with all fields
   */
  async createProject(args: ProjectCreateArgs): Promise<LinearProject> {
    // Resolve team IDs
    const resolvedTeamIds = await this.resolveTeamIds(args.teamIds);

    // Validate lead ID if provided (must be UUID)
    const validatedLeadId = args.leadId
      ? this.validateUserId(args.leadId)
      : undefined;

    // Build the GraphQL input
    const input: Record<string, unknown> = {
      name: args.name,
      teamIds: resolvedTeamIds,
    };

    if (args.description !== undefined) input.description = args.description;
    if (args.color !== undefined) input.color = args.color;
    if (args.icon !== undefined) input.icon = args.icon;
    if (validatedLeadId !== undefined) input.leadId = validatedLeadId;
    if (args.targetDate !== undefined) input.targetDate = args.targetDate;
    if (args.startDate !== undefined) input.startDate = args.startDate;
    if (args.state !== undefined) input.state = args.state;

    const result = await this.graphqlService.rawRequest<{
      projectCreate: { success: boolean; project: GraphQLProjectResponse };
    }>(CREATE_PROJECT_MUTATION, { input });

    if (!result.projectCreate.success) {
      throw new Error(`Failed to create project "${args.name}"`);
    }

    return this.transformProject(result.projectCreate.project);
  }

  /**
   * List projects with optional filtering
   *
   * @param options Filter and pagination options
   * @returns Array of projects
   */
  async listProjects(options?: {
    teamId?: string;
    limit?: number;
  }): Promise<LinearProject[]> {
    const filter: Record<string, unknown> = {};

    if (options?.teamId) {
      const resolvedTeamId = this.isUUID(options.teamId)
        ? options.teamId
        : await this.linearService.resolveTeamId(options.teamId);

      if (!resolvedTeamId) {
        throw new Error(`Team not found: "${options.teamId}"`);
      }

      filter.accessibleTeams = { some: { id: { eq: resolvedTeamId } } };
    }

    const result = await this.graphqlService.rawRequest<{
      projects: { nodes: GraphQLProjectResponse[] };
    }>(LIST_PROJECTS_QUERY, {
      first: options?.limit || 100,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });

    return result.projects.nodes.map((p) => this.transformProject(p));
  }
}
