# Issue tracker: Linear

Issues and PRDs for this repo live in Linear, not GitHub Issues. Use the `mcp__linear-server__*` tools for all operations — do not use `gh issue`.

## Identity

- **Workspace**: `somos-dev`
- **Team**: La Granja (key `LAG`) — issue identifiers look like `LAG-38`
- **Project**: "Personal PNL" — scope new issues to this project unless told otherwise

## Conventions

- **Create an issue**: `mcp__linear-server__save_issue` with `team: "LAG"`, `project: "Personal PNL"`, `title`, and `description` (Markdown). Omit `id`.
- **Read an issue**: `mcp__linear-server__get_issue` with `id: "LAG-<number>"`. Pass `includeRelations: true` when blocking/related issues matter.
- **List issues**: `mcp__linear-server__list_issues` with `team: "LAG"` and `project: "Personal PNL"`, filtered by `label`, `state`, or `assignee` as needed.
- **Comment on an issue**: `mcp__linear-server__save_comment` with `issueId: "LAG-<number>"` and `body` (Markdown, literal newlines — don't escape).
- **Apply / remove labels**: `mcp__linear-server__save_issue` with `id` and `labels` — this **replaces the full label set**, so fetch the issue first (`get_issue`) and pass the complete desired list, not just the delta.
- **Close**: `mcp__linear-server__save_issue` with `id` and `state: "Done"` (or `"Canceled"` if abandoned, `"Duplicate"` if a dupe).

## Workflow states

`Backlog` → `Todo` → `In Progress` → `In Review` → `Done` (also `Canceled`, `Duplicate`).

## When a skill says "publish to the issue tracker"

Create a Linear issue via `save_issue` as described above.

## When a skill says "fetch the relevant ticket"

Run `mcp__linear-server__get_issue` with the `LAG-<number>` identifier.

## Pull requests as a triage surface

Not applicable — this repo's PRs live on GitHub but aren't tracked as Linear issues. Treat GitHub PRs purely as code review, not as a request/triage surface.
