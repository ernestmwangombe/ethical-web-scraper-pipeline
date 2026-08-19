Ethical Web Scraper Pipeline

A resilient, polite, and deterministic backend scraping pipeline built to extract public book data, validate incoming records against a schema, handle network faults, and produce structured audit run reports.

1. Target Classification

Target Site: https://books.toscrape.com

Why: Books to Scrape is an explicit practice sandbox environment designed specifically for developers to learn and practice automated data collection without causing service degradation to real-world businesses.

Scope (How Much): First 3 catalogue pages only (containing a total of 60 book records).

Data Collected:

Title (string)

Canonical Product URL (string)

Price Text (string) and Clean Price in GBP (float)

Availability Text (string)

Rating Text (string)

Description (string or null)

Provenance Metadata: Source Page URL (string) and Fetch Timestamp (ISO 8601 UTC)

Why Appropriate: Extracting public book catalogue data from an explicitly designated sandbox for practice purposes is appropriate because it poses zero risk to production infrastructure, respects data privacy, and involves no personal data (aligning with Kenyan ODPC guidelines).

robots.txt Investigation Result: Requesting https://books.toscrape.com/robots.txt returns HTTP 404 Not Found (no robots file found). A missing robots.txt file is not implicit permission, but the site's explicit landing page confirmation serves as our operational mandate.

Mandatory Pledge: I will not reuse this code on another site without checking its rules and terms first.

2. Lane & Installation

Runtime & Stack: Node.js (v18+) using native fetch, cheerio for DOM parsing, and native fs for local file persistence.

Setup & Run Commands

# Clone repository
git clone https://github.com/ernestmwangombe/ethical-web-scraper-pipeline.git
cd ethical-web-scraper-pipeline

# Install dependencies
npm install

# Run complete pipeline (Stages 1 through 5)
npm start


3. Record Schema

Raw scraped strings are transformed into clean, validated records stored side-by-side:

| Field Name        | Type     | Required | Description                                                 |
| ---               | ---      | ---      | ---                                                         |
| title             | string   | Yes      | Title of the book                                           |
| product_url       | string   | Yes      | Absolute HTTPS canonical URL (Primary key / Identity)       |
| price_text        | string   | Yes      | Raw scraped price string (e.g., "£51.77")                   |
| price_gbp         | float    | Yes      | Clean numeric price in GBP (e.g., 51.77)                    |
| availability_text | string   | Yes      | Raw stock availability text e.g., "In stock (22 available)  |
| rating_text       | string   | Yes      | Star rating text representation (e.g., "Three")             |
| description       | string   | null \ No| Book summary text (stored as null if missing)               |
| source_page       | string   | Yes      | Provenance: Catalogue URL where link was discovered         |
| fetched_at        | string   | Yes      | Provenance: ISO 8601 UTC timestamp of HTML capture          |

4. Politeness Rules Followed

Custom User-Agent: Explicitly identifies the pipeline operator (FlyRankInternship-A9/1.0 (+https://github.com/ernestmwangombe/ethical-web-scraper-pipeline)).

Rate Limiting & Throttling: Enforces a mandatory 500ms delay between successive network calls to prevent load spikes on target servers.

Socket Timeouts: Implements a strict 5-second timeout per request to prevent hanging socket connections.

Local Response Caching: HTML responses are cached in cache/. Re-running the pipeline hits disk cache instantly, eliminating redundant network requests.

Selective Failure Handling: Automatically retries once on network timeouts or server errors (5xx), but never retries client-side errors (404 or 403).

5. Honest Limitation

CSS Selector Dependency: The parser depends on static markup selectors (article.product_pod, .product_main h1). If the target layout changes its class hierarchy, parsing will return missing fields and route records to output/errors.json.

Hard Scope Cap: Execution is intentionally capped at 3 catalogue pages (MAX_CATALOGUE_PAGES = 3).

6. Audit Proof (output/run-report.json)

Sample audit execution report generated after a completed run with fault injection:

{
  "start_time": "2026-08-19T01:50:12.345Z",
  "duration_seconds": 2.8,
  "pages_fetched": 1,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 1
}


7. Why No Headless Browser Was Needed

The target website serves fully pre-rendered HTML directly from the server (Server-Side Rendering). Because all product attributes exist directly inside the raw response body, firing up a headless browser like Puppeteer or Playwright would consume unnecessary CPU, RAM, and bandwidth without providing any technical advantage.

8. Ethics & Legal Compliance (Data Protection Framework)

Defined Legal Frameworks & Applicable Jurisdiction

Data Protection Act (DPA), 2019: The primary regulatory statute enacted by the Parliament of Kenya that governs the processing of personal data, sets out the rights of data subjects, and dictates the legal duties of data controllers and processors.

Office of the Data Protection Commissioner (ODPC): The statutory independent regulatory authority established under Section 5 of the Data Protection Act, 2019 in Kenya. The ODPC is responsible for enforcing data privacy compliance, conducting systemic data audits, registering data processors/controllers, and issuing binding regulatory directives.

Applicable Region / Jurisdiction: Republic of Kenya. The DPA 2019 and ODPC guidelines legally apply to any processing of personal data carried out within Kenya, as well as extra-territorially to any global data controller or processor handling data belonging to data subjects residing in Kenya.

Ethical Pipeline Principles

API First Principle: Always use an official API when available in preference to HTML web scraping.

No Access Controls Bypass: Never attempt to bypass logins, authentication screens, paywalls, CAPTCHAs, or IP blocks.

Data Minimization Principle: Collect only public commercial information necessary for operational needs. This pipeline strictly extracts non-personal catalog listings (book metadata and pricing) and refrains from collecting Personally Identifiable Information (PII), fully satisfying Kenyan DPA and ODPC data minimization standards.