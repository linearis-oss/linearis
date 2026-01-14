import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphQLProjectsService } from "../../src/utils/graphql-projects-service.js";
import type { GraphQLService } from "../../src/utils/graphql-service.js";
import type { LinearService } from "../../src/utils/linear-service.js";

/**
 * Unit tests for GraphQLProjectsService
 *
 * Tests project creation with team resolution and validation.
 */

describe("GraphQLProjectsService", () => {
  let mockGraphQLService: {
    rawRequest: ReturnType<typeof vi.fn>;
  };
  let mockLinearService: {
    resolveTeamId: ReturnType<typeof vi.fn>;
  };
  let service: GraphQLProjectsService;

  beforeEach(() => {
    mockGraphQLService = {
      rawRequest: vi.fn(),
    };
    mockLinearService = {
      resolveTeamId: vi.fn(),
    };

    service = new GraphQLProjectsService(
      mockGraphQLService as unknown as GraphQLService,
      mockLinearService as unknown as LinearService,
    );
  });

  describe("createProject", () => {
    it("should create project with resolved team ID", async () => {
      // Setup: team resolution returns UUID
      mockLinearService.resolveTeamId.mockResolvedValue("team-uuid-123");

      // Setup: GraphQL returns success
      mockGraphQLService.rawRequest.mockResolvedValue({
        projectCreate: {
          success: true,
          project: {
            id: "project-uuid-456",
            name: "Test Project",
            description: null,
            state: "planned",
            progress: 0,
            teams: { nodes: [{ id: "team-uuid-123", key: "ENG", name: "Engineering" }] },
            lead: null,
            targetDate: null,
            startDate: null,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
        },
      });

      const result = await service.createProject({
        name: "Test Project",
        teamIds: ["ENG"],
      });

      expect(result.id).toBe("project-uuid-456");
      expect(result.name).toBe("Test Project");
      expect(mockLinearService.resolveTeamId).toHaveBeenCalledWith("ENG");
    });

    it("should pass UUID team IDs directly without resolution", async () => {
      const teamUuid = "550e8400-e29b-41d4-a716-446655440000";

      mockGraphQLService.rawRequest.mockResolvedValue({
        projectCreate: {
          success: true,
          project: {
            id: "project-uuid-456",
            name: "Test Project",
            description: null,
            state: "planned",
            progress: 0,
            teams: { nodes: [{ id: teamUuid, key: "ENG", name: "Engineering" }] },
            lead: null,
            targetDate: null,
            startDate: null,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
        },
      });

      await service.createProject({
        name: "Test Project",
        teamIds: [teamUuid],
      });

      // Should NOT call resolveTeamId for UUIDs
      expect(mockLinearService.resolveTeamId).not.toHaveBeenCalled();

      // Should pass UUID directly to GraphQL
      const graphqlCall = mockGraphQLService.rawRequest.mock.calls[0];
      expect(graphqlCall[1].input.teamIds).toContain(teamUuid);
    });

    it("should throw error when team not found", async () => {
      mockLinearService.resolveTeamId.mockResolvedValue(null);

      await expect(
        service.createProject({
          name: "Test Project",
          teamIds: ["NONEXISTENT"],
        }),
      ).rejects.toThrow('Team not found: "NONEXISTENT"');
    });

    it("should validate leadId is a UUID", async () => {
      await expect(
        service.createProject({
          name: "Test Project",
          teamIds: ["550e8400-e29b-41d4-a716-446655440000"],
          leadId: "john.doe", // Not a UUID
        }),
      ).rejects.toThrow('Lead ID must be a UUID (got "john.doe")');
    });

    it("should accept valid UUID for leadId", async () => {
      const leadUuid = "660e8400-e29b-41d4-a716-446655440001";

      mockGraphQLService.rawRequest.mockResolvedValue({
        projectCreate: {
          success: true,
          project: {
            id: "project-uuid-456",
            name: "Test Project",
            description: null,
            state: "planned",
            progress: 0,
            teams: { nodes: [] },
            lead: { id: leadUuid, name: "John Doe" },
            targetDate: null,
            startDate: null,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
        },
      });

      const result = await service.createProject({
        name: "Test Project",
        teamIds: ["550e8400-e29b-41d4-a716-446655440000"],
        leadId: leadUuid,
      });

      expect(result.lead?.id).toBe(leadUuid);

      // Verify leadId was passed to GraphQL
      const graphqlCall = mockGraphQLService.rawRequest.mock.calls[0];
      expect(graphqlCall[1].input.leadId).toBe(leadUuid);
    });

    it("should include all optional fields in GraphQL input", async () => {
      mockGraphQLService.rawRequest.mockResolvedValue({
        projectCreate: {
          success: true,
          project: {
            id: "project-uuid-456",
            name: "Full Project",
            description: "A complete project",
            state: "started",
            progress: 0,
            teams: { nodes: [] },
            lead: null,
            targetDate: "2025-12-31",
            startDate: "2025-01-15",
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
        },
      });

      await service.createProject({
        name: "Full Project",
        teamIds: ["550e8400-e29b-41d4-a716-446655440000"],
        description: "A complete project",
        color: "#FF0000",
        icon: "rocket",
        targetDate: "2025-12-31",
        startDate: "2025-01-15",
        state: "started",
      });

      const graphqlCall = mockGraphQLService.rawRequest.mock.calls[0];
      const input = graphqlCall[1].input;

      expect(input.name).toBe("Full Project");
      expect(input.description).toBe("A complete project");
      expect(input.color).toBe("#FF0000");
      expect(input.icon).toBe("rocket");
      expect(input.targetDate).toBe("2025-12-31");
      expect(input.startDate).toBe("2025-01-15");
      expect(input.state).toBe("started");
    });

    it("should throw error when GraphQL returns failure", async () => {
      mockGraphQLService.rawRequest.mockResolvedValue({
        projectCreate: {
          success: false,
          project: null,
        },
      });

      await expect(
        service.createProject({
          name: "Failing Project",
          teamIds: ["550e8400-e29b-41d4-a716-446655440000"],
        }),
      ).rejects.toThrow('Failed to create project "Failing Project"');
    });

    it("should include startDate in transformed response", async () => {
      mockGraphQLService.rawRequest.mockResolvedValue({
        projectCreate: {
          success: true,
          project: {
            id: "project-uuid-456",
            name: "Test Project",
            description: null,
            state: "planned",
            progress: 0,
            teams: { nodes: [] },
            lead: null,
            targetDate: "2025-12-31",
            startDate: "2025-01-15",
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
        },
      });

      const result = await service.createProject({
        name: "Test Project",
        teamIds: ["550e8400-e29b-41d4-a716-446655440000"],
      });

      // Verify startDate is included in output (Wolf fix verification)
      expect(result.startDate).toBe("2025-01-15");
      expect(result.targetDate).toBe("2025-12-31");
    });
  });

  describe("listProjects", () => {
    it("should list projects without filter", async () => {
      mockGraphQLService.rawRequest.mockResolvedValue({
        projects: {
          nodes: [
            {
              id: "project-1",
              name: "Project A",
              description: null,
              state: "started",
              progress: 50,
              teams: { nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }] },
              lead: null,
              targetDate: null,
              startDate: null,
              createdAt: "2025-01-01T00:00:00Z",
              updatedAt: "2025-01-01T00:00:00Z",
            },
          ],
        },
      });

      const result = await service.listProjects();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Project A");
    });

    it("should filter by team ID", async () => {
      mockLinearService.resolveTeamId.mockResolvedValue("team-uuid-123");

      mockGraphQLService.rawRequest.mockResolvedValue({
        projects: {
          nodes: [],
        },
      });

      await service.listProjects({ teamId: "ENG" });

      expect(mockLinearService.resolveTeamId).toHaveBeenCalledWith("ENG");

      const graphqlCall = mockGraphQLService.rawRequest.mock.calls[0];
      expect(graphqlCall[1].filter).toEqual({
        accessibleTeams: { some: { id: { eq: "team-uuid-123" } } },
      });
    });
  });
});
