const fs = require('fs');
const path = require('path');

// Global Configuration
const TARGET_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const CACHE_FILE = path.join(__dirname, '..', 'cache', 'catalogue-page-1.html');
const USER_AGENT = 'FlyRankInternship-A9/1.0 (+https://github.com/ernestmwangombe/ethical-web-scraper-pipeline)';
const REQUEST_TIMEOUT_MS = 5000; // 5-second timeout

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
 * Stage 1: Fetch and Cache Page Data
 * 
 * Systems Analogy: Local WAN Proxy Caching.
 * Before making an outbound call across the Internet gateway, the script checks
 * local flash storage. If a valid payload exists locally, it serves it instantly
 * without generating external network traffic.
 */
async function fetchAndCachePage(url, cachePath) {
  // 1. Check Local Cache Partition (CACHE HIT)
  if (fs.existsSync(cachePath)) {
    const cachedData = fs.readFileSync(cachePath, 'utf-8');
    const sizeInBytes = Buffer.byteLength(cachedData, 'utf-8');
    
    console.log(`[CACHE HIT] Loaded content from: ${cachePath}`);
    console.log(`[*] Response Payload Size: ${sizeInBytes} bytes (${(sizeInBytes / 1024).toFixed(2)} KB)`);
    return cachedData;
  }

  // 2. Local Cache Miss -> Initiate Network Call (FETCH)
  console.log(`[FETCH] Requesting target URL: ${url}`);
  
  // Abort controller enforces network socket timeout guard
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // 3. Status Code Validation Firewall Guard
    if (response.status !== 200) {
      throw new Error(`HTTP Request Failed with Status Code: ${response.status}`);
    }

    const htmlContent = await response.text();
    const sizeInBytes = Buffer.byteLength(htmlContent, 'utf-8');

    // 4. Save to Local Cache Directory
    fs.writeFileSync(cachePath, htmlContent, 'utf-8');

    console.log(`[FETCH SUCCESS] HTTP ${response.status} OK`);
    console.log(`[*] Response Payload Size: ${sizeInBytes} bytes (${(sizeInBytes / 1024).toFixed(2)} KB)`);
    console.log(`[*] Saved HTML payload to cache: ${cachePath}`);

    return htmlContent;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`[ERROR] Network request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    } else {
      console.error(`[ERROR] Fetch failed: ${error.message}`);
    }
    process.exit(1);
  }
}

async function main() {
  console.log('=== Stage 1: Fetch Once, Cache Once ===\n');
  initializeEnvironment();
  
  // Execute fetch/cache flow for catalogue page 1
  await fetchAndCachePage(TARGET_URL, CACHE_FILE);

  console.log('\n[+] Stage 1 execution complete.');
}
main();