import { print } from "graphql";
import { GraphQLService } from "./graphql-service.js";
import { LinearService } from "./linear-service.js";
import { extractEmbeds } from "./embed-parser.js";
import { isUuid } from "./uuid.js";
import {
  parseIssueIdentifier,
  tryParseIssueIdentifier,
} from "./identifier-parser.js";
import { BatchResolveForCreateDocument, BatchResolveForCreateQuery, BatchResolveForUpdateDocument, BatchResolveForUpdateQuery, CreateIssueDocument, CreateIssueMutation, FindCycleGlobalDocument, FindCycleGlobalQuery, FindCycleScopedDocument, FindCycleScopedQuery, GetIssueByIdDocument, GetIssueByIdentifierDocument, GetIssueByIdentifierQuery, GetIssueByIdQuery, GetIssuesDocument, GetIssuesQuery, GetIssueTeamDocument, GetIssueTeamQuery, IssueCreateInput, IssueUpdateInput, QuerySearchIssuesArgs, SearchIssuesQuery, SearchIssuesQueryVariables, UpdateIssueDocument, UpdateIssueMutation, UpdateIssueMutationVariables } from "../gql/graphql.js";

// Type aliases for cleaner method signatures
type IssueFromId = NonNullable<GetIssueByIdQuery["issue"]>;
type IssueFromIdentifier = GetIssueByIdentifierQuery["issues"]["nodes"][0];
type IssueFromSearch = SearchIssuesQuery["searchIssues"]["nodes"][0];
type IssueFromList = GetIssuesQuery["issues"]["nodes"][0];
type IssueFromUpdate = NonNullable<UpdateIssueMutation["issueUpdate"]["issue"]>;
type IssueFromCreate = NonNullable<CreateIssueMutation["issueCreate"]["issue"]>;

/**
 * GraphQL-optimized issues service for single API call operations
 */
export class GraphQLIssuesService {
  constructor(
    private graphQLService: GraphQLService,
    private linearService: LinearService
  ) {}

  /**
   * Get issues list with all relationships in single query
   * Reduces from 1 + (5 × N issues) API calls to 1 API call
   */
  async getIssues(limit: number = 25): Promise<IssueFromList[]> {
    const result = await this.graphQLService.rawRequest<GetIssuesQuery>(
      print(GetIssuesDocument),
      {
        first: limit,
        orderBy: "updatedAt" as any,
      }
    );

    return result.issues?.nodes ?? [];
  }

  /**
   * Get issue by ID with all relationships and comments in single query
   * Reduces from 7 API calls to 1 API call
   *
   * @param id - Either a UUID string or TEAM-123 format identifier
   * @returns Complete issue data with all relationships resolved
   * @throws Error if issue is not found
   *
   * @example
   * ```typescript
   * // Using UUID
   * const issue1 = await getIssueById("123e4567-e89b-12d3-a456-426614174000");
   *
   * // Using TEAM-123 format
   * const issue2 = await getIssueById("ABC-123");
   * ```
   */
  async getIssueById(id: string): Promise<IssueFromId | IssueFromIdentifier> {
    let issueData: IssueFromId | IssueFromIdentifier;

    if (isUuid(id)) {
      const result = await this.graphQLService.rawRequest<GetIssueByIdQuery>(
        print(GetIssueByIdDocument),
        { id: id }
      );

      if (!result.issue) {
        throw new Error(`Issue with ID "${id}" not found`);
      }
      issueData = result.issue;
    } else {
      const { teamKey, issueNumber } = parseIssueIdentifier(id);

      const result = await this.graphQLService.rawRequest<GetIssueByIdentifierQuery>(
        print(GetIssueByIdentifierDocument),
        { teamKey, number: issueNumber }
      );

      if (!result.issues.nodes.length) {
        throw new Error(`Issue with identifier "${id}" not found`);
      }
      issueData = result.issues.nodes[0];
    }

    return issueData;
  }

