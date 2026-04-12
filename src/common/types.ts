import type {
  AttachmentCreateMutation,
  CreateCommentMutation,
  CreateIssueMutation,
  CreateIssueRelationMutation,
  CreateProjectMilestoneMutation,
  CreateProjectMutation,
  DocumentCreateMutation,
  DocumentUpdateMutation,
  GetDocumentQuery,
  GetIssueByIdentifierQuery,
  GetIssueByIdentifierWithAttachmentsQuery,
  GetIssueByIdQuery,
  GetIssueByIdWithAttachmentsQuery,
  GetIssuesQuery,
  GetProjectMilestoneByIdQuery,
  GetProjectQuery,
  GetProjectsQuery,
  GetViewerQuery,
  ListAttachmentsQuery,
  ListCommentsQuery,
  ListDocumentsQuery,
  ListProjectMilestonesQuery,
  SearchIssuesQuery,
  UpdateCommentMutation,
  UpdateIssueMutation,
  UpdateProjectMilestoneMutation,
  UpdateProjectMutation,
} from "../gql/graphql.js";

// Pagination types
export type PageInfo = GetIssuesQuery["issues"]["pageInfo"];

export interface PaginatedResult<T> {
  nodes: T[];
  pageInfo: PageInfo;
}

export interface PaginationOptions {
  limit?: number;
  after?: string;
}

// Issue types
export type Issue = GetIssuesQuery["issues"]["nodes"][0];
export type IssueDetail = NonNullable<GetIssueByIdQuery["issue"]>;
export type IssueByIdentifier = GetIssueByIdentifierQuery["issues"]["nodes"][0];
export type IssueDetailWithAttachments = NonNullable<
  GetIssueByIdWithAttachmentsQuery["issue"]
>;
export type IssueByIdentifierWithAttachments =
  GetIssueByIdentifierWithAttachmentsQuery["issues"]["nodes"][0];
export type IssueSearchResult = SearchIssuesQuery["searchIssues"]["nodes"][0];
export type CreatedIssue = NonNullable<
  CreateIssueMutation["issueCreate"]["issue"]
>;
export type UpdatedIssue = NonNullable<
  UpdateIssueMutation["issueUpdate"]["issue"]
>;

// Issue relation types
export type CreatedIssueRelation =
  CreateIssueRelationMutation["issueRelationCreate"]["issueRelation"];

// Document types
export type Document = NonNullable<GetDocumentQuery["document"]>;
export type DocumentListItem = ListDocumentsQuery["documents"]["nodes"][0];
export type CreatedDocument =
  DocumentCreateMutation["documentCreate"]["document"];
export type UpdatedDocument =
  DocumentUpdateMutation["documentUpdate"]["document"];

// Attachment types
export type Attachment =
  ListAttachmentsQuery["issue"]["attachments"]["nodes"][0];
export type CreatedAttachment =
  AttachmentCreateMutation["attachmentCreate"]["attachment"];

// Project types
export type ProjectListItem = GetProjectsQuery["projects"]["nodes"][0];
export type ProjectDetail = NonNullable<GetProjectQuery["project"]>;
export type CreatedProject = NonNullable<
  CreateProjectMutation["projectCreate"]["project"]
>;
export type UpdatedProject = NonNullable<
  UpdateProjectMutation["projectUpdate"]["project"]
>;

// Milestone types
export type MilestoneDetail = NonNullable<
  GetProjectMilestoneByIdQuery["projectMilestone"]
>;
export type MilestoneListItem =
  ListProjectMilestonesQuery["project"]["projectMilestones"]["nodes"][0];
export type CreatedMilestone = NonNullable<
  CreateProjectMilestoneMutation["projectMilestoneCreate"]["projectMilestone"]
>;
export type UpdatedMilestone = NonNullable<
  UpdateProjectMilestoneMutation["projectMilestoneUpdate"]["projectMilestone"]
>;

// Comment types
export type CreatedComment = NonNullable<
  CreateCommentMutation["commentCreate"]["comment"]
>;
export type UpdatedComment = NonNullable<
  UpdateCommentMutation["commentUpdate"]["comment"]
>;
export type CommentListItem =
  ListCommentsQuery["issue"]["comments"]["nodes"][0];

// Viewer types
export type Viewer = GetViewerQuery["viewer"];
