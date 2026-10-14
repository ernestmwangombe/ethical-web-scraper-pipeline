// Import Playwright's Chromium launcher, which will print the PDF
import { chromium } from 'playwright';
// Import mkdirSync to create the reports folder if it is missing
import { mkdirSync } from 'node:fs';
// Import dirname to get the folder part of an output file path
import { dirname } from 'node:path';

// Escape special characters so titles like "A & B" cannot break the HTML
function escapeHtml(value) {
  // Convert the value to a string and replace each special character
  return String(value)
    // Replace & first so later replacements are not double-escaped
    .replace(/&/g, '&amp;')
    // Replace < so text cannot open an HTML tag
    .replace(/</g, '&lt;')
    // Replace > so text cannot close an HTML tag
    .replace(/>/g, '&gt;')
    // Replace double quotes
    .replace(/"/g, '&quot;')
    // Replace single quotes
    .replace(/'/g, '&#39;');
}

// Build the full HTML page from the report object and the list of all books
export function buildReportHtml(report, books) {
  // Get today's date as YYYY-MM-DD for the title
  const today = new Date().toISOString().slice(0, 10);

  // Build one table row per top-5 book
  const topRows = report.top_expensive
    // Turn each book into a row, numbering them from 1
    .map(
      (book, index) =>
        `<tr><td>${index + 1}</td><td>${escapeHtml(book.title)}</td><td class="num">£${book.price.toFixed(2)}</td><td class="num">${book.rating}</td></tr>`
    )
    // Join all rows into a single string
    .join('');

  // Build one table row per book for the long table at the bottom
  const allRows = books
    // Turn each book into a row showing its id
    .map(
      (book) =>
        `<tr><td>${book.id}</td><td>${escapeHtml(book.title)}</td><td class="num">£${book.price.toFixed(2)}</td><td class="num">${book.rating}</td></tr>`
    )
    // Join all rows into a single string
    .join('');

  // Return the complete HTML document as a template string
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Bookstore Report - ${today}</title>
<style>
  /* Base font and text colour for the whole page */
  body { font-family: Arial, Helvetica, sans-serif; color: #222; font-size: 11pt; }
  /* Tighten the gap under the main title */
  h1 { margin-bottom: 4px; }
  /* Grey, smaller text for the date line */
  .date { color: #666; margin-top: 0; }
  /* Lay the two total cards side by side */
  .totals { display: flex; gap: 16px; margin: 20px 0; }
  /* Style each total card with a light blue box */
  .card { flex: 1; background: #eef3fb; border-radius: 8px; padding: 12px 16px; }
  /* Small uppercase label above each total */
  .card .label { font-size: 9pt; color: #555; text-transform: uppercase; }
  /* Large bold number for each total */
  .card .value { font-size: 20pt; font-weight: bold; }
  /* Make tables full width with single borders */
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  /* Add borders and padding to every cell */
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  /* Dark blue header cells with white text (needs printBackground: true) */
  th { background: #1f3a68; color: #fff; }
  /* Right-align number columns and stop prices wrapping */
  td.num, th.num { text-align: right; white-space: nowrap; }
  /* PRINT FIX 1: make the browser repeat the header row on every page */
  thead { display: table-header-group; }
  /* PRINT FIX 2: never split a table row across two pages */
  tr { break-inside: avoid; }
  /* Space above each section heading */
  h2 { margin-top: 28px; }
</style>
</head>
<body>
  <!-- Report title -->
  <h1>Bookstore Report</h1>
  <!-- Today's date -->
  <p class="date">Generated on ${today}</p>
  <!-- The two totals -->
  <div class="totals">
    <!-- Total number of books -->
    <div class="card"><div class="label">Total books</div><div class="value">${report.total_books}</div></div>
    <!-- Average price in pounds -->
    <div class="card"><div class="label">Average price</div><div class="value">£${report.average_price.toFixed(2)}</div></div>
  </div>
  <!-- Heading for the small table -->
  <h2>Top 5 most expensive books</h2>
  <!-- Small table of the top 5 -->
  <table>
    <!-- Header row lives in thead so it can repeat -->
    <thead><tr><th>#</th><th>Title</th><th class="num">Price</th><th class="num">Rating</th></tr></thead>
    <!-- Body rows built above -->
    <tbody>${topRows}</tbody>
  </table>
  <!-- Heading for the long table -->
  <h2>All books</h2>
  <!-- Long table that will cross page breaks on purpose -->
  <table>
    <!-- Header row lives in thead so it repeats on every page -->
    <thead><tr><th>ID</th><th>Title</th><th class="num">Price</th><th class="num">Rating</th></tr></thead>
    <!-- Body rows built above -->
    <tbody>${allRows}</tbody>
  </table>
</body>
</html>`;
}

// Turn an HTML string into a PDF file at outputPath using headless Chromium
export async function renderPdf(html, outputPath) {
  // Make sure the folder for the PDF exists
  mkdirSync(dirname(outputPath), { recursive: true });
  // Launch headless Chromium
  const browser = await chromium.launch();
  // Use try/finally so the browser always closes, even on error
  try {
    // Open a new blank page
    const page = await browser.newPage();
    // Load our HTML string into the page
    await page.setContent(html);
    // Print the page to a PDF file
    await page.pdf({
      // Where to save the PDF
      path: outputPath,
      // Use A4 paper size
      format: 'A4',
      // Include background colours such as the blue header cells
      printBackground: true,
      // Add margins so content does not touch the paper edge
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    });
  } finally {
    // Close the browser whether printing worked or failed
    await browser.close();
  }
}