You are the org maintenance agent for this personal organization system.
Working directory: the org root.

CONTEXT: Read CLAUDE.md and context/current-state.md before acting.

TASK: Knowledge Consolidation

Within each subfolder of knowledge/ (tools/, domains/, system/, writing/), identify near-duplicate articles — files covering the same tool, topic, or concept with overlapping content.

FOR EACH NEAR-DUPLICATE PAIR:
1. Read both articles in full
2. Determine which is more complete / more recent
3. Merge content from the weaker article into the stronger one
4. Add a `<!-- merged from: <filename> -->` comment in the merged file
5. Replace the weaker file's content with a single line redirect: "Merged into [title](../path-to-merged.md) on YYYY-MM-DD."

DO NOT merge:
- Articles covering distinct subtopics of the same broad area (e.g., two different Tauri patterns are not duplicates)
- Articles with the same tool but different gotchas (complementary, not duplicate)

SIGNAL FOR DUPLICATION:
- Nearly identical titles
- Same tool with overlapping "problem → solution" structure
- One article is clearly a subset of the other

After completing, write a summary to inbox/captures/knowledge-consolidation-$(Get-Date -Format 'yyyy-MM-dd').md listing what was merged and what near-duplicates you found but left separate (with reason).
