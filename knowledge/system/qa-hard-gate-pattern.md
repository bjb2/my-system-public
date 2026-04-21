---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [#devops, #correctness, #sovereignty]
---

# QA Hard Gate Pattern

## Problem

Static checks passing (tsc, cargo check) doesn't mean the feature works at runtime. Common failure modes:

- Feature coded, static checks clean, but exe never rebuilt → old binary deployed
- Runtime behavior broken in a way the type system can't catch (Tauri config flag missing, wrong event name, wrong element selector)
- "Done" declared after coding, before any manual verification

## Pattern

Three-layer gate before every deploy:

1. **Static checks** — `tsc --noEmit` + `cargo check`. Automated, hard fail. Catches type errors and compile errors before any human time is spent.

2. **Build freshness check** — compare exe `LastWriteTime` vs newest `.ts`/`.tsx`/`.rs` source file. If any source file is newer than the exe, the build is stale. Blocks deploy automatically. Prevents the "coded but not built" failure mode.

3. **Manual verification confirmation** — after static + freshness pass, human confirms `"Did QA pass? (y/n)"`. Accepts `y` only. Forces a runtime verification step that no automated check can substitute.

## Key insight

The gap isn't between "wrong code" and "right code" — it's between "code written" and "feature verified at runtime." Static analysis closes the first gap. Only human observation closes the second. The gate makes that observation mandatory rather than optional.

## Implementation (org-viewer-dev)

- `setup/scripts/deploy-org-viewer.ps1` — runs all three layers, blocks deploy on any failure
- `setup/agents/qa-reviewer.md` — agent that generates a focused 3–5 item manual checklist specific to what changed (not generic "verify the feature works")
- `acceptance-criteria:` frontmatter field in tasks — single-sentence observable behavior that confirms the task is done; feeds directly into the QA checklist

## When to apply

Any project where:
- Build step exists between source and artifact (compiled languages, bundled frontends)
- Runtime behavior can diverge from what static analysis guarantees
- "Done" has historically been declared too early

## Related

- [deploy-org-viewer.ps1](../../setup/scripts/deploy-org-viewer.ps1) — implementation
- [qa-reviewer.md](../../setup/agents/qa-reviewer.md) — QA agent
- [tauri-react-compile-checks.md](../tools/tauri-react-compile-checks.md) — tsc + cargo check protocol