  /**
   * Update issue with all relationships in optimized GraphQL queries
   * Reduces from 5 API calls to 2 API calls (resolve + update)
   *
   * @param input Update arguments (supports label names and handles adding vs overwriting modes)
   * @param labelMode How to handle labels: 'adding' (merge with existing) or 'overwriting' (replace all)
   * @returns Updated issue with all relationships resolved
   *
   * @example
   * ```typescript
   * const updatedIssue = await updateIssue(
   *   {
   *     id: "ABC-123",
   *     title: "New Title",
   *     labels: ["Bug", "High Priority"]
   *   },
   *   "adding"
   * );
   * ```
   */
  async updateIssue(
    input: IssueUpdateInput & {
      id: string;
      labelMode?: "adding" | "overwriting";
    }
  ): Promise<IssueFromUpdate> {
    let resolvedIssueId = input.id;
    let currentIssueLabels: string[] = [];
    const labelMode = input.labelMode ?? "overwriting";

    // Step 1: Batch resolve all IDs and get current issue data if needed
    const resolveVariables: any = {};

    // Parse issue ID if it's an identifier
    if (!isUuid(resolvedIssueId)) {
      const { teamKey, issueNumber } = parseIssueIdentifier(resolvedIssueId);
      resolveVariables.teamKey = teamKey;
      resolveVariables.issueNumber = issueNumber;
    }

    // Add label names for resolution if provided
    if (input.labelIds && Array.isArray(input.labelIds)) {
      // Filter out UUIDs and collect label names for resolution
      const labelNames = input.labelIds.filter((id) => !isUuid(id));
      if (labelNames.length > 0) {
        resolveVariables.labelNames = labelNames;
      }
    }

    // Add project name for resolution if provided and not a UUID
    if (input.projectId && !isUuid(input.projectId)) {
      resolveVariables.projectName = input.projectId;
    }

    // Add milestone name for resolution if provided and not a UUID
    if (
      input.projectMilestoneId &&
      typeof input.projectMilestoneId === "string" &&
      !isUuid(input.projectMilestoneId)
    ) {
      resolveVariables.milestoneName = input.projectMilestoneId;
    }

    // Execute batch resolve query
    //
    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (BatchResolveForUpdateDocument) with the appropriate return type parameter.
    const resolveResult = await this.graphQLService.rawRequest<BatchResolveForUpdateQuery>(
      print(BatchResolveForUpdateDocument),
      resolveVariables
    );

    // Process resolution results
    if (!isUuid(id)) {
      if (!resolveResult.issues.nodes.length) {
        throw new Error(`Issue with identifier "${id}" not found`);
      }
      resolvedIssueId = resolveResult.issues.nodes[0].id;
      currentIssueLabels = resolveResult.issues.nodes[0].labels.nodes.map(
        (l: any) => l.id
      );
    }

    // Resolve label IDs
    let finalLabelIds = input.labelIds;
    if (input.labelIds && Array.isArray(input.labelIds)) {
      const resolvedLabels: string[] = [];

      // Process each label ID/name
      for (const labelIdOrName of input.labelIds) {
        if (isUuid(labelIdOrName)) {
          resolvedLabels.push(labelIdOrName);
        } else {
          // Find resolved label
          const label = resolveResult.labels.nodes.find(
            (l: any) => l.name === labelIdOrName
          );
          if (!label) {
            throw new Error(`Label "${labelIdOrName}" not found`);
          }
          resolvedLabels.push(label.id);
        }
      }

      // Handle adding vs overwriting modes
      if (labelMode === "adding") {
        // Merge with current labels (if we have them)
        finalLabelIds = [
          ...new Set([...currentIssueLabels, ...resolvedLabels]),
        ];
      } else {
        // Overwrite mode - replace all existing labels
        finalLabelIds = resolvedLabels;
      }
    }

    // Resolve project ID
    let finalProjectId = input.projectId;
    if (input.projectId && !isUuid(input.projectId)) {
      if (!resolveResult.projects.nodes.length) {
        throw new Error(`Project "${input.projectId}" not found`);
      }
      finalProjectId = resolveResult.projects.nodes[0].id;
    }

    // Resolve milestone ID if provided and not a UUID
    let finalMilestoneId = input.projectMilestoneId;
    if (
      input.projectMilestoneId &&
      typeof input.projectMilestoneId === "string" &&
      !isUuid(input.projectMilestoneId)
    ) {
      // First try to find milestone in project being set (if --project is provided)
      // IMPORTANT: Only check resolveResult.projects if we actually asked for a project
      // (the batch query may return unrelated project data when projectName is undefined)
      if (
        input.projectId &&
        resolveResult.projects?.nodes[0]?.projectMilestones?.nodes
      ) {
        const projectMilestone =
          resolveResult.projects.nodes[0].projectMilestones.nodes.find(
            (m: any) => m.name === input.projectMilestoneId
          );
        if (projectMilestone) {
          finalMilestoneId = projectMilestone.id;
        }
      }

      // If not found in project being set, try the issue's current project
      if (
        finalMilestoneId &&
        !isUuid(finalMilestoneId) &&
        resolveResult.issues?.nodes[0]?.project?.projectMilestones?.nodes
      ) {
        const issueMilestone =
          resolveResult.issues.nodes[0].project.projectMilestones.nodes.find(
            (m: any) => m.name === input.projectMilestoneId
          );
        if (issueMilestone) {
          finalMilestoneId = issueMilestone.id;
        }
      }

      // If still not found, try global milestone lookup (may be ambiguous)
      if (
        finalMilestoneId &&
        !isUuid(finalMilestoneId) &&
        resolveResult.milestones?.nodes?.length
      ) {
        finalMilestoneId = resolveResult.milestones.nodes[0].id;
      }

      if (!finalMilestoneId || !isUuid(finalMilestoneId)) {
        throw new Error(`Milestone "${input.projectMilestoneId}" not found`);
      }
    }

    // Resolve cycle ID if provided (supports name resolution scoped to the issue's team)
    let finalCycleId = input.cycleId;
    if (input.cycleId !== undefined && input.cycleId !== null) {
      if (input.cycleId === null) {
        finalCycleId = null; // explicit clear
      } else if (typeof input.cycleId === "string" && !isUuid(input.cycleId)) {
        // Try to get team context from resolved issue (if available)
        let teamIdForCycle: string | undefined =
          resolveResult.issues?.nodes?.[0]?.team?.id;

        // If we don't have team from batch result but we have resolvedIssueId, fetch issue team
        if (!teamIdForCycle && resolvedIssueId && isUuid(resolvedIssueId)) {
          // * NOTE: We must enforce the return type here and ensure it matches the query document,
          // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
          // * (GetIssueTeamDocument) with the appropriate return type parameter.
          const issueTeamRes = await this.graphQLService.rawRequest<GetIssueTeamQuery>(
            print(GetIssueTeamDocument),
            { issueId: resolvedIssueId }
          );
          teamIdForCycle = issueTeamRes.issue?.team?.id;
        }

        // Try scoped lookup by team first
        if (teamIdForCycle) {
          // * NOTE: We must enforce the return type here and ensure it matches the query document,
          // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
          // * (FindCycleScopedDocument) with the appropriate return type parameter.
          const scopedRes = await this.graphQLService.rawRequest<FindCycleScopedQuery>(
            print(FindCycleScopedDocument),
            { name: input.cycleId, teamId: teamIdForCycle }
          );
          const scopedNodes = scopedRes.cycles?.nodes || [];
          if (scopedNodes.length === 1) {
            finalCycleId = scopedNodes[0].id;
          } else if (scopedNodes.length > 1) {
            // prefer active, next, previous
            let chosen =
              scopedNodes.find((n: any) => n.isActive) ||
              scopedNodes.find((n: any) => n.isNext) ||
              scopedNodes.find((n: any) => n.isPrevious);
            if (chosen) finalCycleId = chosen.id;
            else {
              throw new Error(
                `Ambiguous cycle name "${input.cycleId}" for team ${teamIdForCycle}. Use ID or disambiguate.`
              );
            }
          }
        }

        // Fallback to global lookup by name
        if (!finalCycleId) {
          // * NOTE: We must enforce the return type here and ensure it matches the query document,
          // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
          // * (FindCycleGlobalDocument) with the appropriate return type parameter.
          const globalRes = await this.graphQLService.rawRequest<FindCycleGlobalQuery>(
            print(FindCycleGlobalDocument),
            { name: input.cycleId }
          );
          const globalNodes = globalRes.cycles?.nodes || [];
          if (globalNodes.length === 1) {
            finalCycleId = globalNodes[0].id;
          } else if (globalNodes.length > 1) {
            let chosen =
              globalNodes.find((n: any) => n.isActive) ||
              globalNodes.find((n: any) => n.isNext) ||
              globalNodes.find((n: any) => n.isPrevious);
            if (chosen) finalCycleId = chosen.id;
            else {
              throw new Error(
                `Ambiguous cycle name "${input.cycleId}" — multiple matches found across teams. Use ID or scope with team.`
              );
            }
          }
        }

        if (!finalCycleId) {
          throw new Error(`Cycle "${input.cycleId}" not found`);
        }
      }
    }

    // Resolve status ID if provided and not a UUID
    let resolvedStatusId = input.stateId;
    if (input.stateId && !isUuid(input.stateId)) {
      // Get team ID from the issue for status context
      let teamId: string | undefined;
      if (resolvedIssueId && isUuid(resolvedIssueId)) {
        // We have the resolved issue ID, get the team context
        //
        // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
        // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
        // * (GetIssueTeamDocument) with the appropriate return type parameter.
        const issueResult = await this.graphQLService.rawRequest<GetIssueTeamQuery>(
          print(GetIssueTeamDocument),
          { issueId: resolvedIssueId }
        );
        teamId = issueResult.issue?.team?.id;
      }
      resolvedStatusId = await this.linearService.resolveStatusId(
        input.stateId,
        teamId
      );
    }

    // Step 2: Execute update mutation with resolved IDs
    const updateInput: any = {};

    if (input.title !== undefined) updateInput.title = input.title;
    if (input.description !== undefined) {
      updateInput.description = input.description;
    }
    if (resolvedStatusId !== undefined) updateInput.stateId = resolvedStatusId;
    if (input.priority !== undefined) updateInput.priority = input.priority;
    if (input.assigneeId !== undefined) {
      updateInput.assigneeId = input.assigneeId;
    }
    if (finalProjectId !== undefined) updateInput.projectId = finalProjectId;
    if (finalCycleId !== undefined) updateInput.cycleId = finalCycleId;
    if (input.estimate !== undefined) updateInput.estimate = input.estimate;
    if (input.parentId !== undefined) updateInput.parentId = input.parentId;
    if (finalMilestoneId !== undefined) {
      updateInput.projectMilestoneId = finalMilestoneId;
    }
    if (finalLabelIds !== undefined) {
      updateInput.labelIds = finalLabelIds;
    }

    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (UpdateIssueDocument) with the appropriate return type parameter.
    const updateResult = await this.graphQLService.rawRequest<UpdateIssueMutation>(
      print(UpdateIssueDocument),
      {
        id: resolvedIssueId,
        input: updateInput,
      }
    );

    if (!updateResult.issueUpdate.success) {
      throw new Error("Failed to update issue");
    }

    if (!updateResult.issueUpdate.issue) {
      throw new Error("Failed to retrieve updated issue");
    }

    return updateResult.issueUpdate.issue;
  }

