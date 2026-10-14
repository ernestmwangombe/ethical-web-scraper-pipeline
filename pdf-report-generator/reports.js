// Import the built-in SQLite module
import { DatabaseSync } from 'node:sqlite';
// Import join to build file paths that work on Windows and Linux
import { join } from 'node:path';
// Import the two data functions from Stage 2 and 3
import { getReportData, getAllBooks } from './report.js';
// Import the HTML builder and PDF renderer from Stage 3
import { buildReportHtml, renderPdf } from './render.js';

// Build the path to report.db, which sits next to this file
const DB_PATH = join(import.meta.dirname, 'report.db');

// Open the database and make sure the reports table exists
function openDb() {
  // Open the SQLite connection
  const db = new DatabaseSync(DB_PATH);
  // Create the reports table the first time it is needed
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      -- Auto-numbered report id
      id INTEGER PRIMARY KEY,
      -- Where the PDF lives on disk, relative to the project folder
      path TEXT NOT NULL,
      -- When the report was created, as an ISO timestamp in UTC
      created_at TEXT NOT NULL
    )
  `);
  // Hand the open connection back to the caller
  return db;
}

// Run the whole pipeline: query, render, store, and return the link
export async function createReport() {
  // Open the database for this request
  const db = openDb();
  // Use try/finally so the connection always closes
  try {
    // Insert the row first (empty path for now) so SQLite gives us an id
    const insert = db
      .prepare('INSERT INTO reports (path, created_at) VALUES (?, ?)')
      .run('', new Date().toISOString());
    // Read the new row's id as a normal number
    const id = Number(insert.lastInsertRowid);
    // Build the relative path where this report's PDF will be saved
    const relativePath = `reports/${id}.pdf`;
    // Try the slow part; clean up the row if it fails
    try {
      // Run the aggregation queries and build the HTML page
      const html = buildReportHtml(getReportData(), getAllBooks());
      // Render the HTML into reports/<id>.pdf using headless Chromium
      await renderPdf(html, join(import.meta.dirname, relativePath));
    } catch (err) {
      // Remove the half-created row so no record points at a missing file
      db.prepare('DELETE FROM reports WHERE id = ?').run(id);
      // Re-throw so the endpoint can answer with a 500
      throw err;
    }
    // Save the real file path now that the PDF exists
    db.prepare('UPDATE reports SET path = ? WHERE id = ?').run(relativePath, id);
    // Return the id and the link; the response never carries the PDF bytes
    return { id, file: `/reports/${id}/file` };
  } finally {
    // Close the database connection
    db.close();
  }
}

// Look up one report row by id, or return null if it does not exist
export function getReport(id) {
  // Open the database for this lookup
  const db = openDb();
  // Use try/finally so the connection always closes
  try {
    // Fetch the matching row
    const row = db
      .prepare('SELECT id, path, created_at FROM reports WHERE id = ?')
      .get(id);
    // Return null when no row matches
    if (!row) return null;
    // Return the row plus the link to its file
    return {
      id: row.id,
      path: row.path,
      created_at: row.created_at,
      file: `/reports/${row.id}/file`,
    };
  } finally {
    // Close the database connection
    db.close();
  }
}