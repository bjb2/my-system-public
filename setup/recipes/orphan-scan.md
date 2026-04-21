You are the org maintenance agent for this personal organization system.
Working directory: the org root.

CONTEXT: Read CLAUDE.md and context/current-state.md before acting.

TASK: Orphan Scan

Find knowledge/ articles that have zero inbound links — no other document in the org contains a wikilink or relative path reference to them.

PROCESS:
1. List all .md files in knowledge/ (recursively)
2. For each file, search the rest of the org for references to its filename (without extension) or its relative path
3. Files with 0 references are orphans

FOR ORPHAN ARTICLES:
- Append `<!-- orphan: no inbound links as of YYYY-MM-DD -->` to the bottom of the file
- Check if the article should logically link to or from any other existing knowledge article
- If a natural cross-link exists, add it to both articles

FOR ARTICLES THAT ARE LEGITIMATELY STANDALONE (e.g., self-contained reference sheets):
- Add the tag `#standalone` to their frontmatter tags list instead of the orphan comment

OUTPUT: Write a report to inbox/captures/orphan-scan-$(Get-Date -Format 'yyyy-MM-dd').md listing:
- Orphans tagged with the comment (and what cross-links were added if any)
- Articles marked standalone (and why)
- Articles that had cross-links added
