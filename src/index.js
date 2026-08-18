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
 * Fetches and caches raw HTML payload for a given URL.
 * Systems Analogy: Edge Proxy Caching with TTL verification.
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
    return { htmlContent: cachedData, wasCached: true, duration, fetchedAt };
  }

  // 2. Local Cache Miss -> Initiate Network Call (FETCH)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    stats.networkRequests++;
    console.log(`[FETCH] Requesting URL: ${url}`);
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status !== 200) {
      throw new Error(`HTTP Request Failed with Status Code: ${response.status}`);
    }

    const htmlContent = await response.text();
    const fetchedAt = new Date().toISOString();
    fs.writeFileSync(cachePath, htmlContent, 'utf-8');

    const duration = (performance.now() - startTime).toFixed(2);
    console.log(`[FETCH SUCCESS] Saved to cache: ${cacheFilename} (${duration} ms)`);
    return { htmlContent, wasCached: false, duration, fetchedAt };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[ERROR] Fetch failed for ${url}: ${error.message}`);
    process.exit(1);
  }
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
 * Main Crawl & Extraction Pipeline (Stages 1-4).
 */
async function processPipeline() {
  let currentCatalogueUrl = START_URL;
  let cataloguePagesProcessed = 0;
  const discoveredBookItems = [];
  const stats = { cacheHits: 0, networkRequests: 0 };

  console.log('[+] Phase 1 & 2: Discovering Catalogue Links...');

  // 1. Crawl Catalogue Pages (Stages 1 & 2)
  while (currentCatalogueUrl && cataloguePagesProcessed < MAX_CATALOGUE_PAGES) {
    const pageName = currentCatalogueUrl.split('/').pop();
    const { htmlContent, wasCached } = await fetchAndCachePage(currentCatalogueUrl, pageName, stats);
    
    const { bookItems, nextUrl } = extractCatalogueLinks(htmlContent, currentCatalogueUrl);
    discoveredBookItems.push(...bookItems);

    cataloguePagesProcessed++;
    currentCatalogueUrl = nextUrl;

    if (!wasCached && currentCatalogueUrl && cataloguePagesProcessed < MAX_CATALOGUE_PAGES) {
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
  const uniqueBookItems = Array.from(uniqueBookItemsMap.values());

  console.log(`\n[+] Catalogue scan completed: Found ${uniqueBookItems.length} unique book detail URLs.\n`);
  console.log('=== Stage 3: Extract Raw Records ===\n');

  const rawRecords = [];

  // 2. Fetch and Extract each detail page (Stage 3)
  for (let i = 0; i < uniqueBookItems.length; i++) {
    const { url, sourcePage } = uniqueBookItems[i];
    
    const urlParts = url.split('/').filter(Boolean);
    const slug = urlParts.slice(-2, -1)[0] || `item_${i + 1}`;
    const cacheFilename = `detail_${slug}.html`;

    const { htmlContent, wasCached, fetchedAt } = await fetchAndCachePage(url, cacheFilename, stats);
    const record = parseBookDetail(htmlContent, url, sourcePage, fetchedAt);
    
    rawRecords.push(record);

    if (!wasCached && i < uniqueBookItems.length - 1) {
      console.log(`[THROTTLING] Pausing for ${RATE_LIMIT_DELAY_MS}ms before next request...`);
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }


  const baseDir = path.resolve(__dirname, '..');
  const rawPath = path.join(baseDir, 'output', 'raw_records.json');
  fs.writeFileSync(rawPath, JSON.stringify(rawRecords, null, 2), 'utf-8');

  console.log('=== Stage 4: Clean, Validate, and Store ===\n');

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

  // Stage 4 Checkpoint Assertions
  const allPricesAreNumbers = validBooks.every(b => typeof b.price_gbp === 'number' && !isNaN(b.price_gbp));
  const allUrlsAreHttps = validBooks.every(b => b.product_url.startsWith('https://'));

  console.log('=== Stage 4 Checkpoint ===');
  console.log(`books.json count: ${validBooks.length}`);
  console.log(`errors.json count: ${errorRecords.length}`);
  console.log(`Assertion - Every price_gbp is a number: ${allPricesAreNumbers}`);
  console.log(`Assertion - Every product_url starts with https://: ${allUrlsAreHttps}`);

  console.log('\n[+] Stage 4 complete. Clean records saved to output/books.json');
  return { validBooks, errorRecords };
}

async function main() {
  console.log('=== Ethical Web Scraper Pipeline: Stages 1-4 ===\n');
  const overallStart = performance.now();
  
  initializeEnvironment();
  await processPipeline();

  const totalSeconds = ((performance.now() - overallStart) / 1000).toFixed(2);
  console.log(`\n[+] Stage 4 execution finished in ${totalSeconds}s.`);
}

// Trigger Execution
main();