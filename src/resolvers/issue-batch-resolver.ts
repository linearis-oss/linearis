import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import { isUuid, parseIssueIdentifier } from "../common/identifier.js";
import {
  BatchResolveForCreateDocument,
  type BatchResolveForCreateQuery,
  BatchResolveForUpdateDocument,
  type BatchResolveForUpdateQuery,
} from "../gql/graphql.js";

type BatchIssueContext = {
  team?: { id: string; key: string; name?: string } | null;
  project?: { id?: string; name?: string } | null;
  labels?: { nodes?: Array<{ id: string; name: string }> } | null;
};

type ResolveIssueCreateRefsInput = {
  team?: string;
  project?: string;
  labels?: string[];
  parentTicket?: string;
  projectMilestone?: string;
};

type ResolveIssueUpdateRefsInput = {
  project?: string;
  labels?: string[];
  labelMode?: "add" | "overwrite";
  parentTicket?: string;
  projectMilestone?: string;
  issueContext?: BatchIssueContext;
};

type MilestoneNode = { id: string; name: string };
type LabelNode = { id: string; name: string };
type ProjectNode = {
  id: string;
  name: string;
  projectMilestones: { nodes: MilestoneNode[] };
};
type ParentIssueNode = { id: string; identifier: string };

export type ResolvedIssueCreateRefs = {
  teamId: string;
  projectId?: string;
  labelIds?: string[];
  parentId?: string;
  projectMilestoneId?: string;
};

export type ResolvedIssueUpdateRefs = {
  projectId?: string;
  labelIds?: string[];
  currentLabelIds?: string[];
  parentId?: string;
  projectMilestoneId?: string;
};

export async function resolveIssueCreateRefs(
  client: GraphQLClient,
  input: ResolveIssueCreateRefsInput,
): Promise<ResolvedIssueCreateRefs> {
  if (!input.team) {
    throw new Error("--team is required");
  }

  if (input.projectMilestone && !input.project) {
    throw new Error("--project-milestone requires --project to be specified");
  }

  const parentRef =
    input.parentTicket && !isUuid(input.parentTicket)
      ? parseIssueIdentifier(input.parentTicket)
      : undefined;
  const labelNames = (input.labels ?? []).filter((label) => !isUuid(label));

  const result = await client.request<BatchResolveForCreateQuery>(
    BatchResolveForCreateDocument,
    {
      teamKey: !isUuid(input.team) ? input.team : undefined,
      teamName: !isUuid(input.team) ? input.team : undefined,
      projectName:
        input.project && !isUuid(input.project) ? input.project : undefined,
      labelNames,
      parentTeamKey: parentRef?.teamKey,
      parentIssueNumber: parentRef?.issueNumber,
    },
  );

  const teamId = isUuid(input.team)
    ? input.team
    : (result.teams.nodes[0]?.id ?? teamNotFound(input.team));

  return {
    teamId,
    projectId: resolveProjectIdFromBatch(result.projects.nodes, input.project),
    labelIds: resolveLabelIdsFromBatch(result.labels.nodes, input.labels),
    parentId: resolveParentIdFromBatch(
      result.parentIssues.nodes,
      input.parentTicket,
    ),
    projectMilestoneId: resolveCreateMilestoneId(
      result.projects.nodes,
      input.project,
      input.projectMilestone,
    ),
  };
}

export async function resolveIssueUpdateRefs(
  client: GraphQLClient,
  input: ResolveIssueUpdateRefsInput,
): Promise<ResolvedIssueUpdateRefs> {
  if (
    input.projectMilestone &&
    !input.project &&
    !input.issueContext?.project?.id &&
    !input.issueContext?.project?.name
  ) {
    throw new Error("--project-milestone requires project context");
  }

  const parentRef =
    input.parentTicket && !isUuid(input.parentTicket)
      ? parseIssueIdentifier(input.parentTicket)
      : undefined;
  const labelNames = (input.labels ?? []).filter((label) => !isUuid(label));

  const result = await client.request<BatchResolveForUpdateQuery>(
    BatchResolveForUpdateDocument,
    {
      labelNames,
      projectName:
        input.project && !isUuid(input.project) ? input.project : undefined,
      teamKey: parentRef?.teamKey,
      issueNumber: parentRef?.issueNumber,
      milestoneName:
        input.projectMilestone && !isUuid(input.projectMilestone)
          ? input.projectMilestone
          : undefined,
    },
  );

  return {
    projectId: resolveProjectIdFromBatch(result.projects.nodes, input.project),
    labelIds: resolveLabelIdsFromBatch(result.labels.nodes, input.labels),
    currentLabelIds:
      input.labelMode === "add"
        ? (input.issueContext?.labels?.nodes ?? []).map((label) => label.id)
        : undefined,
    parentId: resolveParentIdFromBatch(result.issues.nodes, input.parentTicket),
    projectMilestoneId: resolveUpdateMilestoneId(
      result,
      input.project,
      input.projectMilestone,
      input.issueContext?.project?.id,
    ),
  };
}

