Ethical Web Scraper Pipeline

A resilient, ethical backend scraping pipeline built to extract web data politely, validate incoming records against strict schemas, and generate audit run reports.

Target Classification

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