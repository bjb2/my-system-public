---
type: knowledge
created: 2026-04-19
updated: 2026-04-19
tags: [#python, #supabase, #postgres, #gotcha]
---

# supabase-py: Python Client for Supabase

Use `supabase-py` instead of psycopg/SQLAlchemy when connecting to Supabase from Python scripts or FastAPI. It talks over HTTP (PostgREST) like the JS client — no connection pooling issues, no SSL negotiation, no prepared-statement conflicts.

**Wired in**: `enclave/state-enforce/`

## Install

```toml
# pyproject.toml
"supabase>=2.4"
```

## Client setup

```python
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(Path(__file__).parents[3] / ".env")

_client: Client | None = None

def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(os.environ["SUPABASE_URL"], os.environ["SERVICE_KEY"])
    return _client
```

`.env` keys:
```
SUPABASE_URL=https://<project-ref>.supabase.co   # public, safe to commit without key
SERVICE_KEY=<service-role-key>                    # from Supabase dashboard → Settings → API
```

Use the **service role key** (not anon key) for server-side scripts with full table access.

## Query patterns

```python
c = get_client()

# count rows
result = c.table("my_table").select("id", count="exact").limit(1).execute()
total = result.count

# filtered query with pagination
result = (
    c.table("my_table")
    .select("*", count="exact")
    .eq("state", "TX")
    .ilike("name", "%smith%")
    .gte("date_filed", "2024-01-01")
    .order("date_filed", desc=True, nulls_first=False)
    .range(offset, offset + limit - 1)
    .execute()
)
rows = result.data   # list of dicts
total = result.count

# single row
result = c.table("my_table").select("*").eq("id", 42).maybe_single().execute()
row = result.data  # dict or None
```

## Upsert

```python
c.table("my_table").upsert(
    rows,  # list of dicts
    on_conflict="col_a,col_b",  # natural key columns, comma-separated
).execute()
```

Batch in 500-row chunks for large inserts.

## FastAPI integration

```python
# deps.py
from supabase import Client
from state_enforce.db.client import get_client

def get_db() -> Client:
    return get_client()

# routes.py
from supabase import Client
def list_actions(db: Client = Depends(get_db)):
    result = db.table("enforcement_actions").select("*", count="exact").execute()
    return {"total": result.count, "items": result.data}
```

## Why not psycopg + SQLAlchemy? #gotcha

Direct psycopg → Supabase pooler is fragile:
- `Tenant or user not found` — wrong username format for pooler (`postgres.PROJECT_REF` required)
- `password authentication failed` — password in URL not matching or needs URL-encoding
- `DbHandler exited` — pooler can't reach upstream Postgres (OOM, cold start)
- `Circuit breaker open` — pooler tripped after repeated failures, resets after ~minutes

supabase-py avoids all of these. Use it for any Supabase-backed Python project.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
