/**
 * One-shot diagnostic for the exchange scraper. Run this ONCE on the VPS, AFTER
 * market close (~18:30 IST), so NSE/BSE/MCX have published the day's EOD data:
 *
 *   cd /var/ww/ClientIQ/backend && node scripts/scrapeDiagnose.js
 *
 * It launches the headless browser, hits every source, and prints the RAW
 * payload/columns each one returned — WITHOUT writing to the database. Send that
 * output back so the field/column mapping in exchangeScraper.js can be locked in.
 */
require('dotenv').config();
const { runScrape } = require('../exchangeScraper');

(async () => {
  try {
    const report = await runScrape({ diagnose: true });
    console.log('\n================ DIAGNOSTIC RESULT ================\n');
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    console.error('scrapeDiagnose failed:', e.message);
  } finally {
    process.exit(0);
  }
})();