  /**
   * Create issue with all relationships in optimized GraphQL queries
   * Reduces from 7+ API calls to 2 API calls (resolve + create)
   *
   * @param input Create arguments (supports team names, project names, label names, parent identifiers)
   */
  async createIssue(input: IssueCreateInput): Promise<IssueFromCreate> {
    // Step 1: Batch resolve all IDs
    const resolveVariables: any = {};

    // Parse team if not a UUID
    if (input.teamId && !isUuid(input.teamId)) {
      // Check if it looks like a team key (short, usually 2-5 chars, alphanumeric)
      const isTeamKey =
        input.teamId.length <= 5 && /^[A-Z0-9]+$/i.test(input.teamId);
      // IMPORTANT: Must explicitly set both teamKey and teamName (one to value, one to null)
      // Linear's GraphQL `or` filter with undefined variables matches incorrectly
      if (isTeamKey) {
        resolveVariables.teamKey = input.teamId;
        resolveVariables.teamName = null;
      } else {
        resolveVariables.teamKey = null;
        resolveVariables.teamName = input.teamId;
      }
    }

    // Add project name for resolution if provided and not a UUID
    if (input.projectId && !isUuid(input.projectId)) {
      resolveVariables.projectName = input.projectId;
    }

    // Add milestone name for resolution if provided and not a UUID
    if (input.projectMilestoneId && !isUuid(input.projectMilestoneId)) {
      resolveVariables.milestoneName = input.projectMilestoneId;
    }

    // Add label names for resolution if provided
    if (input.labelIds && Array.isArray(input.labelIds)) {
      // Filter out UUIDs and collect label names for resolution
      const labelNames = input.labelIds.filter((id) => !isUuid(id));
      if (labelNames.length > 0) {
        resolveVariables.labelNames = labelNames;
      }
    }

    // Parse parent issue identifier if provided
    // Uses tryParseIssueIdentifier to silently handle invalid formats (parent will be ignored)
    if (input.parentId && !isUuid(input.parentId)) {
      const parentParsed = tryParseIssueIdentifier(input.parentId);
      if (parentParsed) {
        resolveVariables.parentTeamKey = parentParsed.teamKey;
        resolveVariables.parentIssueNumber = parentParsed.issueNumber;
      }
    }

    // Execute batch resolve query if we have anything to resolve
    let resolveResult: BatchResolveForCreateQuery = {
      teams: { nodes: [] },
      projects: { nodes: [] },
      labels: { nodes: [] },
      parentIssues: { nodes: [] },
    };

    if (Object.keys(resolveVariables).length > 0) {
      resolveResult = await this.graphQLService.rawRequest<BatchResolveForCreateQuery>(
        print(BatchResolveForCreateDocument),
        resolveVariables
      );
    }

    // Resolve team ID
    let finalTeamId = input.teamId;
    if (input.teamId && !isUuid(input.teamId)) {
      const resolvedTeam = resolveResult.teams?.nodes?.[0];
      // Validate the returned team actually matches the requested identifier
      // (GraphQL `or` filter with undefined variables matches anything)
      if (
        !resolvedTeam ||
        (resolvedTeam.key.toUpperCase() !== input.teamId.toUpperCase() &&
          resolvedTeam.name.toLowerCase() !== input.teamId.toLowerCase())
      ) {
        throw new Error(`Team "${input.teamId}" not found`);
      }
      finalTeamId = resolvedTeam.id;
    } else if (!finalTeamId) {
      // If no team specified, we'll let Linear's default behavior handle it
      // or the API will return an error
    }

    // Resolve project ID
    let finalProjectId = input.projectId;
    if (input.projectId && !isUuid(input.projectId)) {
      if (!resolveResult.projects?.nodes?.length) {
        throw new Error(`Project "${input.projectId}" not found`);
      }
      finalProjectId = resolveResult.projects.nodes[0].id;
    }

    // Resolve label IDs
    let finalLabelIds = input.labelIds;
    if (input.labelIds && Array.isArray(input.labelIds)) {
      const resolvedLabels: string[] = [];

      for (const labelIdOrName of input.labelIds) {
        if (isUuid(labelIdOrName)) {
          resolvedLabels.push(labelIdOrName);
        } else {
          // Find resolved label
          const label = resolveResult.labels?.nodes?.find(
            (l: any) => l.name === labelIdOrName
          );
          if (!label) {
            throw new Error(`Label "${labelIdOrName}" not found`);
          }
          resolvedLabels.push(label.id);
        }
      }

      finalLabelIds = resolvedLabels;
    }

    // Resolve parent ID
    let finalParentId = input.parentId;
    if (input.parentId && !isUuid(input.parentId)) {
      if (!resolveResult.parentIssues?.nodes?.length) {
        throw new Error(`Parent issue "${input.parentId}" not found`);
      }
      finalParentId = resolveResult.parentIssues.nodes[0].id;
    }

    // Resolve milestone ID if provided and not a UUID
    let finalMilestoneId = input.projectMilestoneId;
    if (input.projectMilestoneId && !isUuid(input.projectMilestoneId)) {
      // Try to find milestone in project context (milestones must be in same project as issue)
      if (resolveResult.projects?.nodes[0]?.projectMilestones?.nodes) {
        const projectMilestone =
          resolveResult.projects.nodes[0].projectMilestones.nodes.find(
            (m: any) => m.name === input.projectMilestoneId
          );
        if (projectMilestone) {
          finalMilestoneId = projectMilestone.id;
        }
      }

      // If not found in project context, try global milestone lookup (may fail if wrong project)
      if (!finalMilestoneId && resolveResult.milestones?.nodes?.length) {
        finalMilestoneId = resolveResult.milestones.nodes[0].id;
      }

      if (!finalMilestoneId) {
        const hint = finalProjectId
          ? ` in project`
          : ` (consider specifying --project)`;
        throw new Error(`Milestone "${input.milestoneId}" not found${hint}`);
      }
    }

    // Resolve cycle ID if provided (supports name resolution scoped to team)
    let finalCycleId = input.cycleId;
    if (
      input.cycleId &&
      typeof input.cycleId === "string" &&
      !isUuid(input.cycleId)
    ) {
      // Try scoped lookup within finalTeamId first
      if (finalTeamId) {
        const scopedRes = await this.graphQLService.rawRequest(
          `query FindCycleScoped($name: String!, $teamId: ID!) { cycles(filter: { and: [ { name: { eq: $name } }, { team: { id: { eq: $teamId } } } ] }, first: 1) { nodes { id name } } }`,
          { name: input.cycleId, teamId: finalTeamId }
        );
        if (scopedRes.cycles?.nodes?.length) {
          finalCycleId = scopedRes.cycles.nodes[0].id;
        }
      }

      // Fallback to global lookup by name
      if (!finalCycleId) {
        const globalRes = await this.graphQLService.rawRequest(
          `query FindCycleGlobal($name: String!) { cycles(filter: { name: { eq: $name } }, first: 1) { nodes { id name } } }`,
          { name: input.cycleId }
        );
        if (globalRes.cycles?.nodes?.length) {
          finalCycleId = globalRes.cycles.nodes[0].id;
        }
      }

      if (!finalCycleId) {
        throw new Error(`Cycle "${input.cycleId}" not found`);
      }
    }

    // Resolve status ID if provided and not a UUID
    let resolvedStatusId = input.stateId;
    if (input.stateId && !isUuid(input.stateId)) {
      resolvedStatusId = await this.linearService.resolveStatusId(
        input.stateId,
        finalTeamId
      );
    }

    // Step 2: Execute create mutation with resolved IDs
    const createInput: any = {
      title: input.title,
    };

    if (finalTeamId) createInput.teamId = finalTeamId;
    if (input.description) createInput.description = input.description;
    if (input.assigneeId) createInput.assigneeId = input.assigneeId;
    if (input.priority !== undefined) createInput.priority = input.priority;
    if (finalProjectId) createInput.projectId = finalProjectId;
    if (resolvedStatusId) createInput.stateId = resolvedStatusId;
    if (finalLabelIds && finalLabelIds.length > 0) {
      createInput.labelIds = finalLabelIds;
    }
    if (input.estimate !== undefined) createInput.estimate = input.estimate;
    if (finalParentId) createInput.parentId = finalParentId;
    if (finalMilestoneId) createInput.projectMilestoneId = finalMilestoneId;
    if (finalCycleId) createInput.cycleId = finalCycleId;

    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (CreateIssueDocument) with the appropriate return type parameter.
    const createResult = await this.graphQLService.rawRequest<CreateIssueMutation>(
      print(CreateIssueDocument),
      {
        input: createInput,
      }
    );

    if (!createResult.issueCreate.success) {
      throw new Error("Failed to create issue");
    }

    if (!createResult.issueCreate.issue) {
      throw new Error("Failed to retrieve created issue");
    }

    return createResult.issueCreate.issue;
  }

