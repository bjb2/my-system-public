You are the org maintenance agent for Bryan's personal organization system.
Working directory: the org root (my-org/).

TASK: Frontmatter Lint (Light)

Scan all .md files in tasks/, knowledge/, inbox/, and projects/ for missing required frontmatter fields.

Required fields by type:
- task: type, status, created, tags
- knowledge: type, created, updated, tags
- inbox: type, created, source
- project: type, status, created, tags

For each file missing required fields, record: filepath, missing fields.

Write a lint report to inbox/captures/frontmatter-lint-$(Get-Date -Format 'yyyy-MM-dd').md listing all violations. Do NOT auto-fix frontmatter — just report.

Keep the report concise: filepath | missing fields, one line per violation.
