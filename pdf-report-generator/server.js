// Import the Express framework used to build the web server
import express from 'express';

// Create the Express application instance
const app = express();

// Choose the port from the environment, falling back to 3000
const PORT = process.env.PORT || 3000;

// Define the health-check route that answers GET /health
app.get('/health', (req, res) => {
  // Reply with HTTP 200 and the JSON body the assignment asks for
  res.status(200).json({ status: 'ok' });
});

// Start listening for requests on the chosen port
app.listen(PORT, () => {
  // Log a message so we can see the server started
  console.log(`Server running on http://localhost:${PORT}`);
});