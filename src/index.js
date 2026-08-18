const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio'); // External library for HTML DOM parsing (Deep Packet Inspection)

// Global Configuration Constants
const START_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const USER_AGENT = 'FlyRankInternship-A9/1.0 (+https://github.com/ernestmwangombe/ethical-web-scraper-pipeline)';
const REQUEST_TIMEOUT_MS = 5000; // 5-second network socket timeout
const RATE_LIMIT_DELAY_MS = 500; // 500ms delay for traffic shaping (politeness)
const MAX_CATALOGUE_PAGES = 3;   // Hard scope limit for catalogue pagination

/**
 * Ensures local storage directories exist before streaming payloads.
 * Systems Analogy: Formatting network mounts and storage volumes before receiving network logs.
 */
function initializeEnvironment() {
  const baseDir = path.resolve(__dirname, '..');
  const cacheDir = path.join(baseDir, 'cache');
  const outputDir = path.join(baseDir, 'output');

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

/**
 * Utility: Halts execution for specified milliseconds.
 * Systems Analogy: Traffic Shaping / Throttling. Prevents script from acting like a DDoS attack.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches and caches raw HTML payload for a given URL with failure tolerance.
 * Systems Analogy: Edge Proxy Caching with TTL verification and fault isolation.
 * Rules:
 *  - Retries once on timeout or 5xx server error.
 *  - NEVER retries 404 (Not Found) or 403 (Forbidden).
 *  - Returns success/failure status object instead of exiting process.
 */
async function fetchAndCachePage(url, cacheFilename, stats) {
  const cachePath = path.join(__dirname, '..', 'cache', cacheFilename);
  const startTime = performance.now();

  // 1. Check Local Cache Partition (CACHE HIT)
  if (fs.existsSync(cachePath)) {
    const cachedData = fs.readFileSync(cachePath, 'utf-8');
    const duration = (performance.now() - startTime).toFixed(2);
    const fetchedAt = fs.statSync(cachePath).mtime.toISOString();
    stats.cacheHits++;
    console.log(`[CACHE HIT] Loaded: ${cacheFilename} (${duration} ms)`);
    return { success: true, htmlContent: cachedData, wasCached: true, duration, fetchedAt };
  }

  // 2. Local Cache Miss -> Initiate Network Call with max 1 retry on timeout/5xx
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      if (attempt === 1) stats.networkRequests++;
      console.log(`[FETCH] Requesting URL (Attempt ${attempt}/${maxAttempts}): ${url}`);

      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Do NOT retry on 404 (Not Found) or 403 (Forbidden)
      if (response.status === 404 || response.status === 403) {
        console.warn(`[WARN] HTTP ${response.status} received for ${url}. Not retrying.`);
        return { success: false, status: response.status, error: `HTTP ${response.status}` };
      }

      // Retry once on 5xx Server Errors
      if (response.status >= 500 && attempt < maxAttempts) {
        console.warn(`[RETRY] Server error HTTP ${response.status} on attempt ${attempt}. Waiting 1s before retry...`);
        await delay(1000);
        continue;
      }

      if (response.status !== 200) {
        return { success: false, status: response.status, error: `HTTP ${response.status}` };
      }

      const htmlContent = await response.text();
      const fetchedAt = new Date().toISOString();
      fs.writeFileSync(cachePath, htmlContent, 'utf-8');

      const duration = (performance.now() - startTime).toFixed(2);
      console.log(`[FETCH SUCCESS] Saved to cache: ${cacheFilename} (${duration} ms)`);
      return { success: true, htmlContent, wasCached: false, duration, fetchedAt };

    } catch (error) {
      clearTimeout(timeoutId);
      const isTimeout = error.name === 'AbortError';
      const errorMsg = isTimeout ? 'Network Timeout' : error.message;

      if (attempt < maxAttempts) {
        console.warn(`[RETRY] Fetch failed (${errorMsg}). Retrying attempt ${attempt + 1}/${maxAttempts}...`);
        await delay(1000);
      } else {
        console.error(`[ERROR] Fetch permanently failed for ${url}: ${errorMsg}`);
        return { success: false, status: null, error: errorMsg };
      }
    }
  }

  return { success: false, error: 'Unknown fetch failure' };
}

/**
 * Stage 2: Extracts individual book URLs and the 'next' page routing pointer.
 * Systems Analogy: Routing table discovery scan.
 */
function extractCatalogueLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const bookItems = [];

  $('article.product_pod h3 a').each((_, element) => {
    const relativeHref = $(element).attr('href');
    if (relativeHref) {
      const absoluteUrl = new URL(relativeHref, baseUrl).href;
      bookItems.push({
        url: absoluteUrl,
        sourcePage: baseUrl
      });
    }
  });

  let nextUrl = null;
  const nextRelativeHref = $('li.next a').attr('href');
  if (nextRelativeHref) {
    nextUrl = new URL(nextRelativeHref, baseUrl).href;
  }

  return { bookItems, nextUrl };
}

