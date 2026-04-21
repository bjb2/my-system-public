---
type: knowledge
created: 2026-04-19
updated: 2026-04-19
tags: [#scraping, #javascript, #cloudflare, #searchstudio, #stateenforce]
---

# Scraping JS-Rendered SearchStudio Widgets via Browser Console

SearchStudio (used on some government sites including CA DFPI) renders search results client-side via JavaScript. Plain `fetch()` won't see the cards — you need the live DOM.

## Key Gotcha: Pagination is In-Place, Not a Page Reload

The "Next" button is `<a href="#">` — clicking it triggers an in-place DOM swap, not a page navigation. The URL params (`start=10`) may update in the address bar, but the page does NOT reload. Script context survives across pagination clicks.

This means: **run the script once and let it loop** — no sessionStorage accumulator needed, no re-running per page.

## Crash Safety: localStorage Incremental Save

For large scrapes (thousands of records), save to `localStorage` after every page — it persists through browser crashes and tab closes. On restart, load existing records, rebuild a `Set` of seen URLs, and deduplicate as you re-page from the beginning.

```javascript
// Save after each page
localStorage.setItem('__key__', JSON.stringify(results));

// On startup — resume
const existing = JSON.parse(localStorage.getItem('__key__') || '[]');
const seenUrls = new Set(existing.map(r => r.url).filter(Boolean));
// ...skip cards where seenUrls.has(card.url)

// On clean finish — clear
localStorage.removeItem('__key__');
```

Grab partial results anytime from any console tab: `copy(localStorage.getItem('__key__'))`

## Pattern: Click + Poll Loop

```
scrape current cards
→ find Next button (.page-link-searchstudio-js containing "Next")
→ record first card's name
→ click Next
→ poll until first card name changes (confirms DOM swapped)
→ repeat until no Next button
→ output JSON
```

**Stop condition**: no Next button found, OR first card doesn't change within timeout (8s).

**Don't use fixed `setTimeout` alone** — poll for actual DOM change. Cards can take variable time to load.

## Running via Chrome Snippets

1. DevTools → Sources → Snippets → New snippet → paste script → Ctrl+S
2. Load the page, wait for first cards to render
3. Ctrl+Enter once — it clicks through ALL pages automatically
4. When done, results copied to clipboard

Works through Cloudflare because you're running inside your own live browser session.

## DFPI-Specific Notes

- Site: `https://dfpi.ca.gov/rules-enforcement/actions_and_orders/`
- Pagination param: `start=0`, `start=10`, etc. — PAGE_SIZE=10 confirmed
- Card selector: `.card-searchstudio-js-custom`
- Title/URL: `.card-searchstudio-js-title a`
- Published date: `.card-searchstudio-js-path`
- Body text (all fields inline): `.card-searchstudio-js-text span`
- Fields parseable from body text via regex: `Date of Initial Action`, `License or Case Number`, `Party`, document list as `MM/DD/YYYY – Type (PDF)`

## Gotcha: Existing Python Scraper

The state-enforce `DFPIScraper` class targets the old WordPress HTML table interface. The live DFPI site now uses SearchStudio — the Python scraper returns 0 results. The browser console approach sidesteps this by scraping from a real browser session.

Longer-term fix: reverse-engineer the SearchStudio API endpoint (watch Network tab when page loads — look for XHR to a search API), then call it directly from Python with proper headers/cookies.

## Script Location

`state-enforce/scripts/dfpi_browser_console.js`
