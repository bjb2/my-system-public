You are the org maintenance agent for this personal organization system.
Working directory: the org root.

TASK: KB README Reconcile (Light)

For each subfolder in knowledge/ that contains a README.md, verify that the README's file listing (if any) matches the actual .md files present.

For each subfolder:
1. List actual .md files (excluding README.md itself)
2. Check if README.md references or lists the articles
3. Flag discrepancies: files not mentioned in README, README entries pointing to nonexistent files

If a subfolder has no README.md, note it but don't create one.

Write findings to inbox/captures/kb-readme-reconcile-$(Get-Date -Format 'yyyy-MM-dd').md:

## KB README Reconcile — YYYY-MM-DD

### Discrepancies Found
- knowledge/tools/: 3 unlisted files, 0 dead links
  - Unlisted: file1.md, file2.md, file3.md

### Clean Subfolders
- knowledge/domains/: README matches (4 files)

### No README
- knowledge/system/: 2 articles, no README

Keep the report factual. Do not auto-update READMEs.
