import type {
  GetIssuesQuery,
  GetIssueByIdQuery,
  GetIssueByIdentifierQuery,
  SearchIssuesQuery,
  CreateIssueMutation,
  UpdateIssueMutation,
  GetDocumentQuery,
  ListDocumentsQuery,
  DocumentCreateMutation,
  DocumentUpdateMutation,
  ListAttachmentsQuery,
  AttachmentCreateMutation,
  GetProjectMilestoneByIdQuery,
  ListProjectMilestonesQuery,
  CreateProjectMilestoneMutation,
  UpdateProjectMilestoneMutation,
  GetViewerQuery,
} from "../gql/graphql.js";

// Issue types
export type Issue = GetIssuesQuery["issues"]["nodes"][0];
export type IssueDetail = NonNullable<GetIssueByIdQuery["issue"]>;
export type IssueByIdentifier = GetIssueByIdentifierQuery["issues"]["nodes"][0];
export type IssueSearchResult = SearchIssuesQuery["searchIssues"]["nodes"][0];
export type CreatedIssue = NonNullable<CreateIssueMutation["issueCreate"]["issue"]>;
export type UpdatedIssue = NonNullable<UpdateIssueMutation["issueUpdate"]["issue"]>;

// Document types
export type Document = NonNullable<GetDocumentQuery["document"]>;
export type DocumentListItem = ListDocumentsQuery["documents"]["nodes"][0];
export type CreatedDocument = DocumentCreateMutation["documentCreate"]["document"];
export type UpdatedDocument = DocumentUpdateMutation["documentUpdate"]["document"];

// Attachment types
export type Attachment = ListAttachmentsQuery["issue"]["attachments"]["nodes"][0];
export type CreatedAttachment = AttachmentCreateMutation["attachmentCreate"]["attachment"];

// Milestone types
export type MilestoneDetail = NonNullable<GetProjectMilestoneByIdQuery["projectMilestone"]>;
export type MilestoneListItem = ListProjectMilestonesQuery["project"]["projectMilestones"]["nodes"][0];
export type CreatedMilestone = NonNullable<CreateProjectMilestoneMutation["projectMilestoneCreate"]["projectMilestone"]>;
export type UpdatedMilestone = NonNullable<UpdateProjectMilestoneMutation["projectMilestoneUpdate"]["projectMilestone"]>;

// Viewer types
export type Viewer = GetViewerQuery["viewer"];
