# CI Run Model

This document defines how pull request checks and release runs are wired together.

## Workflow purpose

| Workflow | Purpose |
| --- | --- |
| `ci.yml` | Runs required pull request checks used by branch protection/rulesets. |
| `release-check.yml` | Performs semantic-release on release branches after required checks have already passed in PR. |

## Trigger matrix

| Event | Branch | `ci.yml` | `release-check.yml` |
| --- | --- | --- | --- |
| `pull_request` | `main`, `next` | ✅ required checks | ❌ |
| `push` | `main`, `next` | ✅ sanity verification | ✅ release run |
| `workflow_dispatch` | selected ref | optional manual CI run | ✅ manual release run |

## Required checks for repository ruleset

The repository ruleset must require exactly these check names:

- Unit tests on node v22
- Code checks on node v22

These checks are produced by `ci.yml` and must be green before merging to `main` or `next`.

## Release model (no schedule)

Release workflow is lean and intentionally does not run a weekly schedule:

- Push to `next` → prerelease channel
- Push to `main` → stable release channel
- Manual `workflow_dispatch` → ad-hoc release from selected ref

Because release runs happen only after merges, quality gates live in PR required checks, not duplicated release-time full matrices.

## Operational verification

Use GitHub CLI to confirm the run model:

```bash
# CI required checks from PRs

gh run list --workflow ci.yml --event pull_request --limit 20

# Release runs on push (main + next)

gh run list --workflow release-check.yml --event push --limit 20

# Optional manual release runs

gh run list --workflow release-check.yml --event workflow_dispatch --limit 20
```

## Rollback guidance

If the model needs to be reverted quickly:

1. Revert the workflow/ruleset refactor commit.
2. Confirm ruleset required checks point to existing check names.
3. Re-run a PR and confirm both required checks appear and pass.
4. Verify push-based release on `next` and `main` with `gh run list` filters above.
5. If release is blocked, run `workflow_dispatch` once as a temporary bridge while fixing ruleset/workflow drift.
