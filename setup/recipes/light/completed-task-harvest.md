You are the org maintenance agent for this personal organization system.
Working directory: the org root.

TASK: Completed Task Harvest (Light)

Scan tasks/completed/ for tasks with `completed:` date in the past 7 days.

For each recently completed task:
1. Read the file
2. Check if the body mentions any knowledge/ article path or contains a link to knowledge/
3. Check if a knowledge article exists covering the core technical pattern of the task

Flag tasks that:
- Involved non-trivial implementation work (not just config edits or moves)
- Have no KB article linkage

Write findings to inbox/captures/completed-task-harvest-$(Get-Date -Format 'yyyy-MM-dd').md:

## Completed Task Harvest — YYYY-MM-DD

### Need KB Article
- [task filename] — completed: DATE — reason: [one line on what pattern could be documented]

### Already Covered
- [task filename] — links to: [knowledge article]

### Skipped (logistical only)
- [task filename]

This report feeds the knowledge-gap-scan recipe when it runs.
