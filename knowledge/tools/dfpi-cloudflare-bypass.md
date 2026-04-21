---
type: knowledge
created: 2026-04-19
updated: 2026-04-20
tags: [#state-enforce, #cloudflare, #scraping, #dfpi, #cloudscraper]
---

# DFPI Cloudflare Bypass: What We Tried

## The Problem

`dfpi.ca.gov` uses Cloudflare Bot Management (the strict tier, not just a JS challenge). Every route is blocked: the HTML enforcement table, the monthly summary index, and even direct PDF CDN URLs all return 403 with a "Just a moment..." challenge page.

Blocking is IP-class-agnostic from local testing — residential IPs weren't tested exhaustively, but the CF JS challenge does not auto-resolve for any automated browser approach tried.

## Approaches Tried

### 1. Plain httpx with browser User-Agent

**Result: 403 Forbidden**CF blocks before JS runs; no browser fingerprint is presented.

### 2. Playwright headless Chromium + `navigator.webdriver` patch

Patched:

- `navigator.webdriver → undefined`
- `navigator.plugins → [1,2,3,4,5]`
- `navigator.languages → ['en-US','en']`
- `window.chrome = { runtime: {} }`
- `--disable-blink-features=AutomationControlled` launch arg

**Result: CF challenge page, table never appears** (30s timeout). CF's canvas/WebGL fingerprinting detects headless Chromium regardless.

### 3. `channel='chrome'` (real installed Chrome, headless)

**Result: Same CF block.** Even real Chrome headless is caught.

### 4. Camoufox (Firefox-based, anti-fingerprint)

`pip install camoufox[geoip]` + `python -m camoufox fetch`

**Result: CF challenge page, table never appears**.DFPI's Bot Management appears to block Firefox fingerprints too, or the CF challenge requires GPU-based canvas rendering not available headlessly.

### 6. cloudscraper (pip install cloudscraper)

`cloudscraper` is a Python library designed to solve Cloudflare's legacy IUAM JS challenge by executing it locally via js2py.

**Result: 403 Forbidden — no effect.**

The library was last substantially updated \~2022. DFPI uses Cloudflare Bot Management, which requires actual browser rendering + behavioral fingerprinting. `cloudscraper` cannot solve Turnstile or Bot Management challenges. Tested with chrome/windows, firefox/windows, chrome/linux, chrome/darwin profiles — all returned 403.

**Also confirmed on MO SOS:** `sos.mo.gov/securities/orders` returns "Attention Required!" (Cloudflare Turnstile managed challenge) — not the legacy JS challenge. `cloudscraper` fails there too.

**Takeaway:** `cloudscraper` is only viable against Cloudflare's old JS challenge (IUAM), which almost no site uses anymore. Any site using Turnstile, Bot Management, or managed challenges is immune to it.

### 5. SearchStax API with harvested token

DFPI uses SearchStax as its search backend. The endpoint:

```
https://searchcloud-1-us-west-2.searchstax.com/29847/dfpiprod-1839/emselect
  ?q=*&fq=ss_content_type_s:"Actions and Orders"&sort=ss_published_date_dt desc
```

This bypasses Cloudflare entirely but requires an auth token. Token `cd1f7b503538c28008a908b324dcc2e8c60a4a3e` was tried as both Bearer and `api_key` query param — both returned `{"message":"Unauthorized"}`.

The token needs to be extracted from the page's JavaScript payload (likely embedded as a static read-only search key).

## Current Code State

`DFPIScraper.scrape()` in `state-enforce/src/state_enforce/scrapers/ca/dfpi.py`:

1. **Primary**: `_scrape_with_flaresolverr()` — sends request to a locally-running Flaresolverr instance (Docker) which solves the CF challenge and returns HTML. Configure via `FLARESOLVERR_URL` env var (default `http://localhost:8191`).

   ```
   docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
   ```

2. **Fallback**: `_scrape_html()` — plain httpx, works if CF doesn't challenge (residential IP, or if CF config changes).

## Paths Forward

### Option A: Browser DevTools token extraction (most likely to work fast)

Open `https://dfpi.ca.gov/rules-enforcement/actions_and_orders/` in Chrome DevTools → Network tab → filter for `searchcloud` or `emselect` → find the Authorization header or `api_key` param in the request. The SearchStax key is probably a static JS variable embedded in the page source. Once found:

- Add as `SEARCHSTAX_KEY` constant in dfpi.py
- Rewrite `scrape()` to hit the JSON API directly (no HTML parsing, no CF friction)

### Option B: Browser script cookie harvest

Manually visit the DFPI page in a real browser (CF sets a clearance cookie), export `cf_clearance` + `__cf_bm` cookies, inject them into httpx session. Cookies last \~30 minutes to hours depending on CF config. Not reliable for unattended cloud deploys but viable for one-off bulk imports.

### Option C: Flaresolverr sidecar (already wired in code)

Run Flaresolverr as a Docker container alongside the scraper service. It uses headless Chrome with session persistence and CF cookie reuse. Works for cloud deploys (Railway, fly.io). Latency \~10-30s per page.

### Option D: Scraping API service

ScraperAPI, Zyte API, or BrightData all handle CF out of the box. Requires API key + monthly cost (\~$49+/mo). Drop-in httpx replacement.

## Related

- \[\[state-enforce/src/state_enforce/scrapers/ca/dfpi.py\]\]
- \[\[projects/state-enforce/README\]\]