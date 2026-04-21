---
type: knowledge
created: 2026-04-19
updated: 2026-04-19
tags: [#python, #scraping, #govtech, #gotcha, #state-enforce]
---

# State Regulator Scraping Patterns

Hard-won patterns from building the TX scraper set for StateEnforce.

## Never Trust AI-Generated Government URLs

State agency URLs generated from training data are almost always wrong. Always probe before writing a scraper:

```python
async with httpx.AsyncClient(follow_redirects=True, verify=False) as c:
    r = await c.get(url)
    print(r.status_code, r.url)  # check for redirect destination too
```

Then walk the real homepage to find the enforcement section:

```python
soup = BeautifulSoup(r.text, 'lxml')
links = [(a.text, a['href']) for a in soup.find_all('a', href=True)
         if any(k in (a.text + a['href']).lower()
                for k in ['enforce','order','action','disciplin','sanction'])]
```

## SSL Cert Issues on Government Sites #gotcha

Many state agency sites have broken SSL cert chains (self-signed, expired, missing intermediate CA). Add a `verify_ssl` class attribute to the base scraper and set `False` where needed:

```python
class TDBScraper(BaseScraper):
    verify_ssl = False  # TDB cert chain fails verification
```

Never set `verify=False` globally — only on scrapers that need it.

## TX Agency Page Structures (2026)

| Agency | URL | Structure |
|--------|-----|-----------|
| TSSB (securities) | ssb.texas.gov/news-publications/enforcement-actions-administrative | `<div>` blocks with `<h4>` PDF links, no table |
| TDI (insurance) | tdi.texas.gov/commissioner/disciplinary-orders/index.html | Single 900+ row table: Order, Date, Name |
| TDB (banking) | dob.texas.gov/laws-regulations/enforcement-orders | 5 tables (one per entity category): Number, Date, Title of Order, Name |

## TSSB Div-Block Parsing

TSSB uses semantic `<div>` blocks, not tables. Each order is a div containing:
```
Order No. LID-26-CAF-03In the Matter of the Agent Registration ofWang Chang Tsai: Reprimanded and Undertaking with Refund Ordered
```

Key patterns:
- `ORDER_RE = re.compile(r"Order No\.\s*(\S+?)(?=In the Matter|$)", re.I)`
- `MATTER_RE = re.compile(r"In the Matter of(?:\s+the\s+[\w\s,&]+?\s+of)?\s*(.+?):\s+(.+)$", re.I | re.S)`
- Filter: skip any div where `"In the Matter"` is absent — catches nav/footer links
- Date: only month-level precision from PDF path (`/sites/default/files/2026-04/ORDER.pdf`)
- TSSB paginates via `?page=N` (0-indexed). Discover last page from `<a title="Go to last page" href="?page=N">`. Admin section: 99 pages (~11/page = ~1,089 records). Criminal section: 41 pages (~451 records). Fetch page 0 first to get last page number, then loop 1..N.
- Older TSSB order blocks (pre-~2022) use a slightly different text format — the `MATTER_RE` regex extracts a word fragment instead of a full name. Needs investigation into the older block structure.

## TDI Name Cleaning

TDI names include city suffix: `"Venegas, Jennifer of Pharr"`. Strip with:
```python
OF_CITY_RE = re.compile(r"\s+of\s+[\w\s]+$", re.I)
primary = raw_name.split(";")[0].strip()  # take first respondent if multiple
clean = OF_CITY_RE.sub("", primary).strip()
```

Multi-respondent rows use semicolons: `"Nguyen Offices, PLLC. of Houston; Nguyen, Vy Thuan of Sugar Land"`.

## TDI Action Type Gap

TDI's table has no action type column — it's in the PDF only. All 900+ rows are labeled "disciplinary orders" which covers revocations, suspensions, fines, and probations. Options:
1. Accept `ActionType.OTHER` or `REVOCATION` as a conservative default (current approach)
2. Fetch and parse each PDF to get the actual type (expensive: 900 PDFs)
3. Sample 50 PDFs to build an order-number-prefix → type heuristic

## TDB Multiple Tables

TDB groups orders by regulated entity type across 5 separate tables (banks, money services, cemetery/prepaid funeral, etc.). All have the same 4-column structure. Parse all tables and stack results — the `Title of Order` field IS the action type and is well-normalized (`"Consent Order"`, `"Emergency Order to Cease and Desist"`, `"Final Order and Proposal for Decision"`).
