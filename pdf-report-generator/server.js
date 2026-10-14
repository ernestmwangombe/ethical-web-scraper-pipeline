// Import the Express framework used to build the web server
import express from 'express';
// Import join to build absolute file paths
import { join } from 'node:path';
// Import existsSync to check the PDF is still on disk
import { existsSync } from 'node:fs';
// Import the report functions (getOrCreateReport replaces createReport)
import { getOrCreateReport, getReport } from './reports.js';

// Create the Express application instance
const app = express();

// Choose the port from the environment, falling back to 3000
const PORT = process.env.PORT || 3000;

// Let Express read JSON request bodies such as {"force": true}
app.use(express.json());

// Health-check route from Stage 0
app.get('/health', (req, res) => {
  // Reply with HTTP 200 and the JSON body the assignment asks for
  res.status(200).json({ status: 'ok' });
});

// Generate a report, or return today's existing one
app.post('/reports', async (req, res) => {
  // Catch any failure so the server answers instead of crashing
  try {
    // Read the optional force flag; it only counts when it is exactly true
    const force = req.body?.force === true;
    // Get today's report, creating one only if needed (or forced)
    const { created, id, file } = await getOrCreateReport(force);
    // Reply 201 for a newly created report, or 200 for an existing one
    res.status(created ? 201 : 200).json({ id, file });
  } catch (err) {
    // Log the real error on the server for debugging
    console.error('POST /reports failed:', err);
    // Reply 500 with a generic message
    res.status(500).json({ error: 'Could not generate the report' });
  }
});

// Get one report record, including its file link
app.get('/reports/:id', (req, res) => {
  // Turn the id from the URL into a number
  const id = Number(req.params.id);
  // Look the report up (an invalid id simply finds nothing)
  const report = Number.isInteger(id) ? getReport(id) : null;
  // Reply 404 when the report does not exist
  if (!report) {
    // Send a JSON error body with the 404 status
    return res.status(404).json({ error: 'Report not found' });
  }
  // Reply 200 with the row as JSON
  res.json(report);
});

// Serve the PDF file itself from disk
app.get('/reports/:id/file', (req, res) => {
  // Turn the id from the URL into a number
  const id = Number(req.params.id);
  // Look the report up (an invalid id simply finds nothing)
  const report = Number.isInteger(id) ? getReport(id) : null;
  // Reply 404 when the report does not exist
  if (!report) {
    // Send a JSON error body with the 404 status
    return res.status(404).json({ error: 'Report not found' });
  }
  // Build the absolute path to the PDF from the stored relative path
  const filePath = join(import.meta.dirname, report.path);
  // Reply 404 if the record exists but the file was deleted from disk
  if (!existsSync(filePath)) {
    // Send a JSON error body with the 404 status
    return res.status(404).json({ error: 'Report file is missing' });
  }
  // Stream the PDF from disk; this is the only route that moves large bytes
  res.sendFile(filePath);
});

// Start listening for requests on the chosen port
app.listen(PORT, () => {
  // Log a message so we can see the server started
  console.log(`Server running on http://localhost:${PORT}`);
});