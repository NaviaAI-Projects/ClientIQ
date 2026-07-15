const XLSX = require('xlsx');

// ── Update these paths to wherever your sample files are ──
const FILES = {
  client_master: 'C:/Users/PraveenV/Downloads/Client Master.ods',
  trade:         'C:/Users/PraveenV/Downloads/TradeFile.ods',
  brokerage:     'C:/Users/PraveenV/Downloads/Brokerage File.ods',
  ledger:        'C:/Users/PraveenV/Downloads/Ledger.ods',
  mtf:           'C:/Users/PraveenV/Downloads/MTF Interest.ods',
  holdings:      'C:/Users/PraveenV/Downloads/Holding File.ods',
};

// ── Same helpers as import.js ──
function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = m[2].padStart(2, '0');
    const yr  = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yr}-${mon}-${day}`;
  }
  if (!isNaN(val) && Number(val) > 40000) {
    const d = new Date((Number(val) - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().split('T')[0];
  return null;
}

function extractUCC(partyStr) {
  if (!partyStr) return null;
  const m = String(partyStr).match(/\[(\d+)\]/);
  return m ? m[1] : null;
}

function getSegment(exchg, symbol) {
  if (!exchg) return 'EQ_CASH';
  const e = String(exchg).toUpperCase();
  const s = String(symbol || '').toUpperCase();
  if (e === 'MCX' || e === 'NCDEX') return 'COMM_FO';
  if (s.includes('CE') || s.includes('PE')) return 'EQ_OPT';
  if (s.includes('FUT')) return 'EQ_FUT';
  return 'EQ_CASH';
}

function divider(name) {
  console.log('\n' + '='.repeat(60));
  console.log('FILE: ' + name);
  console.log('='.repeat(60));
}

// ── 1. CLIENT MASTER ──
function debugClientMaster() {
  divider('CLIENT MASTER');
  try {
    const wb = XLSX.readFile(FILES.client_master, { cellDates: false, raw: false, cellText: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log(`Total rows: ${rows.length}`);
    console.log('Column keys:', Object.keys(rows[0] || {}));

    let ok = 0, fail = 0;
    for (const row of rows.slice(0, 5)) {
      const ucc       = String(row['UCC'] || '').trim();
      const name      = String(row['Client Name'] || '').trim();
      const status    = String(row['Accross ExchOverall Status'] || '').trim();
      const regdDate  = parseDate(row['Regd Date']);
      const lastTrade = parseDate(row['Last TradeAccross Exch']);
      const isActive  = status.toLowerCase().includes('active');

      if (!ucc || !name) { fail++; console.log('  FAIL - missing ucc/name:', row); continue; }
      ok++;
      console.log(`  OK → UCC="${ucc}" | Name="${name}" | Status="${status}" | isActive=${isActive} | Regd=${regdDate} | LastTrade=${lastTrade}`);
    }
    console.log(`\nResult: ${ok} OK, ${fail} FAIL (showing first 5 rows)`);
  } catch(e) {
    console.log('CRASH:', e.message);
  }
}

// ── 2. TRADE FILE ──
function debugTrade() {
  divider('TRADE FILE');
  try {
    // FIX: cellDates:false prevents the MCX timestamp crash
    const wb = XLSX.readFile(FILES.trade, { cellDates: false, raw: false, cellText: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });

    console.log(`Total rows: ${rows.length}`);
    console.log('Column keys (first 15):', Object.keys(rows[0] || {}).slice(0, 15));

    let ok = 0, fail = 0;
    const grouped = {};

    for (const row of rows.slice(0, 10)) {
      const ucc         = String(row['Account Id'] || '').trim();
      const exchg       = String(row['Exchg. Seg'] || '').trim();
      const symbol      = String(row['Trading Symbol'] || '').trim();
      const traded      = parseFloat(row['Traded Value']) || 0;
      const tradeDateRaw = String(row['Trade Date'] || '').trim();
      const tradeDate   = parseDate(tradeDateRaw);
      const segment     = getSegment(exchg, symbol);

      if (!ucc || !tradeDate) {
        fail++;
        console.log(`  FAIL → ucc="${ucc}" date="${tradeDateRaw}"`);
        continue;
      }
      ok++;
      console.log(`  OK → UCC=${ucc} | Exchg=${exchg} | Symbol=${symbol} | Segment=${segment} | Value=${traded} | Date=${tradeDate}`);
    }
    console.log(`\nAll 24 rows result: ${ok} OK, ${fail} FAIL`);
    console.log('\nGrouped segments found:');
    Object.values(grouped).forEach(g => {
      console.log(`  UCC=${g.ucc} | Date=${g.trade_date} | Segment=${g.segment} | Turnover=${g.turnover}`);
    });
  } catch(e) {
    console.log('CRASH:', e.message);
  }
}

// ── 3. BROKERAGE FILE ──
function debugBrokerage() {
  divider('BROKERAGE FILE');
  try {
    const wb = XLSX.readFile(FILES.brokerage, { cellDates: false, raw: false, cellText: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];

    // FIX: range:3 skips blank row + 2 header rows
    const rows = XLSX.utils.sheet_to_json(sheet, { range: 3, header: 1, defval: '' });

    console.log(`Total rows after skip: ${rows.length}`);
    console.log('First raw row:', rows[0]);

    let ok = 0, fail = 0;
    for (const row of rows.slice(0, 5)) {
      const party     = String(row[0] || '').trim();
      const ucc       = extractUCC(party);
      const brokerage = parseFloat(row[7]) || 0;
      const turnover  = parseFloat(row[8]) || 0;

      if (!ucc) { fail++; console.log(`  FAIL → party="${party}" (no UCC extracted)`); continue; }
      ok++;
      console.log(`  OK → UCC=${ucc} | Party="${party}" | Brokerage(col7)=${brokerage} | Turnover(col8)=${turnover}`);
    }
    console.log(`\nResult: ${ok} OK, ${fail} FAIL (showing first 5 rows)`);
  } catch(e) {
    console.log('CRASH:', e.message);
  }
}

// ── 4. LEDGER FILE ──
function debugLedger() {
  divider('LEDGER FILE');
  try {
    const wb = XLSX.readFile(FILES.ledger, { cellDates: false, raw: false, cellText: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];

    // FIX: range:2 skips blank row + header row
    const rows = XLSX.utils.sheet_to_json(sheet, { range: 2, header: 1, defval: 0 });

    console.log(`Total rows after skip: ${rows.length}`);
    console.log('First raw row:', rows[0]);

    let ok = 0, fail = 0;
    for (const row of rows.slice(0, 5)) {
      const ucc     = String(row[0] || '').trim();
      const debit   = parseFloat(row[2]) || 0;
      const credit  = parseFloat(row[3]) || 0;
      const balance = credit - debit;

      if (!ucc || isNaN(balance)) { fail++; console.log(`  FAIL → ucc="${ucc}" debit=${row[2]} credit=${row[3]}`); continue; }
      ok++;
      console.log(`  OK → UCC=${ucc} | Debit=${debit} | Credit=${credit} | Balance=${balance}`);
    }
    console.log(`\nResult: ${ok} OK, ${fail} FAIL (showing first 5 rows)`);
  } catch(e) {
    console.log('CRASH:', e.message);
  }
}

// ── 5. MTF FILE ──
function debugMTF() {
  divider('MTF FILE');
  try {
    const wb = XLSX.readFile(FILES.mtf, { cellDates: false, raw: false, cellText: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];

    // FIX: range:1 skips the blank row 0, uses row 1 as header
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', range: 1 });

    console.log(`Total rows: ${rows.length}`);
    console.log('Column keys:', Object.keys(rows[0] || {}));
    console.log('First row:', JSON.stringify(rows[0]));

    let ok = 0, fail = 0;
    for (const row of rows.slice(0, 5)) {
      const ucc        = String(row['UCC'] || '').trim();
      const fromDate   = parseDate(row['From\nDate'] || row['FromDate'] || row['From Date'] || row['VoucherDate'] || row['Voucher\nDate']);
      const interest   = parseFloat(row['Interest\n(Rs.)'] || row['Interest(Rs.)'] || row['Interest'] || 0);
      const netCharged = parseFloat(row['Net\nCharged'] || row['NetCharged'] || row['Net Charged'] || 0);

      if (!ucc || ucc === 'UCC' || !fromDate) { fail++; console.log(`  FAIL → ucc="${ucc}" fromDate="${fromDate}"`); continue; }
      const monthYear = fromDate.substring(0, 7);
      ok++;
      console.log(`  OK → UCC=${ucc} | FromDate=${fromDate} | MonthYear=${monthYear} | Interest=${interest} | NetCharged=${netCharged}`);
    }
    console.log(`\nResult: ${ok} OK, ${fail} FAIL (showing first 5 rows)`);
  } catch(e) {
    console.log('CRASH:', e.message);
  }
}

// ── 6. HOLDINGS FILE ──
function debugHoldings() {
  divider('HOLDINGS FILE');
  try {
    const wb = XLSX.readFile(FILES.holdings, { cellDates: false, raw: false, cellText: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    console.log(`Total rows: ${rawRows.length}`);
    console.log('First raw row:', rawRows[0]);

    const holdings = {};
    let ok = 0, fail = 0;

    for (const row of rawRows) {
      const rawStr = String(row[0] || '').trim();
      if (!rawStr) continue;

      const parts = rawStr.split('|');
      if (parts.length < 12) { fail++; console.log(`  FAIL → not enough parts (${parts.length}): ${rawStr}`); continue; }

      const ucc   = String(parts[0]).trim();
      const isin  = String(parts[1]).trim();
      const qty   = parseFloat(parts[2]) || 0;
      const price = parseFloat(parts[6]) || 0;

      // FIX: use parts[11] (precomputed value) instead of qty * price
      const value = parseFloat(parts[11]) || 0;

      if (!ucc) { fail++; continue; }

      if (!holdings[ucc]) holdings[ucc] = 0;
      holdings[ucc] += value;
      ok++;
    }

    console.log(`\nRows parsed: ${ok} OK, ${fail} FAIL`);
    console.log('Aggregated holdings per UCC:');
    Object.entries(holdings).forEach(([ucc, total]) => {
      console.log(`  UCC=${ucc} → Total Holding Value=₹${total.toFixed(2)}`);
    });
  } catch(e) {
    console.log('CRASH:', e.message);
  }
}

// ── RUN ALL ──
debugClientMaster();
debugTrade();
debugBrokerage();
debugLedger();
debugMTF();
debugHoldings();