// Import the built-in SQLite module
import { DatabaseSync } from 'node:sqlite';
// Import join to build a path that works on Windows and Linux
import { join } from 'node:path';

// Build the path to report.db, which sits next to this file
const DB_PATH = join(import.meta.dirname, 'report.db');

// Export the function so the test script (and later the API) can call it
export function getReportData() {
  // Open the database connection for this call
  const db = new DatabaseSync(DB_PATH);
  // Use try/finally so the connection always closes, even on error
  try {
    // Query 1: count every row in the books table
    const { total_books } = db
      .prepare('SELECT COUNT(*) AS total_books FROM books')
      .get();

    // Query 2: average price, rounded to 2 decimal places
    const { average_price } = db
      .prepare('SELECT ROUND(AVG(price), 2) AS average_price FROM books')
      .get();

    // Query 3: the 5 most expensive books (title breaks price ties consistently)
    const top_expensive = db
      .prepare(
        'SELECT title, price, rating, url FROM books ORDER BY price DESC, title ASC LIMIT 5'
      )
      .all();

    // Query 4: how many books exist at each star rating, from 1 to 5
    const books_per_rating = db
      .prepare(
        'SELECT rating, COUNT(*) AS count FROM books GROUP BY rating ORDER BY rating ASC'
      )
      .all();

    // Return all four results together as one report object
    return { total_books, average_price, top_expensive, books_per_rating };
  } finally {
    // Close the database connection whether the queries worked or failed
    db.close();
  }
}


// Export a second function that returns every book, for the long table
export function getAllBooks() {
  // Open the database connection for this call
  const db = new DatabaseSync(DB_PATH);
  // Use try/finally so the connection always closes
  try {
    // Return all 60 books in id order as an array of row objects
    return db
      .prepare('SELECT id, title, price, rating, url FROM books ORDER BY id ASC')
      .all();
  } finally {
    // Close the database connection whether the query worked or failed
    db.close();
  }
}