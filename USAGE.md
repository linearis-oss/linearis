linearis v2025.12.3 — CLI for Linear.app (project management / issue tracking)
auth: --api-token <token> | LINEAR_API_TOKEN | ~/.linear_api_token
output: JSON
ids: UUID or human-readable (team key, issue ABC-123, name)

domains:
  issues        work items with status, priority, assignee, labels
  comments      discussion threads on issues
  labels        categorization tags, workspace-wide or team-scoped
  projects      groups of issues toward a goal
  cycles        time-boxed iterations (sprints) per team
  milestones    progress checkpoints within projects
  documents     long-form markdown docs attached to projects or issues
  files         upload/download file attachments
  teams         organizational units owning issues and cycles
  users         workspace members and assignees

detail: linearis <domain> usage

---

linearis issues — work items with status, priority, assignee, labels

an issue belongs to exactly one team. it has a status (e.g. backlog,
todo, in progress, done — configurable per team), a priority (1-4),
and can be assigned to a user. issues can have labels, belong to a
project, be part of a cycle (sprint), and reference a project milestone.
parent-child relationships between issues are supported.

commands:
  list [options]  list issues with optional filters
  read <issue>    get full issue details including description
  create <title>  create new issue
  update <issue>  update an existing issue

arguments:
  <issue>  issue identifier (UUID or ABC-123)
  <title>  string

list options:
  --query <text>       filter by text search
  --team <team>        filter by team (key, name, or UUID)
  --assignee <user>    filter by assignee (name or UUID)
  --project <project>  filter by project (name or UUID)
  --status <status>    filter by status (comma-separated names or UUIDs)
  --limit <n>          max results (default: 50)

create options:
  --description <text>      issue body
  --assignee <user>         assign to user
  --priority <1-4>          1=urgent 2=high 3=medium 4=low
  --project <project>       add to project
  --team <team>             target team (required)
  --labels <labels>         comma-separated label names or UUIDs
  --project-milestone <ms>  set milestone (requires --project)
  --cycle <cycle>           add to cycle (requires --team)
  --status <status>         set status
  --parent-ticket <issue>   set parent issue

update options:
  --title <text>             new title
  --description <text>       new description
  --status <status>          new status
  --priority <1-4>           new priority
  --assignee <user>          new assignee
  --project <project>        new project
  --labels <labels>          labels to apply (comma-separated)
  --label-mode <mode>        add | overwrite
  --clear-labels             remove all labels
  --parent-ticket <issue>    set parent issue
  --clear-parent-ticket      clear parent
  --project-milestone <ms>   set project milestone
  --clear-project-milestone  clear project milestone
  --cycle <cycle>            set cycle
  --clear-cycle              clear cycle

see also: comments create <issue>, documents list --issue <issue>

---

linearis comments — discussion threads on issues

a comment is a text entry on an issue. comments support markdown.

commands:
  create <issue>  create a comment on an issue

arguments:
  <issue>  issue identifier (UUID or ABC-123)

create options:
  --body <text>  comment body (required, markdown supported)

see also: issues read <issue>

---

linearis labels — categorization tags, workspace-wide or team-scoped

labels categorize issues. they can exist at workspace level or be
scoped to a specific team. use with issues create/update --labels.

commands:
  list [options]  list available labels

list options:
  --team <team>  filter by team (key, name, or UUID)

see also: issues create --labels, issues update --labels

---

linearis projects — groups of issues toward a goal

a project collects related issues across teams. projects can have
milestones to track progress toward deadlines or phases.

commands:
  list [options]  list projects

list options:
  --limit <n>  max results (default: 100)

see also: milestones list --project, documents list --project

---

linearis cycles — time-boxed iterations (sprints) per team

a cycle is a sprint belonging to one team. each team can have one
active cycle at a time. cycles contain issues and have start/end dates.

commands:
  list [options]  list cycles
  read <cycle>    get cycle details including issues

arguments:
  <cycle>  cycle identifier (UUID or name)

list options:
  --team <team>  filter by team (key, name, or UUID)
  --active       only show active cycles
  --window <n>   active cycle +/- n neighbors (requires --team)

read options:
  --team <team>  scope name lookup to team
  --limit <n>    max issues to fetch (default: 50)

see also: issues create --cycle, issues update --cycle

---

linearis milestones — progress checkpoints within projects

a milestone marks a phase or deadline within a project. milestones
can have target dates and contain issues assigned to them.

commands:
  list [options]      list milestones in a project
  read <milestone>    get milestone details including issues
  create <name>       create a new milestone
  update <milestone>  update an existing milestone

arguments:
  <milestone>  milestone identifier (UUID or name)
  <name>       string

list options:
  --project <project>  target project (required)
  --limit <n>          max results (default: 50)

read options:
  --project <project>  scope name lookup to project
  --limit <n>          max issues to fetch (default: 50)

create options:
  --project <project>   target project (required)
  --description <text>  milestone description
  --target-date <date>  target date in ISO format (YYYY-MM-DD)

update options:
  --project <project>   scope name lookup to project
  --name <name>         new name
  --description <text>  new description
  --target-date <date>  new target date in ISO format (YYYY-MM-DD)
  --sort-order <n>      display order

see also: issues create --project-milestone, issues update --project-milestone

---

linearis documents — long-form markdown docs attached to projects or issues

a document is a markdown page. it can belong to a project and/or be
attached to an issue. documents support icons and colors.

commands:
  list [options]     list documents
  read <document>    get document content
  create [options]   create a new document
  update <document>  update an existing document
  delete <document>  trash a document

arguments:
  <document>  document identifier (UUID)

list options:
  --project <project>  filter by project name or ID
  --issue <issue>      filter by issue (shows documents attached to the issue)
  --limit <n>          max results (default: 50)

create options:
  --title <title>      document title (required)
  --content <text>     document content (markdown)
  --project <project>  project name or ID
  --team <team>        team key or name
  --icon <icon>        document icon
  --color <color>      icon color
  --issue <issue>      also attach document to issue (e.g., ABC-123)

update options:
  --title <title>      new title
  --content <text>     new content (markdown)
  --project <project>  move to project
  --icon <icon>        new icon
  --color <color>      new icon color

see also: issues read <issue>, projects list

---

linearis files — upload/download file attachments

files are binary attachments stored in Linear's storage. upload returns
a URL that can be referenced in issue descriptions or comments.

commands:
  download <url>  download a file from Linear storage
  upload <file>   upload a file to Linear storage

arguments:
  <url>   Linear storage URL
  <file>  local file path

download options:
  --output <path>  output file path
  --overwrite      overwrite existing file

---

linearis teams — organizational units owning issues and cycles

a team is a group of users that owns issues, cycles, statuses, and
labels. teams are identified by a short key (e.g. ENG), name, or UUID.

commands:
  list  list all teams

---

linearis users — workspace members and assignees

a user is a member of the Linear workspace. users can be assigned to
issues and belong to teams.

commands:
  list [options]  list workspace members

list options:
  --active  only show active users