  /**
   * Search issues with all relationships in optimized GraphQL queries
   * Reduces from 1 + (6 × N) API calls to 1-2 API calls total
   *
   * @param input Search arguments with optional filters
   */
  async searchIssues(input: SearchIssuesQuery): Promise<SearchIssuesQuery["searchIssues"]["nodes"]> {
    // Step 1: Resolve filter IDs if needed
    const resolveVariables: any = {};
    let needsResolve = false;

    // Parse team if not a UUID
    if (input.teamId && !isUuid(input.teamId)) {
      needsResolve = true;
      // Check if it looks like a team key (short, usually 2-5 chars, alphanumeric)
      // IMPORTANT: Must explicitly set both teamKey and teamName (one to value, one to null)
      // Linear's GraphQL `or` filter with undefined variables matches incorrectly
      if (input.teamId.length <= 5 && /^[A-Z0-9]+$/i.test(input.teamId)) {
        resolveVariables.teamKey = input.teamId;
        resolveVariables.teamName = null;
      } else {
        resolveVariables.teamKey = null;
        resolveVariables.teamName = input.teamId;
      }
    }

    // Add project name for resolution if provided and not a UUID
    if (input.projectId && !isUuid(input.projectId)) {
      needsResolve = true;
      resolveVariables.projectName = input.projectId;
    }

    // Add assignee email for resolution if provided and not a UUID
    if (input.assigneeId && !isUuid(input.assigneeId)) {
      needsResolve = true;
      // Assume it's an email if it contains @
      if (input.assigneeId.includes("@")) {
        resolveVariables.assigneeEmail = input.assigneeId;
      }
    }

    // Execute batch resolve query if we have anything to resolve
    let resolveResult: any = {};
    if (needsResolve) {
      resolveResult = await this.graphQLService.rawRequest(
        BATCH_RESOLVE_FOR_SEARCH_QUERY,
        resolveVariables
      );
    }

    // Resolve filter IDs
    let finalTeamId = input.teamId;
    if (input.teamId && !isUuid(input.teamId)) {
      const resolvedTeam = resolveResult.teams?.nodes?.[0];
      // Validate the returned team actually matches the requested identifier
      // (GraphQL `or` filter with undefined variables matches anything)
      if (
        !resolvedTeam ||
        (resolvedTeam.key.toUpperCase() !== input.teamId.toUpperCase() &&
          resolvedTeam.name.toLowerCase() !== input.teamId.toLowerCase())
      ) {
        throw new Error(`Team "${input.teamId}" not found`);
      }
      finalTeamId = resolvedTeam.id;
    }

    let finalProjectId = input.projectId;
    if (input.projectId && !isUuid(input.projectId)) {
      if (!resolveResult.projects?.nodes?.length) {
        throw new Error(`Project "${input.projectId}" not found`);
      }
      finalProjectId = resolveResult.projects.nodes[0].id;
    }

    let finalAssigneeId = input.assigneeId;
    if (
      input.assigneeId &&
      !isUuid(input.assigneeId) &&
      input.assigneeId.includes("@")
    ) {
      if (!resolveResult.users?.nodes?.length) {
        throw new Error(`User "${input.assigneeId}" not found`);
      }
      finalAssigneeId = resolveResult.users.nodes[0].id;
    }

    // Step 2: Execute search query
    if (input.query) {
      // Use text search
      const searchResult = await this.graphQLService.rawRequest(
        SEARCH_ISSUES_QUERY,
        {
          term: input.query,
          first: input.limit || 10,
        }
      );

      if (!searchResult.searchIssues?.nodes) {
        return [];
      }

      let results = searchResult.searchIssues.nodes.map((issue: any) =>
        this.transformIssueData(issue)
      );

      // Apply additional filters if provided
      if (finalTeamId) {
        results = results.filter(
          (issue: LinearIssue) => issue.team.id === finalTeamId
        );
      }
      if (finalAssigneeId) {
        results = results.filter(
          (issue: LinearIssue) => issue.assignee?.id === finalAssigneeId
        );
      }
      if (finalProjectId) {
        results = results.filter(
          (issue: LinearIssue) => issue.project?.id === finalProjectId
        );
      }
      if (input.status && input.status.length > 0) {
        results = results.filter((issue: LinearIssue) =>
          input.status!.includes(issue.state.name)
        );
      }

      return results;
    } else {
      // Use filtered search
      const filter: any = {};

      if (finalTeamId) filter.team = { id: { eq: finalTeamId } };
      if (finalAssigneeId) filter.assignee = { id: { eq: finalAssigneeId } };
      if (finalProjectId) filter.project = { id: { eq: finalProjectId } };
      if (input.status && input.status.length > 0) {
        filter.state = { name: { in: input.status } };
      }

      const searchResult = await this.graphQLService.rawRequest(
        FILTERED_SEARCH_ISSUES_QUERY,
        {
          first: input.limit || 10,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
          orderBy: "updatedAt" as any,
        }
      );

      if (!searchResult.issues?.nodes) {
        return [];
      }

      return searchResult.issues.nodes.map((issue: any) =>
        this.transformIssueData(issue)
      );
    }
  }

