// Import the built-in SQLite module (no install needed on Node 22+)
import { DatabaseSync } from 'node:sqlite';
// Import readFileSync to load books.json from disk
import { readFileSync } from 'node:fs';
// Import join to build file paths that work on Windows and Linux
import { join } from 'node:path';

// Build the path to report.db, placed next to this script
const DB_PATH = join(import.meta.dirname, 'report.db');
// Build the path to the scraped books data file
const BOOKS_PATH = join(import.meta.dirname, 'books.json');

// Map the scraper's rating words to numbers so GROUP BY sorts 1 to 5
const RATING_MAP = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5 };

// Read books.json and parse it into an array of book objects
const books = JSON.parse(readFileSync(BOOKS_PATH, 'utf-8'));

// Open the SQLite database file, creating it if it does not exist
const db = new DatabaseSync(DB_PATH);

// Create the books table only if it is not already there
db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    -- Auto-numbered primary key (ids restart at 1 after the table is emptied)
    id INTEGER PRIMARY KEY,
    -- Book title, required
    title TEXT NOT NULL,
    -- Price in GBP as a number, required
    price REAL NOT NULL,
    -- Star rating as a number from 1 to 5, required
    rating INTEGER NOT NULL,
    -- Link to the book's page on books.toscrape.com, required
    url TEXT NOT NULL
  )
`);

// Start a transaction so the delete and inserts succeed or fail together
db.exec('BEGIN');
// Run the seeding inside try so any error can trigger a rollback
try {
  // Delete all existing rows so running the script twice leaves one clean copy
  db.exec('DELETE FROM books');
  // Prepare the insert statement once and reuse it for every book
  const insert = db.prepare(
    'INSERT INTO books (title, price, rating, url) VALUES (?, ?, ?, ?)'
  );
  // Loop over every book record from books.json
  for (const book of books) {
    // Convert the rating word (for example "Three") to a number
    const rating = RATING_MAP[book.rating_text];
    // Stop with a clear error if an unexpected rating word appears
    if (rating === undefined) {
      // Throw an error naming the bad rating and the book it belongs to
      throw new Error(`Unknown rating "${book.rating_text}" for ${book.title}`);
    }
    // Insert the book, mapping price_gbp to price and product_url to url
    insert.run(book.title, book.price_gbp, rating, book.product_url);
  }
  // Save all inserts permanently
  db.exec('COMMIT');
} catch (err) {
  // Undo the delete and any inserts if something went wrong
  db.exec('ROLLBACK');
  // Re-throw the error so it is visible in the terminal
  throw err;
}

// Run the checkpoint query: count the rows now in the books table
const { total } = db.prepare('SELECT COUNT(*) AS total FROM books').get();
// Print the row count so we can verify it is 60
console.log(`books rows: ${total}`);

// Close the database connection cleanly
db.close();