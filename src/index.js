const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio'); // External library for HTML parsing (Deep Packet Inspection)

// Global Configuration
const START_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const USER_AGENT = 'FlyRankInternship-A9/1.0 (+https://github.com/ernestmwangombe/ethical-web-scraper-pipeline)';
const REQUEST_TIMEOUT_MS = 5000; // 5-second network socket timeout
const RATE_LIMIT_DELAY_MS = 500; // 500ms delay for traffic shaping (politeness)
const MAX_PAGES = 3; // Hard limit for scope

/**
 * Ensures that necessary local storage partitions (folders) exist.
 * Systems Analogy: Formatting network mounts before opening data streams.
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
 * Utility: Halts execution for a specified number of milliseconds.
 * Systems Analogy: Traffic Shaping / Throttling. Prevents our script from 
 * acting like a DDoS attack by enforcing a mandatory cooling-off period.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches and Caches Page Data.
 * Returns an object containing the HTML and a boolean indicating if it was a cache hit.
 */
async function fetchAndCachePage(url) {
  // Dynamically generate the cache filename based on the URL (e.g., page-1.html)
  const pageName = url.split('/').pop(); 
  const cachePath = path.join(__dirname, '..', 'cache', pageName);

  // High-precision clock start (Latency Measurement)
  const startTime = performance.now();

  // 1. Check Local Cache Partition (CACHE HIT)
  if (fs.existsSync(cachePath)) {
    const cachedData = fs.readFileSync(cachePath, 'utf-8');
    const duration = (performance.now() - startTime).toFixed(2);
    console.log(`[CACHE HIT] Loaded: ${pageName} (${duration} ms)`);
    return { htmlContent: cachedData, wasCached: true };
  }

  // 2. Local Cache Miss -> Initiate Network Call (FETCH)
  console.log(`[FETCH] Requesting URL: ${url}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Firewall Guard
    if (response.status !== 200) {
      throw new Error(`HTTP Request Failed with Status Code: ${response.status}`);
    }

    const htmlContent = await response.text();
    fs.writeFileSync(cachePath, htmlContent, 'utf-8');
    
    const duration = (performance.now() - startTime).toFixed(2);
    console.log(`[FETCH SUCCESS] Saved to cache: ${pageName} (${duration} ms)`);
    return { htmlContent, wasCached: false };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[ERROR] Fetch failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Inspects the HTML payload to extract book URLs and the 'next' page URL.
 * Systems Analogy: Deep Packet Inspection (DPI) looking for specific routing headers.
 */
function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const bookLinks = [];

  // Extract all book links from the product pods
  $('article.product_pod h3 a').each((index, element) => {
    const relativeHref = $(element).attr('href');
    if (relativeHref) {
      // Resolve absolute URL (Fully Qualified Domain Name routing)
      const absoluteUrl = new URL(relativeHref, baseUrl).href;
      bookLinks.push(absoluteUrl);
    }
  });

  // Extract the "next" page link, if it exists
  let nextUrl = null;
  const nextRelativeHref = $('li.next a').attr('href');
  if (nextRelativeHref) {
    nextUrl = new URL(nextRelativeHref, baseUrl).href;
  }

  return { bookLinks, nextUrl };
}

/**
 * Orchestrates the crawling process across multiple pages.
 */
async function crawlCatalogue() {
  let currentUrl = START_URL;
  let pagesProcessed = 0;
  let allDiscoveredLinks = [];

  while (currentUrl && pagesProcessed < MAX_PAGES) {
    // 1. Fetch or load from cache
    const { htmlContent, wasCached } = await fetchAndCachePage(currentUrl);
    
    // 2. Parse payload and extract URLs
    const { bookLinks, nextUrl } = extractLinks(htmlContent, currentUrl);
    allDiscoveredLinks.push(...bookLinks);
    
    pagesProcessed++;
    currentUrl = nextUrl; // Move pointer to the next page

    // 3. Traffic Shaping: Only delay if we actually hit the network and have more pages to do
    if (!wasCached && currentUrl && pagesProcessed < MAX_PAGES) {
      console.log(`[THROTTLING] Pausing for ${RATE_LIMIT_DELAY_MS}ms before next request...`);
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  // 4. Data Deduplication (Removing duplicate ARP entries)
  // Using a JavaScript Set automatically filters out any duplicate values
  const uniqueUrls = [...new Set(allDiscoveredLinks)];

  console.log('\n=== Stage 2 Checkpoint ===');
  console.log(`catalogue_pages=${pagesProcessed}, discovered=${allDiscoveredLinks.length}, unique_urls=${uniqueUrls.length}`);
}

async function main() {
  console.log('=== Stage 2: Find All Three Pages ===\n');
  const overallStart = performance.now();
  initializeEnvironment();
  
  await crawlCatalogue();

  const totalTime = ((performance.now() - overallStart) / 1000).toFixed(2);
  console.log(`\n[+] Stage 2 execution complete in ${totalTime} seconds.`);
}

// System Execution Trigger
main();