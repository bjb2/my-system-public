---
type: knowledge
created: 2026-04-19
updated: 2026-04-19
tags: [#scraping, #python, #solr, #searchstax, #stateenforce, #api]
---

# SearchStax Direct API Scraping (Solr)

SearchStax is a hosted Solr service. Many government sites using the SearchStudio front-end widget are backed by SearchStax. The API can be called directly — no browser, no Cloudflare concern.

## How to Find the Endpoint

1. Open DevTools → Network tab → filter by XHR/Fetch
2. Load or interact with the search widget on the page
3. Look for a request to `searchstax.com` or `searchcloud-*.searchstax.com`
4. The URL pattern: `https://searchcloud-<region>.searchstax.com/<account>/<index>/emselect`
5. Copy the `authorization` header value — it's a long token string prefixed with `Token `

## Auth

Header: `authorization: Token <value>`
Also include: `origin: https://<the-site-domain>` and `referer: https://<the-site-domain>/`

Store token in `.env` as `<STATE>_SEARCHSTAX_TOKEN=Token <value>`.

## Pagination (Solr-style)

```
GET /emselect?q=*:*&start=0&rows=100&language=en&wt=json
```

- `q=*:*` returns all records
- `rows=100` per page (100 is safe; try 200 if faster needed)
- `start` increments by `rows` each page
- `response.numFound` = total record count (check on first page)
- Stop when `start >= numFound` or `docs` is empty

## Response Structure

```json
{
  "response": {
    "numFound": 12450,
    "start": 0,
    "docs": [
      { "title": "...", "url": "...", "content_t": "...", ... }
    ]
  }
}
```

Field names vary by site configuration. Log `doc.keys()` on first result to discover them. Common patterns:
- `title` / `name` — respondent or document title
- `url` / `id` — detail page URL  
- `content_t` / `ss_excerpt_t` — body text
- `publication_date_dt` — ISO date string

## DFPI-Specific Config

- URL: `https://searchcloud-1-us-west-2.searchstax.com/29847/dfpiprod-1839/emselect`
- Token env var: `DFPI_SEARCHSTAX_TOKEN`
- URL env var: `DFPI_SEARCHSTAX_URL`
- Scraper: `state_enforce/scrapers/ca/dfpi.py` → `DFPIScraper._scrape_searchstax()`

## Why This Beats Browser Scraping

- No Cloudflare challenge — direct API call
- Full JSON response — no HTML parsing
- `numFound` tells you total count upfront
- 100 records per request instead of 10
- Works from any IP, any environment (CI, cloud, local)
- Stable — API contracts change less often than UI markup

## DFPI Card Data Gotcha: No Document URLs

The DFPI SearchStax results (and the browser console scraper) only return list-page card data. The `documents` array on each card contains text labels only — no PDF URLs:

```json
"documents": [
  { "date": "03/23/2026", "label": "Desist and Refrain Order" },
  { "date": "03/23/2026", "label": "Notice of Intention" }
]
```

The actual PDF links live on the individual detail page (`source_url`). To get PDF URLs you'd need a follow-up scrape that visits each `source_url` and extracts `a[href$=".pdf"]`.

**For most uses, `source_url` is sufficient** — it's the canonical record page, populated for all records, and links directly to the enforcement action with all documents.

Do NOT store document text labels in the `document_url` field (they look like strings but aren't URLs).

## Reuse Pattern for Other States

Check if other state regulator sites use SearchStudio/SearchStax. Signs:
- URL params like `searchStudioQuery=`, `model=`, `isGrid=`
- Classes like `card-searchstudio-js-*` in the HTML
- Network requests to `*.searchstax.com`

If yes: find their token via DevTools → add to `.env` → implement `_scrape_searchstax()` in that state's scraper.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