function teamNotFound(team: string): never {
  throw notFoundError("Team", team);
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function resolveProjectIdFromBatch(
  projects: ProjectNode[],
  project?: string,
): string | undefined {
  if (!project) {
    return undefined;
  }

  if (isUuid(project)) {
    return project;
  }

  const match = projects.find(
    (candidate) => normalize(candidate.name) === normalize(project),
  );

  if (!match) {
    throw notFoundError("Project", project);
  }

  return match.id;
}

function resolveLabelIdsFromBatch(
  labels: LabelNode[],
  requestedLabels?: string[],
): string[] | undefined {
  if (!requestedLabels || requestedLabels.length === 0) {
    return undefined;
  }

  const labelsByName = new Map(
    labels.map((label) => [normalize(label.name), label.id]),
  );

  return requestedLabels.map((label) => {
    if (isUuid(label)) {
      return label;
    }

    const match = labelsByName.get(normalize(label));
    if (!match) {
      throw notFoundError("Issue label", label);
    }
    return match;
  });
}

function resolveParentIdFromBatch(
  issues: ParentIssueNode[],
  parentTicket?: string,
): string | undefined {
  if (!parentTicket) {
    return undefined;
  }

  if (isUuid(parentTicket)) {
    return parentTicket;
  }

  const match = issues.find((issue) => issue.identifier === parentTicket);
  if (!match) {
    throw notFoundError("Issue", parentTicket);
  }

  return match.id;
}

function resolveCreateMilestoneId(
  projects: ProjectNode[],
  project?: string,
  milestone?: string,
): string | undefined {
  if (!milestone) {
    return undefined;
  }

  if (isUuid(milestone)) {
    return milestone;
  }

  const projectNode = findProjectNode(projects, project);
  const match = findMilestoneByName(
    projectNode?.projectMilestones.nodes ?? [],
    milestone,
  );
  if (!match) {
    throw notFoundError("Milestone", milestone);
  }

  return match.id;
}

function resolveUpdateMilestoneId(
  result: BatchResolveForUpdateQuery,
  project?: string,
  milestone?: string,
  existingProjectId?: string,
): string | undefined {
  if (!milestone) {
    return undefined;
  }

  if (isUuid(milestone)) {
    return milestone;
  }

  if (project) {
    const projectNode = findProjectNode(result.projects.nodes, project);
    const match = findMilestoneByName(
      projectNode?.projectMilestones.nodes ?? [],
      milestone,
    );
    if (!match) {
      throw notFoundError("Milestone", milestone);
    }
    return match.id;
  }

  if (existingProjectId) {
    const issueProject = result.issues.nodes[0]?.project;
    if (issueProject?.id === existingProjectId) {
      const match = findMilestoneByName(
        issueProject.projectMilestones.nodes,
        milestone,
      );
      if (match) {
        return match.id;
      }
    }
  }

  const globalMatch = findMilestoneByName(result.milestones.nodes, milestone);
  if (!globalMatch) {
    throw notFoundError("Milestone", milestone);
  }

  return globalMatch.id;
}

function findProjectNode(
  projects: ProjectNode[],
  project?: string,
): ProjectNode | undefined {
  if (!project || isUuid(project)) {
    return undefined;
  }

  return projects.find(
    (candidate) => normalize(candidate.name) === normalize(project),
  );
}

function findMilestoneByName(
  milestones: MilestoneNode[],
  milestone: string,
): MilestoneNode | undefined {
  return milestones.find(
    (candidate) => normalize(candidate.name) === normalize(milestone),
  );
}
