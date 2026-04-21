---
type: knowledge
created: 2026-04-19
updated: 2026-04-20
tags: [#python, #sqlalchemy, #alembic, #postgres, #gotcha]
---

# SQLAlchemy 2.0 + Alembic + Postgres Upsert Pattern

Wired in a FastAPI + Postgres project. Full stack: SQLAlchemy 2.0 ORM → psycopg3 → Postgres. Alembic for migrations.

## DB module layout

```
src/<pkg>/db/
├── __init__.py
├── models.py    # DeclarativeBase + table classes
├── session.py   # engine + session factory from DATABASE_URL env
└── upsert.py    # ON CONFLICT DO UPDATE via dialects.postgresql
```

## models.py — JSONB columns

```python
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class MyTable(Base):
    __tablename__ = "my_table"
    __table_args__ = (
        UniqueConstraint("col_a", "col_b", name="uq_natural_key"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
```

## session.py — DATABASE_URL from env

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

_engine = None
_SessionLocal = None

def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(os.environ["DATABASE_URL"])
    return _engine

def get_session():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine())
    return _SessionLocal()
```

SQLAlchemy 2.0 `Session` supports context manager: `with get_session() as s:` calls `s.close()` on exit.

## upsert.py — ON CONFLICT DO UPDATE

```python
from sqlalchemy.dialects.postgresql import insert

stmt = insert(MyRow).values(rows)
update_cols = {
    c.name: c
    for c in stmt.excluded
    if c.name not in ("id", "col_a", "col_b")  # exclude PK + natural key
}
stmt = stmt.on_conflict_do_update(
    constraint="uq_natural_key",
    set_=update_cols,
)
with get_session() as session:
    session.execute(stmt)
    session.commit()
```

`stmt.excluded` refers to the row that was blocked by the conflict — use it as the update source.

**#gotcha — CardinalityViolation: ON CONFLICT DO UPDATE command cannot affect row a second time**

Postgres rejects `ON CONFLICT DO UPDATE` when the same natural key appears more than once in the same `INSERT` batch. Deduplicate before inserting:

```python
seen: set[tuple] = set()
deduped = []
for row in rows:
    key = (row["state"], row["regulator_slug"], row["source_id"])
    if key not in seen:
        seen.add(key)
        deduped.append(row)
```

Also batch large inserts (500 rows) to avoid statement size limits:

```python
for i in range(0, len(rows), 500):
    session.execute(make_upsert_stmt(rows[i:i+500]))
session.commit()
```

## Alembic setup

### env.py — read DATABASE_URL from env

```python
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[2] / "src"))
from myapp.db.models import Base

# In env.py module body, after config = context.config:
if not config.get_main_option("sqlalchemy.url", None):   # NOT fallback=
    config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])

target_metadata = Base.metadata
```

**#gotcha**: `get_main_option()` does NOT accept a `fallback=` keyword argument — use positional second arg or it throws `TypeError`.

### alembic.ini — comment out the placeholder

```ini
# sqlalchemy.url = driver://user:pass@localhost/dbname   ← comment this out
# URL is set from DATABASE_URL env var in alembic/env.py
```

### autogenerate requires live Postgres

`alembic revision --autogenerate` connects to the DB to diff schema. If no live DB is available, write the migration by hand in `alembic/versions/0001_create_X.py`. Use `op.create_table()` with explicit columns.

### Running migrations

```bash
DATABASE_URL="postgresql+psycopg://user:pass@localhost/dbname" python -m alembic upgrade head
```

`psycopg` (v3) driver string: `postgresql+psycopg://`. For v2: `postgresql+psycopg2://`.

## Supabase connection — use the pooler URL, not direct #gotcha

Direct connection (`db.xxx.supabase.co:5432`) is unreliable from local scripts — DNS resolution fails intermittently. Use the **connection pooler** URL instead:

- Direct (unreliable for scripts): `postgresql+psycopg://postgres:PW@db.xxx.supabase.co:5432/postgres`
- Pooler (reliable): `postgresql+psycopg://postgres.xxx:PW@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

Find the pooler URL at: **Supabase dashboard → Settings → Database → Connection string → "Connection pooler" tab**.

The pooler hits Supabase's load balancer (stable DNS) rather than the specific DB host.

**psycopg3 + Supabase pooler: disable prepared statements** — psycopg3 uses server-side prepared statements by default; Supabase's transaction-mode pooler (pgbouncer) rejects them. Fix in `session.py`:

```python
_engine = create_engine(url, connect_args={"prepare_threshold": 0})
```

## With Supabase — skip running Alembic locally #gotcha

Running `alembic upgrade head` against Supabase from a local machine is unreliable (DNS failures, connection timeouts, free-tier pausing). Instead:

1. Translate the Alembic migration to raw SQL (`op.create_table` → `CREATE TABLE`)
2. Paste into **Supabase dashboard → SQL Editor** and run there
3. Keep Alembic for schema history/downgrade docs only — don't run it against Supabase directly

## Supabase free tier — project pausing #gotcha

New Supabase projects on the free tier **pause immediately** if no connection has been made. Symptom: `getaddrinfo failed` / `[Errno 11001]` DNS error even with a correct host. Fix: open the Supabase dashboard, find the project, click "Resume project", wait ~30s, retry.

## Supabase pooler — DbHandler exited + Circuit breaker #gotcha

After successfully passing auth, the pooler may return `DbHandler exited. Check logs for more information.` on the first query. This means the pooler can't reach the upstream Postgres process (OOM on Nano, internal crash, or compute restart). Dashboard may still show "Healthy" — it lags.

If you then hammer the pooler with repeated connection attempts, it trips a **circuit breaker**: `FATAL: Circuit breaker open: Unable to establish connection to upstream database`. The circuit breaker resets automatically after a few minutes — stop retrying and wait.

**The real lesson**: Direct psycopg → Supabase pooler is fragile for scripted use. Prefer `supabase-py` (PostgREST HTTP client) which uses the anon/service-role key and avoids raw Postgres connection issues entirely — same pattern as the JS client in delectable.guide.

## Verifying DATABASE_URL is set without exposing credentials

```powershell
# Show only the host+port portion — no password
$env:DATABASE_URL.Split('@')[1]
# → db.xxxx.supabase.co:5432/postgres
```

Never use `cat .env` or `print(repr(...))` to verify secrets files — prints credentials into conversation history.
