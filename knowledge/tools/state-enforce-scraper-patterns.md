---
type: knowledge
created: 2026-04-19
updated: 2026-04-20
tags: [#state-enforce, #scraping, #gotcha]
---

# State Enforce: Scraper Patterns & Gotchas

## Older CMS Entries Lack Colon-Separated Summary

**Context:** TSSB (and likely other state agencies) changed their CMS format around 2021–2022. Older entries omit the `: summary` after the respondent name.

**New format:** `"In the Matter of the Agent Registration of Wang Chang Tsai: Reprimanded..."`

**Old format:** `"In the Matter of the Agent Registration of Frank Richardson Minichiello"`

**Symptom:** `respondent_name` comes back as a single-word fragment ("jon", "kelly") because the primary regex fails and falls back to `link.get_text()` — which returns the PDF anchor text.

**Fix:** Layer two regexes — one requiring `: summary`, one for name-only:

```python
# New format (requires colon + summary)
MATTER_RE = re.compile(
    r"In the Matter of(?:\s+the\s+[\w\s,&]+?\s+of)?\s*(.+?):\s+(.+)$",
    re.I | re.S,
)
# Old format — no colon, name appears at end of "In the Matter of the X of NAME"
MATTER_NAME_ONLY_RE = re.compile(
    r"In the Matter of\s+the\s+[\w\s,&]+?\s+of\s+([A-Z][^\n:]+?)(?:\s*$)",
    re.I,
)
```

Try `MATTER_RE` first; fall back to `MATTER_NAME_ONLY_RE`; last resort is `link.get_text()`.

**Why the fallback matters:** Silent failures return garbage data (a first name or order number fragment) that passes all type checks and reaches the database. Validate `len(respondent_name) < 5` as a canary in QA.

## TSSB Full Text Structure

PDF links live at `/sites/default/files/YYYY-MM/ORDER.pdf`. The div wrapping the `<h4>` link contains the full order text. Use `block.get_text(separator=" ", strip=True)` on the grandparent of the `<a>` tag.

Date precision is month-level only (parsed from PDF path). Set `day=1` and document this limitation on the model.

## FL OFR: Scanned PDFs + Two-Source Strategy

**Context:** FL OFR submits orders to DOAH as Kyocera-scanned images — no text layer. Respondent names are not available without OCR.

**Data sources:**

1. **DOAH FLAIO listing** (`doah.state.fl.us/FLAIO/OFR/`) — \~6800 orders from 2015–present on a single page (no pagination). Provides `source_id` (case number like `OFR132025`), `date_filed` (ISSUED column, M/D/YYYY), `action_type` (TYPE column), subject category, PDF URL.
2. **OFR press releases** (`flofr.gov/news/press-releases/[n]`) — 5 pages, \~65% enforcement-related. Provides respondent names extracted from titles. Pagination via numeric path segment (`/2`, `/3`...).

**Gotcha — nested layout tables:** The DOAH page has 7 `<table>` elements for layout. The data table is NOT `soup.find("table")` (returns a 1-row header wrapper). Search for the table whose first row contains `"CASE #"`:

```python
for t in soup.find_all("table"):
    if t.find("tr") and "CASE #" in t.find("tr").get_text():
        table = t; break
```

**Gotcha — press release date location:** Date is in the *grandparent* of the `<a>` link, not the parent. The link is inside a `<p>` (parent), and the `<p>` is inside a block div that also has the date text (grandparent).

**Gotcha — real.flofr.gov requires login:** The OFR search portal redirects to login; not publicly accessible. DOAH + press releases are the only unauthenticated sources.

**Name extraction from press release titles:** Use layered patterns — "with X", "against X", "order to X", "to Stop X", name-at-start. Dollar signs in titles (e.g. `$180 Million`) break character class matching if `$` is not in the class or terminators.

**OCR path — implemented.** Script: `scripts/enrich_fl_ocr.py`. Stack: `pymupdf` (renders PDF page to PIL image, no poppler needed on Windows) + `pytesseract` (Tesseract wrapper). Install: `pip install pymupdf pytesseract pillow` + Tesseract from UB-Mannheim Windows installer.

**FL OFR order format — "In Re:", NOT "IN THE MATTER OF":**

```
STATE OF FLORIDA
OFFICE OF FINANCIAL REGULATION

In Re:

PRIME TIME MORTGAGE CORP, and    Case Number: 132025
ROMAN MITROS,

    Respondents.

                     FINAL ORDER
```

Key parsing gotchas:

- Header is "In Re:" (Latin), not "IN THE MATTER OF" (common in TX/other states)
- Case number is right-justified on the same line as the first respondent name — strip with `[^\n]*` not `.*` or it eats the subsequent respondent lines
- Multi-respondent names span multiple lines joined by "and" (lowercase)
- Because "and" is lowercase, `name.upper() == name` is False for multi-respondent → title-casing is correctly skipped
- "Respondent." (singular) vs "Respondents." (plural) — pattern must match both
- Entity suffixes (LLC, INC, CORP) survive title-casing via explicit replacement after `.title()`

**Extraction regex:** Capture everything between "In Re:" and "Respondent(s)." then clean:

```python
re.compile(r"In\s+Re\s*:([\s\S]+?)\n\s*Respondents?\.", re.I)
```

Fallback: first name line stopping at 4+ spaces (case number column).

## NY DFS: Drupal Views Table + Title-Based Name Extraction

**Context:** NY DFS (`dfs.ny.gov`) is a combined regulator covering banking, securities, and insurance. One scraper covers all three via separate listing pages.

**Three sections scraped:**

- `/industry_guidance/enforcement_actions` — Banking/Financial (111 actions)
- `/industry_guidance/enforcement_actions_mortgage` — Mortgage (198 actions)
- `/industry_guidance/enforcement_actions_Insurance` — Insurance (146 actions)

**Not scraped (v1):** Insurance Licensee Disciplinary Summaries (`/Industry_guidance/disciplinary_actions`) — monthly PDF reports, no HTML data; Public Notices for Independent Monitors.

**HTML structure:** Drupal Views table — three columns: `Date | Action (linked) | Category`. Single page per section, no pagination.

**Date format:** Mostly `YYYY-MM-DD`, but older entries use non-zero-padded format `2015-6-26`. Regex must use `\d{1,2}` for month/day, not `\d{2}`.

**Link/slug patterns:**

- New: `/industry-guidance/enforcement-discipline/ea20250814-healthplex`
- Old: `/industry_guidance/enforcement_discipline/ea20231004_sa_randall`
- Older PDF: `/system/files/documents/2020/07/ea20200622_sigma_funding_corp_1.pdf`

Slug as source_id: extract `ea\d{6,8}[-_][^/\s]+` from href.

**Respondent name extraction from action title:** Layered `end-of-string` patterns:

```python
_NAME_TO_RE     = re.compile(r"\bto\s+(.+)$", re.I)    # "Consent Order to X"
_NAME_WITH_RE   = re.compile(r"\bwith\s+(.+)$", re.I)  # "Settlement Agreement with X"
_NAME_AGAINST_RE = re.compile(r"\bagainst\s+(.+)$", re.I)
```

Strip trailing `.` from result. Validate `len(name) >= 3`.

**Action type additions for DFS:** Standard TSSB patterns mostly cover it. Additional:

- `"Settlement Agreement with X"` → CONSENT_ORDER (add `settlement.agreement`)
- `"Closeout Agreement with X"` → CONSENT_ORDER (add `closeout.agreement`)
- `"Consent to X"` (start of string) → CONSENT_ORDER (pattern: `^Consent\s+to\s+`)
- `"Statement of Charges and Notice of Hearing"` → OTHER (no match, falls through naturally)

**Category field:** Sector labels (Banks and Trusts, Cybersecurity, Virtual Currency, Money Transmitters, Debt Collection, Mortgage, etc.) — useful for display/filtering but not action type.

## NY DFS: Insurance Licensee Disciplinary Summaries (Monthly PDFs)

**Source:** `https://www.dfs.ny.gov/Industry_guidance/disciplinary_actions`

64 PDFs (2021–present), \~12/year. URL slugs: `/Industry_guidance/disciplinary_actions/da{YYYYMMDD}`.

**Estimated volume:** \~15–20 entries per PDF × 64 PDFs ≈ **\~960–1,280 additional records** not yet scraped.

**PDF structure (confirmed from May 2025 sample):**

Each PDF is organized into sections by action category (`STIPULATIONS/CONSENT ORDER`, `REVOCATIONS`, `DENIALS`, etc.), then by **Region** sub-headers (`Region: Glens Falls`, `Region: Nassau`, `Region: Queens`, `Region: Out of State`, etc.).

Each entry is a **2-row table block**:

- Row 1: 3-column header — `LICENSEE | ADDRESS | PENALTY`
- Row 2: 3-column data — name+type | address | penalty amount
- Row 3: full-width narrative paragraph (description of violation + stipulation approval date)

**Name cell format:**

```
William John Friskey
(Agent)
```

Name on line 1, license type in parentheses on line 2. Multi-respondent entries stack vertically within the same cell with shared address.

**Penalty values:** `$1,250 fine`, `$450,000 fine`, `License Revoked`, `License Suspended` — parse dollar amount from fine; map revoke/suspend to action type.

**Date extraction:** Use PDF issued date (top of document) as primary `date_filed`. Stipulation approval date (`[Stipulation approved March 26, 2025.]`) is in the narrative — extractable if day-level precision needed.

**Source ID scheme:** `da{YYYYMMDD}-{n:02d}` where slug comes from URL and n is 1-based entry index within the PDF.

**pdfplumber table extraction:** Use `page.extract_tables()`. The 3-column LICENSEE/ADDRESS/PENALTY tables are consistent. Skip rows where column count ≠ 3, or where header row text matches `["LICENSEE", "ADDRESS", "PENALTY"]`. Narrative paragraphs appear as single-cell rows — extract as `summary`.

**Action type mapping from penalty text:**

```python
if "revok" in penalty.lower(): REVOCATION
elif "suspend" in penalty.lower(): SUSPENSION
elif "$" in penalty: FINE (parse amount)
else: OTHER
```

## WA DFI: Dual-Format Pages + TLS Block

**Context:** `dfi.wa.gov` blocks httpx with 403 (TLS fingerprint) — same as NY OAG. Use curl-cffi chrome120.

**Two page formats:**

**Current year** (`/securities-enforcement-actions`): Drupal View with an HTML table. The table exists in the DOM but `<tbody>` is empty — data rows have `class="data-row"` and live outside `<tbody>` as siblings. Use `soup.find_all("tr", class_="data-row")`. Columns: Order Number | Respondents | Type | Act | Date Entered (MM/DD/YYYY) | Summary.

**Archive years 2002–2024** (`/securities-enforcement-actions/securities{YYYY}`): Rich-text `<p>` pair format, no table.

- Entry header `<p>`: `"{Respondents} - <a href=pdf>ORDER#</a> - {Type}"` (2024 modern) or `"{Respondents} --ORDER#-- {Type}"` (2002 old)
- Entry summary `<p>`: `"On [Month] [Day], [Year], the Securities Division..."`
- Entries separated by `<hr/>`

**Multiple identical body divs:** Each archive page has 3–4 `div.field--name-body.field__item` divs. Only one contains PDF links. Selector: iterate all, pick the first with `.find("a", href=lambda h: h and ".pdf" in h)`.

**Cross-reference paragraphs:** Old 2002 entries reuse the same PDF link in narrative paragraphs ("See SDO-011-01.pdf for a copy..." or "On July 27, 2001, the Securities Division charged..."). Skip paragraphs whose text matches:

```python
re.match(r"^(?:see|on\s+\w+|the\s+securities|in\s+the\s+matter)", text, re.I)
```

**varchar(500) truncation:** Multi-entity respondent names (e.g., "Entity A; Entity B; Entity C; Entity D...") can exceed 500 chars. Add `[:500]` truncation in upsert.py.

**Archive year range:** 2002–2024. Link format confirmed from current page: `/securities-enforcement-actions/securities{YYYY}`.

## State Scraper Difficulty Map (surveyed 2026-04-20)

Live curl survey of enforcement pages across \~15 states. Use this before starting a new state to avoid wasting time on blocked sites.

### Easy — HTML table, no bot protection

- **WA — DFI Securities** — `dfi.wa.gov/securities-enforcement-actions` — **COMPLETE (2202 records).** Dual-format: current year = Drupal View table with `class="data-row"` rows outside `<tbody>`; archives 2002–2024 = rich-text `<p>` pairs. curl-cffi required (TLS block). See "WA DFI" section above for full parsing patterns.

### Easy — HTML table, Cloudflare JS challenge (residential IP may bypass)

- **MO — SOS Securities** — `sos.mo.gov/securities/orders` — all records on one scrollable HTML table (`id="orders"`), no pagination; two targets: `/orders` + `/administrativeorders`; PDF URLs follow `AP-YY-NN` case number pattern. **Gotcha:** Site uses Cloudflare Turnstile managed challenge ("Attention Required!" — NOT the legacy "Just a moment" JS challenge). Fails for: curl-cffi Chrome impersonation, all cloudscraper browser profiles. Residential IP is the best viable path; alternatively Flaresolverr or a scraping API proxy. Scraper logic is built and tested against synthetic HTML.

### Medium — JS-rendered or passive CAPTCHA

- **OR — DFR** — `dfr.oregon.gov/enforcement/Pages/securities-enforcement-orders.aspx` — SharePoint, likely JS-rendered; curl returned empty; try ListData.svc or CAML endpoint (same pattern as FL DOAH)
- **UT — Division of Securities** — `commerce.utah.gov/securities/enforcement-actions/` — WordPress; reCAPTCHA v3 (passive only, no challenge wall); records appear JS-rendered but likely accessible

### Hard / Blocked — do not attempt without proxy

- **CA — DFPI** — Cloudflare Bot Management (all approaches blocked; SearchStax API path unresolved)
- **GA — SOS** — Cloudflare managed challenge
- **AZ — SOS** — Cloudflare managed challenge
- **MA — Securities Division** — Imperva/Incapsula
- **CO — SOS** — Cloudflare
- **OH — Division of Securities** — Cloudflare (enforcement URLs also 404)
- **NJ — Consumer Affairs** — Incapsula
- **MN — Commerce** — Radware Bot Manager + hCaptcha
- **PA — PSC** — No response / dead

### Build Order After IL

WA → MO → OR (verify endpoint) → UT → next survey round

## TLS Fingerprinting: Sites That Block Python httpx (curl-cffi Fix)

**Symptom:** `httpx` gets a 403 with a small HTML error page. `curl` on the same URL returns 200. Adding browser headers doesn't help.

**Root cause:** Server WAF inspects the TLS ClientHello (JA3/JA4 fingerprint). Python's OpenSSL stack has a different hash than Chrome/Firefox. The WAF blocklists non-browser TLS fingerprints regardless of HTTP headers.

**Fix:** `curl-cffi` — impersonates real browser TLS stacks via BoringSSL:

```python
from curl_cffi.requests import AsyncSession

async with AsyncSession(impersonate="chrome120") as session:
    resp = await session.get(url, timeout=30)
    resp.raise_for_status()
    html = resp.text
```

**Install:** `pip install curl-cffi`\
**Confirmed on:** NY OAG (`ag.ny.gov`) — httpx=403, curl-cffi chrome120=200.\
**Other targets:** `chrome110`, `firefox117`, `safari17_0` — try chrome120 first.\
**When NOT needed:** Most state agencies (DFS, TSSB, FL OFR) work fine with httpx + browser headers. Use curl-cffi only when httpx→403 but curl→200.

## Related Files

- `enclave/state-enforce/src/state_enforce/scrapers/tx/tssb.py`
- `enclave/state-enforce/src/state_enforce/scrapers/fl/ofr.py`
- `enclave/state-enforce/src/state_enforce/scrapers/ny/dfs.py`
- `enclave/state-enforce/src/state_enforce/scrapers/ny/oag.py`