# Onboarding Playbook

> **For Claude**: This is your guide when a user says the init prompt. Follow these phases in order. Ask questions, listen to answers, fill in the files, install the infrastructure.

---

## Overview

When a new user runs the init prompt, your job is to:

1. Explain what the system is and what you're about to do
2. Ask questions to understand who they are and how they think
3. Fill in their voice and project context documents
4. Install the hooks and optionally the agents
5. Clean up example/scaffold files
6. Leave them with a working system

This takes 15–30 minutes. Move at the pace of the conversation — some users want every detail, others want to get through setup fast.

---

## Phase 1: Orient and Introduce

Read `CLAUDE.md` fully before starting. Then tell the user:

- What the system is (local-first org + Claude Code integration)
- The three load-bearing pieces: architecture-as-memory, stop hook, continuity documents
- What setup involves: filling in voice/projects docs, installing hooks, optional agents
- Approximate time: 15–30 minutes

Ask: **"How much do you want to be walked through versus just getting the infrastructure installed?"**

Some users want a thorough onboarding conversation; others want to configure the infrastructure and fill in the docs themselves over time. Adjust accordingly.

---

## Phase 2: Voice Document

The voice document (`context/voice.md`) is what lets Claude collaborate well with this specific user. Without it, every session starts generic.

Ask these questions, one at a time, to build the document:

**Background and role:**
- What kind of work do you do? (day job, projects, domains you operate in)
- What's your technical background? (helps calibrate explanation depth)
- What domains are you genuinely fluent in versus areas you're learning?

**How you think:**
- Do you prefer to understand structure before touching anything, or prototype to discover?
- Are there fields you bring to bear on problems that might not be obvious? (philosophy, design, domain expertise, etc.)
- What are your epistemological commitments? (primary sources vs. secondhand? skeptical of received wisdom? particular methodologies?)

**Communication style:**
- What communication style do you prefer? (terse and direct, or exploratory and discursive?)
- What should Claude avoid? (unnecessary affirmation, excessive explanation, particular phrases?)
- What works well in your collaborations?

**ADHD or focus patterns** (ask sensitively — skip if they signal discomfort):
- Are there task patterns that tend to stall? (abstract first steps, decision fatigue, etc.)
- Is there state you tend to keep in your head that should be externalized?

Write the answers into `context/voice.md` using the scaffold structure. Keep it useful, not exhaustive — 2–3 sentences per section is better than paragraphs.

---

## Phase 3: Projects Document

The projects document (`context/projects.md`) has two parts: project threads (what you're working on and how things connect) and the principle lattice (recurring values that show up across your work).

**Current projects:**
- What are you actively working on right now? (day job, side projects, consulting, personal)
- Which of these are the primary focus?
- Are there projects that are paused but you intend to return to?

**Conceptual threads:**
- Do any of your projects share a deep concern? (e.g., two projects that both care about data sovereignty, or craft recognition, or a particular mechanism)
- Are there connections between projects you've noticed but never articulated?

**Principles:**
Walk through the starter principles in `CLAUDE.md` (Inversion, Sovereignty, Structural Correctness, Irreducibility, Single-Source, Visibility, Depth Over Broadcast) and ask:
- Which of these resonate?
- Are there principles you'd add that reflect how you actually make decisions?

Fill in the project threads section with their active projects. Keep the principle lattice — it's generic and valuable — but add their specific instantiations if they identify them.

---

## Phase 4: Current State

`context/current-state.md` is the dynamic state document — tasks, projects, inbox counts. Start it as empty scaffolding; it will fill in as they work.

If they mentioned specific active tasks during the conversation, create those task files now with proper frontmatter and add them to the current state summary.

---

## Phase 5: Install Hooks

The stop hook is essential. Without it, maintenance depends on discipline — which means it won't happen consistently.

Run the installer:

```bash
python setup/install.py
```

This will:
1. Copy hooks to `~/.claude/hooks/`
2. Print the `settings.json` configuration to add

Walk them through adding the configuration:

- **macOS/Linux**: `~/.claude/settings.json`
- **Windows**: `%USERPROFILE%\.claude\settings.json`

The key block to add:
```json
{
  "hooks": {
    "Stop": {
      "command": "python \"/path/to/.claude/hooks/maintenance-check.py\"",
      "timeout": 5000
    }
  }
}
```

Tell them to restart Claude Code after saving.

**Verify:** End a test session with `/stop`. They should see the maintenance checklist appear.

---

## Phase 6: Install Agents (Optional)

Ask: **"Do you want to set up specialized agents? They're useful but not required to start."**

If yes, explain the agents in `setup/agents/`:
- `architect` — for planning and design work
- `reviewer` — for code review
- `distiller` — for extracting knowledge worth capturing after a big session
- `explorer` — for understanding a codebase before making changes
- `observer` — for weekly audits (requires a scheduled trigger)

Installation: create `~/.claude/agents/` and add JSON files per [setup/README.md](setup/README.md).

---

## Phase 7: Clean Up Scaffolding

Remove or replace placeholder content:

- `tasks/README.md` — keep, it's documentation
- Any example task files — ask if they want them as reference or prefer to delete
- `templates/` — keep, useful for creating new files

Ask if they have any immediate tasks to capture. If yes, create them now with proper frontmatter.

---

## Phase 8: Verify and Wrap Up

Quick verification checklist:

- [ ] `context/voice.md` — filled in with their actual info
- [ ] `context/projects.md` — has their real projects and principle resonances  
- [ ] `context/current-state.md` — reflects reality (or blank if starting fresh)
- [ ] Stop hook installed and verified (or confirmed they'll do it after restart)
- [ ] Org viewer working (can run `org-viewer.exe`)

Close by telling them:
- The system improves as they use it — the more they capture, the faster Claude orients
- The stop hook will prompt them to maintain the system automatically
- They can change anything — folder names, tag taxonomy, inbox categories, principles
- `CLAUDE.md` is the ground truth; update it when they change something structural

---

## Notes on Pace and Tone

- Some users want philosophical depth on "why does this work" — engage with it, it often contains real design insight
- Some users just want to get through setup — move faster, offer to fill in details later
- If they have ADHD, the `first-action:` task field and the stop hook are especially important — explain the activation energy pattern from `knowledge/system/first-action-adhd-pattern.md`
- If they seem skeptical of the voice doc, explain that it's primarily for Claude, not for them — it makes every future session start better calibrated
