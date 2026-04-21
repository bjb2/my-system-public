---
type: knowledge
created: 2026-04-19
updated: 2026-04-19
tags: [supabase, python, gotcha]
---

# supabase-py Query API Gotchas

## `nullsfirst` not `nulls_first` #gotcha

The `order()` method on `BaseSelectRequestBuilder` takes `nullsfirst` (no underscore), not `nulls_first`:

```python
# WRONG — TypeError: got unexpected keyword argument 'nulls_first'
query.order("date_filed", desc=True, nulls_first=False)

# CORRECT
query.order("date_filed", desc=True, nullsfirst=False)
```

This causes a 500 Internal Server Error at runtime — not a startup import error.

## Port 8000 blocked on this Windows machine

Port 8000 cannot be bound on this machine (WinError 10048 — address already in use, even with no LISTEN-state process). Likely a Windows reserved/excluded port range from Hyper-V or WSL.

**Use port 8001** for state-enforce local dev:
```
python -m uvicorn state_enforce.api.main:app --port 8001
```

Dashboard `dashboard/.env` → `VITE_API_URL=http://localhost:8001`

## Correct way to start the server (Windows)

Background `&` in bash on Windows doesn't persist after the shell exits. Use PowerShell `Start-Process`:

```powershell
Start-Process python -ArgumentList "-m", "uvicorn", "state_enforce.api.main:app", "--port", "8001" `
  -WorkingDirectory "C:\path\to\your-project" `
  -RedirectStandardError "uvicorn-err.txt"
```

## Package must be installed editable

Running `uvicorn state_enforce.api.main:app` from the repo root fails with `ModuleNotFoundError` unless the package is installed:

```
pip install -e .
```

Run once per environment.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
