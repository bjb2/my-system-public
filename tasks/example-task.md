---
type: task
status: active
created: 2026-01-01
completed: null
tags: [example]
blocked-by: []
first-action: "Open ONBOARDING.md, read Phase 2, then fill in context/voice.md"
acceptance-criteria: "context/voice.md has real content in all sections (no placeholder text remaining)"
---

# Example: Complete Onboarding

This is an example task showing the frontmatter schema.

**Delete this file once you've completed onboarding.**

## What to do

- [ ] Fill in `context/voice.md` (your collaboration style and background)
- [ ] Fill in `context/projects.md` (your active projects and principles)
- [ ] Run `python setup/install.py` and configure the stop hook
- [ ] Optionally install agents from `setup/agents/`
- [ ] Delete this example file

## Notes

The `first-action:` field is one physical action, under 2 minutes, that requires no decisions before starting. If you find yourself procrastinating on a task, check if the first-action is concrete enough.

The `acceptance-criteria:` field describes what you'd observe at runtime to know the task is done. Think observable behavior, not process steps.
