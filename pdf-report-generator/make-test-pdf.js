// Import join to build the output path safely on Windows
import { join } from 'node:path';
// Import both data functions from the report module
import { getReportData, getAllBooks } from './report.js';
// Import the HTML builder and the PDF renderer
import { buildReportHtml, renderPdf } from './render.js';

// Run the four aggregation queries
const report = getReportData();
// Fetch all 60 books for the long table
const books = getAllBooks();
// Build the HTML page from the data
const html = buildReportHtml(report, books);
// Choose where the test PDF will be saved
const outputPath = join(import.meta.dirname, 'reports', 'test.pdf');
// Render the HTML into a PDF file
await renderPdf(html, outputPath);
// Tell the user where the file went
console.log(`PDF written to ${outputPath}`);