/**
 * Stage 3: Deep Packet Inspection: Extracts raw product record from HTML detail page.
 * Systems Analogy: Payload parsing into structured JSON audit records.
 */
function parseBookDetail(html, productUrl, sourcePage, fetchedAt) {
  const $ = cheerio.load(html);
  const productMain = $('.product_main');

  const title = productMain.find('h1').text().trim();
  const priceText = productMain.find('p.price_color').text().trim();
  const availabilityText = productMain.find('p.instock.availability').text().replace(/\s+/g, ' ').trim();
  const ratingClass = productMain.find('p.star-rating').attr('class') || '';
  const ratingText = ratingClass.replace('star-rating', '').trim() || 'Unrated';

  let description = $('#product_description').next('p').text().trim();
  if (!description || description.length === 0) {
    description = null;
  }

  return {
    title,
    product_url: productUrl,
    price_text: priceText,
    availability_text: availabilityText,
    rating_text: ratingText,
    description,
    source_page: sourcePage,
    fetched_at: fetchedAt
  };
}

/**
 * Stage 4 Helper: Extracts float price from raw text.
 * Example: "£51.77" -> 51.77
 */
function extractPriceGBP(priceText) {
  if (!priceText) return null;
  const match = priceText.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * Stage 4 Helper: Validates raw record against Schema rules.
 * Keeps clean normalized fields (price_gbp) side-by-side with raw fields.
 */
function validateAndNormalizeRecord(raw) {
  const errors = [];

  // 1. Required string field checks
  if (!raw.title || typeof raw.title !== 'string') {
    errors.push('Missing or invalid title');
  }

  // 2. Canonical URL validation
  if (!raw.product_url || !raw.product_url.startsWith('https://')) {
    errors.push('product_url must be an absolute HTTPS URL');
  }

  // 3. Price conversion & validation
  const priceGbp = extractPriceGBP(raw.price_text);
  if (priceGbp === null || isNaN(priceGbp)) {
    errors.push(`Invalid price_text: "${raw.price_text}" could not be parsed to number`);
  }

  // 4. Provenance & metadata validation
  if (!raw.source_page || !raw.source_page.startsWith('https://')) {
    errors.push('source_page must be a valid HTTPS URL');
  }

  if (!raw.fetched_at || isNaN(Date.parse(raw.fetched_at))) {
    errors.push('fetched_at must be a valid ISO timestamp');
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      rawRecord: raw
    };
  }

  // Side-by-side normalized record construction
  const normalizedRecord = {
    title: raw.title,
    product_url: raw.product_url,
    price_text: raw.price_text,
    price_gbp: priceGbp,
    availability_text: raw.availability_text,
    rating_text: raw.rating_text,
    description: raw.description,
    source_page: raw.source_page,
    fetched_at: raw.fetched_at
  };

  return {
    success: true,
    record: normalizedRecord
  };
}

/**
 * Main Crawl, Extraction & Persistence Pipeline (Stages 1-5).
 */
