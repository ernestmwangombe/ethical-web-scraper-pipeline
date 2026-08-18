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
 * Main Crawl & Raw Extraction Orchestrator (Stages 1-3).
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

  // Persist Raw Records output only
  const baseDir = path.resolve(__dirname, '..');
  const rawPath = path.join(baseDir, 'output', 'raw_records.json');
  fs.writeFileSync(rawPath, JSON.stringify(rawRecords, null, 2), 'utf-8');

  console.log('\n=== Stage 3 Checkpoint ===');
  console.log(`detail_pages=${rawRecords.length}\n`);
  console.log('Sample Raw Record (1 of 60):');
  console.log(JSON.stringify(rawRecords[0], null, 2));

  console.log('\n[+] Raw record extraction complete. Saved to output/raw_records.json');
  return rawRecords;
}

async function main() {
  console.log('=== Ethical Web Scraper Pipeline: Stages 1-3 ===\n');
  const overallStart = performance.now();
  
  initializeEnvironment();
  await processPipeline();

  const totalSeconds = ((performance.now() - overallStart) / 1000).toFixed(2);
  console.log(`\n[+] Stage 3 execution finished in ${totalSeconds}s.`);
}

// Trigger Execution
main();