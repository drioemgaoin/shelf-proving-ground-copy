# Issue Kind Labels

These labels distinguish **specs** from **tickets**. Every issue gets one.

| Label    | Meaning                                                                                      |
| -------- | -------------------------------------------------------------------------------------------- |
| `spec`   | A parent issue that captures the full design (from to-spec). Not buildable by itself.        |
| `ticket` | A child issue scoped for one context window (from to-tickets). Buildable by an agent.        |

## Rules

- **to-spec** creates an issue with both `ready-for-agent` and `spec`. The `spec` label signals that this issue must be broken into child tickets before any agent builds it.
- **to-tickets** reads the source issue. If it has the `spec` label, create child tickets with the `ticket` label. Parent/child linking is tracker-specific: Beads uses `--parent=<spec-id>`, GitHub uses a "Parent: #N" reference in the body plus labels, custom trackers use whatever convention the project defines. Never turn a spec into a ticket — always create children under it.
- A `spec` is complete when all its child `ticket` issues are closed.
- An issue without either label is treated as a `ticket` by default.
