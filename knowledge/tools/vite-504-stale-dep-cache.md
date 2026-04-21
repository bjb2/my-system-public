---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [vite, gotcha, #gotcha, frontend, debugging]
---

# Vite 504 Outdated Optimize Dep

## Symptom

Browser shows `Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)`. App fails to load in dev mode.

## Cause

Vite pre-bundles dependencies into `node_modules/.vite/` on first run. When packages are added or upgraded but the dev server's cache isn't invalidated, Vite serves stale pre-bundled modules. This is common after installing several new packages in one session without restarting the server.

## Fix

```bash
rm -rf node_modules/.vite
npm run dev
```

Vite re-optimizes deps on the next start (slightly slower first load, then normal).

## When it happens

- After `npm install <many-packages>` in one session
- After upgrading a package that was already pre-bundled
- After switching branches with different deps

## Prevention

If you install packages while the dev server is running, force a re-optimize by adding `?force` to the dev URL or restarting the server. The `rm -rf node_modules/.vite` fix is always safe.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
