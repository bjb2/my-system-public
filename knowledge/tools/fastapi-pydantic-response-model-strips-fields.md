---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [#fastapi, #pydantic, #gotcha, #api, standalone]
---

# FastAPI: response_model silently strips undeclared fields

When a FastAPI route uses `response_model=SomeSchema`, Pydantic filters the response to only include fields declared on that model. Fields that exist in the DB and are returned by `select("*")` will silently disappear if not listed in the schema.

No error, no warning — the field just vanishes from the JSON response.

## Example

```python
class ActionOut(BaseModel):
    id: int
    source_id: str
    # source_url NOT listed here
    document_url: str | None
```

Even though Supabase returns `source_url`, the client never sees it.

## Fix

Add the field to the schema:

```python
class ActionOut(BaseModel):
    id: int
    source_id: str
    document_url: str | None
    source_url: str | None   # ← add it
```

## Diagnosis pattern

When a field is in the DB but not showing in the frontend:
1. Check the API response directly: `curl -H "x-api-key: dev" http://localhost:8001/actions?limit=1`
2. If the field is missing from JSON → check the Pydantic schema
3. If the field is in JSON but not rendering → check the frontend component