async function processPipeline() {
  const startTimeIso = new Date().toISOString();
  const startTimeMs = performance.now();
  let currentCatalogueUrl = START_URL;
  let cataloguePagesProcessed = 0;
  const discoveredBookItems = [];
  const stats = { cacheHits: 0, networkRequests: 0, failedPages: 0 };

  console.log('[+] Phase 1 & 2: Discovering Catalogue Links...');

  // 1. Crawl Catalogue Pages (Stages 1 & 2)
  while (currentCatalogueUrl && cataloguePagesProcessed < MAX_CATALOGUE_PAGES) {
    const pageName = currentCatalogueUrl.split('/').pop();
    const fetchResult = await fetchAndCachePage(currentCatalogueUrl, pageName, stats);
    
    if (!fetchResult.success) {
      console.error(`[CRITICAL] Failed to fetch catalogue page ${currentCatalogueUrl}`);
      stats.failedPages++;
      break;
    }

    const { bookItems, nextUrl } = extractCatalogueLinks(fetchResult.htmlContent, currentCatalogueUrl);
    discoveredBookItems.push(...bookItems);

    cataloguePagesProcessed++;
    currentCatalogueUrl = nextUrl;

    if (!fetchResult.wasCached && currentCatalogueUrl && cataloguePagesProcessed < MAX_CATALOGUE_PAGES) {
      console.log(`[THROTTLING] Pausing for ${RATE_LIMIT_DELAY_MS}ms before next request...`);
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  // Deduplicate discovered book URLs
  const uniqueBookItemsMap = new Map();
  for (const item of discoveredBookItems) {
    if (!uniqueBookItemsMap.has(item.url)) {
      uniqueBookItemsMap.set(item.url, item);
    }
  }

  // Stage 5 Requirement 4: Injected intentional made-up book URL to test fault isolation
  uniqueBookItemsMap.set('https://books.toscrape.com/catalogue/fake-non-existent-book_9999/index.html', {
    url: 'https://books.toscrape.com/catalogue/fake-non-existent-book_9999/index.html',
    sourcePage: START_URL
  });

  const uniqueBookItems = Array.from(uniqueBookItemsMap.values());

  console.log(`\n[+] Catalogue scan completed: ${uniqueBookItems.length} book URLs queued (includes 1 intentional fake URL).\n`);
  console.log('=== Stage 3 & 5: Extract Detail Records & Handle Fault Tolerances ===\n');

  const rawRecords = [];

  // 2. Fetch and Extract each detail page (Stage 3 + Stage 5 error handling)
  for (let i = 0; i < uniqueBookItems.length; i++) {
    const { url, sourcePage } = uniqueBookItems[i];
    
    const urlParts = url.split('/').filter(Boolean);
    const slug = urlParts.slice(-2, -1)[0] || `item_${i + 1}`;
    const cacheFilename = `detail_${slug}.html`;

    const fetchResult = await fetchAndCachePage(url, cacheFilename, stats);
    
    // Stage 5 Isolation: Log and skip bad pages without stopping the pipeline
    if (!fetchResult.success) {
      console.warn(`[SKIPPED] Bad page isolated: ${url} (Reason: ${fetchResult.error})`);
      stats.failedPages++;
      continue;
    }

    const record = parseBookDetail(fetchResult.htmlContent, url, sourcePage, fetchResult.fetchedAt);
    rawRecords.push(record);

    if (!fetchResult.wasCached && i < uniqueBookItems.length - 1) {
      console.log(`[THROTTLING] Pausing for ${RATE_LIMIT_DELAY_MS}ms before next request...`);
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  // Persist Raw Records (Stage 3 Output)
  const baseDir = path.resolve(__dirname, '..');
  const rawPath = path.join(baseDir, 'output', 'raw_records.json');
  fs.writeFileSync(rawPath, JSON.stringify(rawRecords, null, 2), 'utf-8');

  console.log('\n=== Stage 4: Clean, Validate, and Store ===\n');

  // Idempotent deduplication map keyed by canonical product_url
  const booksMap = new Map();
  const errorRecords = [];

  for (const rawRecord of rawRecords) {
    const validationResult = validateAndNormalizeRecord(rawRecord);

    if (validationResult.success) {
      // Idempotency: product_url acts as canonical identity
      booksMap.set(validationResult.record.product_url, validationResult.record);
    } else {
      errorRecords.push({
        reasons: validationResult.errors,
        raw_record: validationResult.rawRecord
      });
    }
  }

  const validBooks = Array.from(booksMap.values());

  // Save clean validated records to output/books.json
  const booksPath = path.join(baseDir, 'output', 'books.json');
  fs.writeFileSync(booksPath, JSON.stringify(validBooks, null, 2), 'utf-8');

  // Save errors (if any) to output/errors.json
  const errorsPath = path.join(baseDir, 'output', 'errors.json');
  fs.writeFileSync(errorsPath, JSON.stringify(errorRecords, null, 2), 'utf-8');

  // Stage 5 Requirement 3: Write output/run-report.json with honest numbers
  const durationSeconds = parseFloat(((performance.now() - startTimeMs) / 1000).toFixed(2));
  
  const runReport = {
    start_time: startTimeIso,
    duration_seconds: durationSeconds,
    pages_fetched: stats.networkRequests,
    cache_hits: stats.cacheHits,
    valid_records: validBooks.length,
    invalid_records: errorRecords.length,
    failed_pages: stats.failedPages
  };

  const reportPath = path.join(baseDir, 'output', 'run-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(runReport, null, 2), 'utf-8');

  console.log('=== Stage 5 Checkpoint ===');
  console.log(`books.json count: ${validBooks.length}`);
  console.log(`run-report.json failed_pages: ${runReport.failed_pages}`);
  console.log(`run-report.json valid_records: ${runReport.valid_records}`);
  console.log('\n[+] Stage 5 complete. Audit report written to output/run-report.json');

  return runReport;
}

/**
 * Main Entry Point.
 */
async function main() {
  console.log('=== Ethical Web Scraper Pipeline: Stages 1-5 ===\n');
  const overallStart = performance.now();
  
  initializeEnvironment();
  await processPipeline();

  const totalSeconds = ((performance.now() - overallStart) / 1000).toFixed(2);
  console.log(`\n[+] Pipeline execution completed in ${totalSeconds}s.`);
}

// Trigger Execution
main();