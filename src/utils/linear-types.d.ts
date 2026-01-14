export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  branchName?: string;
  embeds?: Array<{
    label: string;
    url: string;
    expiresAt: string;
  }>;
  state: {
    id: string;
    name: string;
  };
  assignee?: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    key: string;
    name: string;
  };
  project?: {
    id: string;
    name: string;
  };
  cycle?: {
    id: string;
    name: string;
    number: number;
  };
  projectMilestone?: {
    id: string;
    name: string;
    targetDate?: string;
  };
  priority: number;
  estimate?: number;
  labels: Array<{
    id: string;
    name: string;
  }>;
  parentIssue?: {
    id: string;
    identifier: string;
    title: string;
  };
  subIssues?: Array<{
    id: string;
    identifier: string;
    title: string;
  }>;
  comments?: Array<{
    id: string;
    body: string;
    embeds?: Array<{
      label: string;
      url: string;
      expiresAt: string;
    }>;
    user: {
      id: string;
      name: string;
    };
    createdAt: string;
    updatedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state: string;
  progress: number;
  teams: Array<{
    id: string;
    key: string;
    name: string;
  }>;
  lead?: {
    id: string;
    name: string;
  };
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueArgs {
  title: string;
  teamId?: string;
  description?: string;
  assigneeId?: string;
  priority?: number;
  projectId?: string;
  statusId?: string;
  labelIds?: string[];
  estimate?: number;
  parentId?: string;
  milestoneId?: string;
  cycleId?: string;
  sortOrder?: number;
}

export interface UpdateIssueArgs {
  id: string;
  title?: string;
  description?: string;
  statusId?: string;
  priority?: number;
  assigneeId?: string;
  projectId?: string;
  labelIds?: string[];
  estimate?: number;
  parentId?: string;
  milestoneId?: string | null;
  cycleId?: string | null;
  sortOrder?: number;
}

export interface SearchIssuesArgs {
  query?: string;
  teamId?: string;
  assigneeId?: string;
  projectId?: string;
  status?: string[];
  limit?: number;
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
  scope: "workspace" | "team";
  team?: {
    id: string;
    name: string;
  };
  group?: {
    id: string;
    name: string;
  };
}

export interface CreateCommentArgs {
  issueId: string;
  body: string;
}

export interface LinearComment {
  id: string;
  body: string;
  user: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface LinearProjectMilestone {
  id: string;
  name: string;
  description?: string;
  targetDate?: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    name: string;
  };
  issues?: LinearIssue[];
}

export interface LinearProjectMilestoneWithIssues
  extends LinearProjectMilestone {
  issues: LinearIssue[];
}

export interface ListProjectMilestonesArgs {
  projectId: string; // Project name or UUID (will be resolved)
  limit?: number;
}

export interface GetProjectMilestoneArgs {
  milestoneId: string; // Milestone name or UUID (will be resolved)
  projectId?: string; // Optional project context for name resolution
  issuesFirst?: number; // How many issues to fetch
}

export interface CreateProjectMilestoneArgs {
  name: string;
  projectId: string; // Project name or UUID (will be resolved)
  description?: string;
  targetDate?: string; // ISO date string
}

export interface UpdateProjectMilestoneArgs {
  id: string; // Milestone ID or name (will be resolved)
  projectId?: string; // Optional project context for name resolution
  name?: string;
  description?: string;
  targetDate?: string; // ISO date string
  sortOrder?: number;
}

export interface LinearCycle {
  id: string;
  name: string;
  number: number;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
  isPrevious?: boolean;
  isNext?: boolean;
  progress: number;
  issueCountHistory: number[];
  team?: {
    id: string;
    key: string;
    name: string;
  };
  issues?: LinearIssue[];
}

export interface CycleListOptions {
  team?: string;
  active?: boolean;
  aroundActive?: string;
}

export interface CycleReadOptions {
  team?: string;
  issuesFirst?: string;
}

export interface MilestoneListOptions {
  project: string;
  limit?: string;
}

export interface MilestoneReadOptions {
  project?: string;
  issuesFirst?: string;
}

export interface MilestoneCreateOptions {
  project: string;
  description?: string;
  targetDate?: string;
}

export interface MilestoneUpdateOptions {
  project?: string;
  name?: string;
  description?: string;
  targetDate?: string;
  sortOrder?: string;
}

// Document types
export interface LinearDocument {
  id: string;
  title: string;
  content?: string;
  slugId: string;
  url: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: string;
    name: string;
  };
  project?: {
    id: string;
    name: string;
  };
  trashed?: boolean;
}

export interface DocumentCreateInput {
  title: string;
  content?: string;
  projectId?: string;
  teamId?: string;
  icon?: string;
  color?: string;
}

export interface DocumentUpdateInput {
  title?: string;
  content?: string;
  projectId?: string;
  icon?: string;
  color?: string;
}

// Attachment types (internal use for documents linking)
export interface LinearAttachment {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  issue: {
    id: string;
    identifier: string;
    title: string;
  };
  creator?: {
    id: string;
    name: string;
  };
}

export interface AttachmentCreateInput {
  issueId: string;
  url: string;
  title: string;
  subtitle?: string;
  commentBody?: string;
  iconUrl?: string;
}
