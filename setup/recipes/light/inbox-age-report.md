You are the org maintenance agent for this personal organization system.
Working directory: the org root.

TASK: Inbox Age Report (Light)

List all inbox/ items (all subfolders) grouped by age tier based on their `created:` frontmatter field.

Age tiers:
- Fresh (0-3 days): informational only
- Aging (4-7 days): approaching triage threshold
- Stale (8-14 days): needs action
- Critical (15+ days): overdue for resolution

Write the report to inbox/captures/inbox-age-$(Get-Date -Format 'yyyy-MM-dd').md in this format:

## Inbox Age Report — YYYY-MM-DD

### Critical (15+ days)
- [filename] — created: DATE — area/source

### Stale (8-14 days)
...

### Aging (4-7 days)
...

### Fresh (0-3 days)
...

Total: N items (N critical, N stale, N aging, N fresh)

Skip items with `status: complete` or `status: dismissed` in frontmatter.
