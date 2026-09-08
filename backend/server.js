const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');
const path    = require('path');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ── Leads route ──────────────────────────────────────────────
app.use('/api/leads', require('./routes/leads'));

// ── All other API Routes ───────────────────────────────────────
const routes = [
  ['/api/auth',           './routes/auth'],
  ['/api/clients',        './routes/clients'],
  ['/api/dashboard',      './routes/dashboard'],
  ['/api/admin-settings', './routes/adminSettings'],
  ['/api/interactions',   './routes/interactions'],
  ['/api/import',         './routes/import'],
  ['/api/reports',        './routes/reports'],
  ['/api/analytics',      './routes/analytics'],
  ['/api/users',          './routes/users'],
  ['/api/rm',             './routes/rm'],
  ['/api/ai',             './routes/ai'],
  ['/api/contact-logs',   './routes/contactLogs'],
  ['/api/calls',          './routes/calls'],
  ['/api/whatsapp',       './routes/whatsapp'],
  ['/api/email',          './routes/email'],
  ['/api/nudge',          './routes/nudge'],
  ['/api/trade-insights', './routes/tradeInsights'],
  ['/api/audit-log', './routes/auditLog'],
];

routes.forEach(([routePath, file]) => {
  console.log('Loading route:', file);
  const route = require(file);
  console.log('Loaded route type:', typeof route);
  if (typeof route !== 'function') {
    throw new Error(`${file} is not a valid Express router`);
  }
  app.use(routePath, route);
});

// ── Serve React build ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/build')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// ── Start server ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ── Email scheduler ────────────────────────────────────────────
const { triggerDailyDigest, checkAndSendChurnAlerts, checkAndSendLeadExpiryWarnings } = require('./routes/emailTriggers');
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 7 && now.getMinutes() === 30) {
    triggerDailyDigest();
    checkAndSendChurnAlerts();
    checkAndSendLeadExpiryWarnings();
  }
}, 60000);

// ── Daily-data auto-rebuild backstop ───────────────────────────
// Deferred trade uploads normally kick off the daily_trades compute themselves
// (fire-and-forget) the moment they finish. This timer is the safety net: it drains
// any dates still sitting in pending_rebuild — e.g. if the process restarted mid-upload
// or a trigger was ever missed — so brokerage never stays blocked on a stale queue.
const importRouter = require('./routes/import');
if (typeof importRouter.runPendingRebuild === 'function') {
  setInterval(() => {
    importRouter.runPendingRebuild().catch(e => console.error('rebuild backstop:', e.message));
  }, 120000); // every 2 min; the internal guard makes this a no-op when nothing is queued or a rebuild is already running
}

// ── Daily exchange-volume auto-fetch (headless browser, ~20:00 UTC = 01:30 IST) ──
// Runs AFTER the MCX evening session closes so all five segments (NSE cash/F&O,
// BSE F&O, MCX comm) are published, and scrapes NSE/BSE/MCX into exchange_volume
// for the Market Share report. Same code the "Run auto-fetch now" button runs.
// The scraper pulls the recent day-wise series and upserts, so a missed day is
// backfilled on the next run. Failures are logged and never crash the server.
const exchangeScraper = require('./exchangeScraper');
let _lastScrapeRun = null;
setInterval(() => {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  if (now.getUTCHours() === 20 && _lastScrapeRun !== stamp) {
    _lastScrapeRun = stamp;                     // guard: run once per day, not every minute of the hour
    exchangeScraper.runScrape().catch(e => console.error('exchange-scrape daily:', e.message));
  }
}, 60000);