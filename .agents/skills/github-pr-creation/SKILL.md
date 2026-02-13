---
name: github-pr-creation
description: Creates GitHub Pull Requests with automated validation and task tracking. Use when user wants to create PR, open pull request, submit for review, or check if ready for PR. Analyzes commits, validates task completion, generates Conventional Commits title and description, suggests labels. NOTE - for merging existing PRs, use github-pr-merge instead.
---

# GitHub PR creation

Creates Pull Requests with task validation, test execution, and Conventional Commits formatting.

## Current state

!`git rev-parse --abbrev-ref HEAD 2>/dev/null`
!`git log @{u}..HEAD --oneline 2>/dev/null || echo "(no upstream tracking)"`

## Core workflow

### 1. Confirm target branch

**ALWAYS ask user before proceeding:**

```
Creating PR from [current-branch] to [target-branch]. Correct?
```

| Branch flow | Typical target |
|-------------|---------------|
| feature/* | develop |
| fix/* | develop |
| hotfix/* | main/master |
| develop | main/master |

### 2. Search for task documentation

Look for task/spec files that describe what this PR should accomplish. Common locations by tool:

| Tool/Convention | Path |
|-----------------|------|
| AWS Kiro | `.kiro/specs/*/tasks.md` |
| Cursor | `.cursor/rules/*.md`, `.cursorrules` |
| Trae | `.trae/rules/*.md` |
| GitHub Issues | `gh issue list --assignee @me --state open` |
| Generic | `docs/specs/`, `specs/`, `tasks.md`, `TODO.md` |

Extract task IDs, titles, descriptions, and requirements references when found.

### 3. Analyze commits

For each commit on this branch, identify type, scope, task references, and breaking changes. Map commits to documented tasks when task files exist.

### 4. Verify task completion

If task documentation exists:

1. Identify main task from branch name (e.g., `feature/task-2-*` -> Task 2)
2. Find all sub-tasks (e.g., Task 2.1, 2.2, 2.3)
3. Check which sub-tasks are referenced in commits
4. Report missing sub-tasks

**If tasks incomplete**, STOP and show status:
```
Task 2 INCOMPLETE: 1/3 sub-tasks missing
- Task 2.1: done
- Task 2.2: done
- Task 2.3: MISSING
```

Ask user whether to complete missing tasks or proceed anyway.

### 5. Run tests

Run the project test suite. Tests **MUST** pass before creating PR.

### 6. Determine PR type and generate title

| Branch flow | Title prefix |
|-------------|-------------|
| feature/* -> develop | `feat(scope):` |
| fix/* -> develop | `fix(scope):` |
| hotfix/* -> main | `hotfix(scope):` |
| develop -> main | `release:` |
| refactor/* -> develop | `refactor(scope):` |

**Title format**: `<type>(<scope>): <description>`
- Type: dominant commit type (feat > fix > refactor)
- Scope: most common scope from commits (kebab-case)
- Description: imperative, lowercase, no period, max 50 chars

### 7. Generate PR body

Use the appropriate template from `references/pr_templates.md` based on PR type and populate with gathered data.

### 8. Suggest labels

**ALWAYS check available labels first:**

```bash
gh label list
```

Match commit types to available project labels. The project may use different names than standard (e.g., "feature" instead of "enhancement").

| Commit type | Common label names |
|-------------|-------------------|
| feat | feature, enhancement |
| fix | bug, bugfix |
| refactor | refactoring, tech-debt |
| docs | documentation |
| ci | ci/cd, infrastructure |
| security | security |
| hotfix | urgent, priority:high |

**If no matching label exists**: suggest creating one. The user may have removed default labels, so offering to add relevant ones is appropriate.

### 9. Create PR

**ALWAYS show title, body, and labels for user approval first.**

```bash
gh pr create --title "[title]" --body "$(cat <<'EOF'
[body content]
EOF
)" --base [base_branch] --label [labels]
```

## Important rules

- **ALWAYS** confirm target branch with user
- **ALWAYS** run tests before creating PR
- **ALWAYS** show PR content for approval before creating
- **ALWAYS** check available labels with `gh label list` before suggesting
- **ALWAYS** use HEREDOC for body to preserve formatting
- **NEVER** create PR without user confirmation
- **NEVER** modify repository files (read-only analysis)

## References

- `references/pr_templates.md` - PR body templates for all types (feature, release, bugfix, hotfix, refactoring, docs, CI/CD)
