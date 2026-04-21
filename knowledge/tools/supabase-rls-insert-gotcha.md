---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [supabase, postgres, rls, #gotcha]
---

# Supabase RLS: `FOR ALL USING` Does Not Cover INSERT

## The Bug

```sql
-- WRONG — insert silently fails or behaves unexpectedly
create policy "owner full access"
  on documents for all
  using (auth.uid() = owner_id);
```

`USING` applies to row visibility (SELECT, UPDATE existing rows, DELETE). For INSERT, Postgres needs a `WITH CHECK` clause. When only `USING` is specified with `FOR ALL`, INSERT without RETURNING has no check applied — but INSERT with RETURNING (what Supabase's `.insert().select()` sends) checks USING against returned rows, which can still fail in edge cases.

## The Fix

Split into explicit per-operation policies:

```sql
create policy "owner select" on documents for select
  using (auth.uid() = owner_id);

create policy "owner insert" on documents for insert
  with check (auth.uid() = owner_id);  -- WITH CHECK, not USING

create policy "owner update" on documents for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "owner delete" on documents for delete
  using (auth.uid() = owner_id);
```

## Symptom

User is authenticated, insert call returns no JS error but `.data` is null and navigation doesn't happen. Error only visible if you explicitly log `error` from the Supabase response — always surface insert errors in UI during development.

## Rule

Never use `FOR ALL USING (...)` alone. Always write separate `INSERT ... WITH CHECK` policies.

---

# Supabase RLS: Cross-Table Policy Recursion

## The Bug

Enabling RLS on two tables that reference each other in policies causes infinite recursion:

```
SELECT documents → "shared read" checks document_shares
  → document_shares RLS → "shares access" checks documents
    → documents RLS → "shared read" checks document_shares → ∞
```

Error: `infinite recursion detected in policy for relation "documents"`

## The Fix

Break the cycle with a `security definer` function. It queries the target table bypassing RLS, so the recursive trigger never fires:

```sql
create or replace function user_owns_document(doc_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from documents where id = doc_id and owner_id = auth.uid()
  )
$$;

-- Use it in the dependent table's policy instead of a raw subquery
create policy "shares owner manage"
  on document_shares for all
  using (user_owns_document(document_id))
  with check (user_owns_document(document_id));
```

## Rule

**Both directions** of any cross-table reference in RLS policies must go through `security definer` functions. Fixing only one direction still causes recursion — the other direction re-enters the cycle.

```sql
-- Break documents → document_shares direction
create or replace function is_shared_with_me(doc_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from document_shares where document_id = doc_id and user_id = auth.uid())
$$;

-- Break document_shares → documents direction  
create or replace function user_owns_document(doc_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from documents where id = doc_id and owner_id = auth.uid())
$$;

-- Now policies use functions, never raw subqueries across tables
create policy "shared read" on documents for select using (is_shared_with_me(id));
create policy "shares owner manage" on document_shares for all
  using (user_owns_document(document_id))
  with check (user_owns_document(document_id));
```

When debugging: if you still see the error after adding one function, you have a second cross-reference you haven't covered yet.