  /**
   * Transform GraphQL issue response to LinearIssue format
   */
  private transformIssueData(issue: GetIssueByIdQuery["issue"] | GetIssueByIdentifierQuery["issues"]["nodes"][0]): LinearIssue {
    try {
      return this.doTransformIssueData(issue);
    } catch (error: any) {
      // Diagnostic output: dump raw API response to help debug null field issues
      // See: https://github.com/czottmann/linearis/issues/6
      const diagnostic = {
        error: error.message,
        stack: error.stack,
        rawIssueData: issue,
      };
      console.error(
        "\n[DEBUG] Issue transform failed. Raw API response:\n" +
          JSON.stringify(diagnostic, null, 2) +
          "\n\nPlease report this output at: https://github.com/czottmann/linearis/issues\n"
      );
      throw error;
    }
  }

  /**
   * Internal transform implementation
   */
  private doTransformIssueData(issue: GetIssueByIdQuery['issue'] | GetIssueByIdentifierQuery["issues"]["nodes"][0]): LinearIssue {
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || undefined,
      branchName: issue.branchName || undefined,
      embeds: issue.description ? extractEmbeds(issue.description) : undefined,
      state: {
        id: issue.state.id,
        name: issue.state.name,
      },
      assignee: issue.assignee
        ? {
            id: issue.assignee.id,
            name: issue.assignee.name,
          }
        : undefined,
      team: {
        id: issue.team.id,
        key: issue.team.key,
        name: issue.team.name,
      },
      project: issue.project
        ? {
            id: issue.project.id,
            name: issue.project.name,
          }
        : undefined,
      cycle: issue.cycle
        ? {
            id: issue.cycle.id,
            name: issue.cycle.name,
            number: issue.cycle.number,
          }
        : undefined,
      projectMilestone: issue.projectMilestone
        ? {
            id: issue.projectMilestone.id,
            name: issue.projectMilestone.name,
            targetDate: issue.projectMilestone.targetDate || undefined,
          }
        : undefined,
      priority: issue.priority,
      estimate: issue.estimate || undefined,
      labels: issue.labels.nodes.map((label: any) => ({
        id: label.id,
        name: label.name,
      })),
      parentIssue: issue.parent
        ? {
            id: issue.parent.id,
            identifier: issue.parent.identifier,
            title: issue.parent.title,
          }
        : undefined,
      subIssues:
        issue.children?.nodes.map((child: any) => ({
          id: child.id,
          identifier: child.identifier,
          title: child.title,
        })) || undefined,
      comments:
        issue.comments?.nodes.map((comment: any) => ({
          id: comment.id,
          body: comment.body,
          embeds: extractEmbeds(comment.body),
          user: {
            id: comment.user.id,
            name: comment.user.name,
          },
          createdAt:
            comment.createdAt instanceof Date
              ? comment.createdAt.toISOString()
              : comment.createdAt
              ? new Date(comment.createdAt).toISOString()
              : new Date().toISOString(),
          updatedAt:
            comment.updatedAt instanceof Date
              ? comment.updatedAt.toISOString()
              : comment.updatedAt
              ? new Date(comment.updatedAt).toISOString()
              : new Date().toISOString(),
        })) || [],
      createdAt:
        issue.createdAt instanceof Date
          ? issue.createdAt.toISOString()
          : issue.createdAt
          ? new Date(issue.createdAt).toISOString()
          : new Date().toISOString(),
      updatedAt:
        issue.updatedAt instanceof Date
          ? issue.updatedAt.toISOString()
          : issue.updatedAt
          ? new Date(issue.updatedAt).toISOString()
          : new Date().toISOString(),
    };
  }
}
