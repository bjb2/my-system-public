---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [architecture, sovereignty, performance, maps, delectable-guide]
---

# Static JSON Map Data Pattern

Pre-compile all map/award data to static JSON files at build time. Zero runtime API calls for the map itself — only user-specific data (auth, lists, notes) hits the database.

## Pattern

```
offline pipeline → static JSON chunks → Vercel CDN → client
                                                   ↕
                                          Supabase (user layer only)
```

**Offline pipeline steps (delectable.guide):**
1. Pull source data (JBF, Michelin, Texas Monthly)
2. Geocode via Photon
3. Enrich with Google Places + Yelp (results cached to minimize API cost)
4. Normalize categories
5. Split into priority-ordered chunks for fast initial paint

## Why

- **Performance**: map loads instantly from CDN; no API latency at render
- **Cost**: Google Places / Yelp calls happen once offline, not per user visit
- **Sovereignty**: data lives in your repo/files, not locked in a third-party service
- **Reliability**: map works even if enrichment APIs go down

## Tradeoff

Data is as fresh as the last pipeline run. Fine for award data (annual cadence). Wrong for anything requiring real-time freshness.

## Related

- [[projects/delectable-guide/README]] — project this pattern comes from
- Sovereignty principle — local data ownership over runtime API dependency
