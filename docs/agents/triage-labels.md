# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (Linear, team `LAG`).

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| --------------------------- | --------------------- | ----------------------------------------- |
| `needs-triage`               | `needs-triage`        | Maintainer needs to evaluate this issue   |
| `needs-info`                 | `needs-info`          | Waiting on reporter for more information  |
| `ready-for-agent`           | `ready-for-agent`     | Fully specified, ready for an AFK agent   |
| `ready-for-human`           | `ready-for-human`     | Requires human implementation             |
| `wontfix`                   | `wontfix`             | Will not be actioned                      |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Note: as of this setup, none of these five labels exist yet on the `LAG` team in Linear (existing labels are `infra`, `app`, `Front`, `Back`, `Feature`, `Improvement`, `Bug A/B/C`). Create them with `mcp__linear-server__create_issue_label` the first time `/triage` needs to apply one, rather than treating their absence as an error.

Edit the right-hand column to match whatever vocabulary you actually use.
