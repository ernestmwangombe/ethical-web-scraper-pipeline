// Import the function that builds the report data
import { getReportData } from './report.js';

// Call it to run all four queries and get the report object
const report = getReportData();

// Print the report as indented JSON so it is easy to read
console.log(JSON.stringify(report, null, 2));