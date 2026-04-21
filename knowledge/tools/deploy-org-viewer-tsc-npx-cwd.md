---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [org-viewer, devops, gotcha]
---

# Deploy script: tsc check fails from my-org working directory

#gotcha

`setup/scripts/deploy-org-viewer.ps1` runs `npx tsc --noEmit --project <devRoot>/tsconfig.json` but the `npx` call resolves TypeScript from the **current working directory's** node_modules — not from devRoot. Since my-org has no node_modules, the check errors: *"Use npm install typescript to first add TypeScript to your project"*.

**Workaround**: run tsc manually from the dev root first, then deploy with `-SkipQA`:

```powershell
cd C:/Users/bryan/enclave/org-viewer-dev
npx tsc --noEmit              # verify clean
cd C:/Users/bryan/enclave/my-org
.\setup\scripts\deploy-org-viewer.ps1 -SkipQA
```

**Root fix (if desired)**: change the script to `Push-Location $devRoot; npx tsc --noEmit; Pop-Location`.
