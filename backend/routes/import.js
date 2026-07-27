const express = require('express');
const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../db');
const auth    = require('../middleware/auth');
const fs      = require('fs');
const upload  = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } });
const audit = require('../utils/audit');
const BATCH_SIZE  = 2000;
const TRADE_BATCH = 200; // 200 rows × 19 cols = 3800 params (under 65535 limit)

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
  const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  const m2 = s.match(/^(\d{1,2})[\/\-]([a-zA-Z]{3})[\/\-](\d{2,4})$/);
  if (m2) {
    const day = m2[1].padStart(2, '0');
    const mon = months[m2[2].toLowerCase()] || '01';
    const yr  = m2[3].length === 2 ? '20' + m2[3] : m2[3];
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

function getSegment(exchg, instrName) {
  const e = String(exchg || '').toUpperCase().trim();
  const i = String(instrName || '').toUpperCase().trim();
  if (e === 'MCX' || e === 'NCDEX') {
    if (i === 'OPTFUT' || i === 'OPTIDX' || i === 'OPTSTK') return 'COMM_OPT';
    return 'COMM_FUT';
  }
  if (e === 'NFO' || e === 'BFO') {
    if (i === 'OPTIDX' || i === 'OPTSTK') return 'EQ_OPT';
    return 'EQ_FUT';
  }
  return 'EQ_CASH';
}

const FILE_LABELS = {
  client_master: 'Client Master',
  nse_cm: 'NSE Cash', bse_cm: 'BSE Cash', nse_fo: 'NSE F&O', bse_fo: 'BSE F&O', mcx: 'MCX',
  trade: 'Trade File',
  brokerage: 'Brokerage File',
  ledger: 'Ledger File', holdings: 'Holdings File', mtf: 'MTF File'
};

// The Ledger date comes from the FILE NAME. Accepts, in order:
//   DD-MM-YYYY (any of - _ / . separators)  e.g. "Ledger_17-07-2026.csv"
//   DDMMYYYY   (8 digits)                    e.g. "Ledger_17072026.xlsx"
//   DDMMYY     (6 digits, 20YY)              e.g. "SUBTRIAL_270726_1.xlsx" → 27 Jul 2026
// Returns 'YYYY-MM-DD' or null.
function parseLedgerDateFromName(name) {
  const s = String(name || '');
  let dd, mm, yyyy, m;
  if ((m = s.match(/(\d{2})[-_/.](\d{2})[-_/.](\d{4})/)))                { dd = +m[1]; mm = +m[2]; yyyy = +m[3]; }
  else if ((m = s.match(/(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/)))          { dd = +m[1]; mm = +m[2]; yyyy = +m[3]; }
  else if ((m = s.match(/(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/)))          { dd = +m[1]; mm = +m[2]; yyyy = 2000 + +m[3]; }
  else return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');           // reject impossible dates like 31-02-2026
  if (isNaN(d.getTime()) || d.getUTCDate() !== dd) return null;
  return iso;
}

// The Holdings file carries no date inside it, so its holding_date comes from the FILE NAME.
// Expected format: DDMMYYYY (8 digits, separators - _ / or . optional) somewhere in the name,
// e.g. "SYMPHONY_colISIN_19052026.csv" → 19 May 2026. Returns 'YYYY-MM-DD' or null.
function parseHoldingDateFromName(name) {
  const s = String(name || '');
  const m = s.match(/(\d{2})[-_/.]?(\d{2})[-_/.]?(\d{4})/);
  if (!m) return null;
  const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), yyyy = parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');           // reject impossible dates like 31022026
  if (isNaN(d.getTime()) || d.getUTCDate() !== dd) return null;
  return iso;
}

// Trade slots → the exchange + segment their file must carry inside (Xchg / Sgmt columns).
const TRADE_SLOTS = {
  nse_cm: { xchg: 'NSE', sgmt: 'CM' }, bse_cm: { xchg: 'BSE', sgmt: 'CM' },
  nse_fo: { xchg: 'NSE', sgmt: 'FO' }, bse_fo: { xchg: 'BSE', sgmt: 'FO' },
  mcx:    { xchg: 'MCX', sgmt: 'CO' },
};

// Validate a file's format for its chosen slot BEFORE any duplicate/other check, so a wrong
// file (e.g. a Trade file dropped into the Client Master slot) always reports "Invalid file
// format" instead of a misleading duplicate popup. Returns { ok, detail }.
function validateFileFormat(file_type, filePath, originalname) {
  const norm  = (s) => String(s ?? '').replace(/_x000[dD]_/g, '').replace(/[\s\r\n]+/g, '').toUpperCase();
  const fname = (originalname || filePath || '').toLowerCase();
  try {
    // Pipe-delimited text types
    if (file_type === 'ledger' || file_type === 'holdings') {
      // NEW Ledger format: xlsx trial-balance with a header row [UCC, Account Name, Closing Debit, Closing Credit].
      if (file_type === 'ledger' && (fname.endsWith('.ods') || fname.endsWith('.xlsx') || fname.endsWith('.xls'))) {
        const wb = XLSX.readFile(filePath); const sh = wb.Sheets[wb.SheetNames[0]];
        const arr = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
        const hdr = (arr.find(r => Array.isArray(r) && norm(r[0]) === 'UCC') || []).map(c => norm(c));
        const ok = hdr[0] === 'UCC' && hdr.some(c => c.startsWith('CLOSING'));
        return ok ? { ok: true }
                  : { ok: false, detail: 'Ledger (xlsx) must have a header row with columns: UCC, Account Name, Closing Debit, Closing Credit.' };
      }
      let lines;
      if (file_type === 'holdings' && (fname.endsWith('.ods') || fname.endsWith('.xlsx') || fname.endsWith('.xls'))) {
        const wb = XLSX.readFile(filePath); const sh = wb.Sheets[wb.SheetNames[0]];
        lines = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' })
          .map(r => (Array.isArray(r) ? String(r[0] ?? '') : String(r ?? '')).trim()).filter(l => l.includes('|'));
      } else {
        lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.replace(/\r$/, '').trim()).filter(Boolean);
      }
      const need = file_type === 'ledger' ? 23 : 12;
      const ok = lines.length > 0 && lines.slice(0, 25).every(l => l.split('|').length === need)
        && String(lines[0].split('|')[0]).trim().length > 0;   // UCC may be alphanumeric (e.g. BAA00110)
      return ok ? { ok: true } : { ok: false, detail: file_type === 'ledger'
        ? 'Base Capital / Ledger must be pipe-delimited ( | ) with 23 columns (UCC in column 1).'
        : 'Holdings must be pipe-delimited ( | ) with 12 columns (UCC in column 1).' };
    }
    // Spreadsheet / CSV types
    const wb  = XLSX.readFile(filePath, { raw: true, dense: true });
    const sh  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    if (file_type === 'client_master') {
      const h = (rows[0] || []).map(norm);
      return h.includes('UCC') ? { ok: true } : { ok: false, detail: 'Client Master must have a UCC and Client Name header row.' };
    }
    if (TRADE_SLOTS[file_type]) {
      const h = (rows[0] || []).map(norm);
      const headerOk = h[0] === 'TRADDT' && h[1] === 'BIZDT' && h[2] === 'SGMT' && h[4] === 'XCHG'
        && h[18] === 'CLNTID' && h[24] === 'BUYSELLIND';
      if (!headerOk) return { ok: false, detail: 'Trade file must be the 46-column exchange export (TradDt, BizDt, Sgmt, Src, Xchg … ClntId … BuySellInd …).' };
      const want = TRADE_SLOTS[file_type];
      const d = rows[1] || [];
      const gotX = String(d[4] ?? '').trim().toUpperCase();
      const gotS = String(d[2] ?? '').trim().toUpperCase();
      const ok = (!gotX || gotX === want.xchg) && (!gotS || gotS === want.sgmt);
      return ok ? { ok: true } : { ok: false, detail: `This looks like a ${gotX}/${gotS} file, but this slot expects ${want.xchg} ${want.sgmt}. Please upload the correct file here.` };
    }
    if (file_type === 'brokerage') {
      const ncols = sh['!ref'] ? (XLSX.utils.decode_range(sh['!ref']).e.c + 1) : 0;
      const hIdx  = rows.findIndex(r => norm(r[0]) === 'UCC'); const h = hIdx >= 0 ? rows[hIdx] : [];
      const ok = hIdx >= 0 && ncols === 31 && norm(h[1]).startsWith('CLIENTNAME') && norm(h[4]).startsWith('TRADEDATE');
      return ok ? { ok: true } : { ok: false, detail: 'Brokerage must be the ALL-SEGMENTS export (31 columns with UCC, Client Name and Trade Date).' };
    }
    if (file_type === 'mtf') {
      const hIdx = rows.findIndex(r => norm(r[0]).startsWith('FROMDATE')); const h = hIdx >= 0 ? rows[hIdx] : [];
      const ok = hIdx >= 0 && norm(h[1]).startsWith('TODATE') && norm(h[4]).startsWith('INTEREST');
      return ok ? { ok: true } : { ok: false, detail: 'MTF must have From Date, To Date, Interest Rate, Grace Days, Interest (Rs.), Net Charged columns.' };
    }
    return { ok: true }; // unknown type → let the import branch handle it
  } catch (e) {
    return { ok: false, detail: 'The file could not be read — please upload the correct format.' };
  }
}

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { file_type } = req.body;
  const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  // ── Format check FIRST — a wrong file in a slot reports "Invalid file format"
  //    before any duplicate/other check (e.g. a Trade file dropped into Client Master). ──
  const fmt = validateFileFormat(file_type, req.file.path, req.file.originalname);
  if (!fmt.ok) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'Invalid file format — please upload the correct format for this file type.', detail: fmt.detail });
  }

  // ── Ledger date comes from the FILE NAME (DD-MM-YYYY), not the upload day ──
  // Parsed up-front so the same-date duplicate check and stored ledger_date both use it.
  // No parseable date → reject, so a mis-named file can never be silently mis-dated.
  let ledgerFileDate = null;
  if (file_type === 'ledger') {
    ledgerFileDate = parseLedgerDateFromName(req.file.originalname);
    if (!ledgerFileDate) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: 'Invalid file format — please upload the correct format for this file type.',
        detail: 'The Ledger filename must contain the ledger date in DD-MM-YYYY format (e.g. Ledger_17-07-2026.csv). Rename the file with its date and re-upload.'
      });
    }
  }

  // ── Holdings date comes from the FILE NAME (DDMMYYYY), not the upload day ──
  let holdingFileDate = null;
  if (file_type === 'holdings') {
    holdingFileDate = parseHoldingDateFromName(req.file.originalname);
    if (!holdingFileDate) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: 'Invalid file format — please upload the correct format for this file type.',
        detail: 'The Holdings filename must contain the holding date in DDMMYYYY format (e.g. SYMPHONY_colISIN_19052026.csv). Rename the file with its date and re-upload.'
      });
    }
  }

  // ── Duplicate pre-check ───────────────────────────────────────
  // Warn (HTTP 409) if this file/data was already imported, unless the user chose to overwrite.
  // Client Master → conflict on ANY prior client_master import (it's a full-base replace).
  // Other files   → conflict on same file_type + same file name already imported.
  // Trade & Brokerage carry a real trade date INSIDE the file, so they are duplicate-
  // checked AFTER parsing, by that date (see the check just before COMMIT below):
  // a different trade date uploads freely, only the same date already loaded is blocked.
  // Ledger and Holdings carry their date in the FILE NAME, so they are duplicate-checked by
  // that date AFTER parsing (with the Trade/Brokerage block below), not here by upload day.
  // The remaining snapshot files (client master, mtf) have no date at all and are checked
  // here by upload day.
  if (!overwrite && !['nse_cm', 'bse_cm', 'nse_fo', 'bse_fo', 'mcx', 'brokerage', 'ledger', 'holdings'].includes(file_type)) {
    try {
      const dup = await pool.query(
        `SELECT file_name, created_at, records_processed FROM import_log
         WHERE file_type = $1 AND status IN ('success','partial')
           AND created_at::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
         ORDER BY created_at DESC LIMIT 1`,
        [file_type]);
      if (dup.rows.length > 0) {
        const p = dup.rows[0];
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const when = p.created_at ? new Date(p.created_at).toLocaleString('en-IN') : 'earlier today';
        return res.status(409).json({
          conflict: true,
          file_type,
          file_name: req.file.originalname,
          message: file_type === 'client_master'
            ? `A Client Master file was already imported today (${p.file_name}, ${p.records_processed} records at ${when}). Replacing will update all client records.`
            : `A ${FILE_LABELS[file_type] || file_type} was already uploaded today (${p.file_name}, ${p.records_processed} records at ${when}). Replace the existing data?`,
          existing: { file_name: p.file_name, imported_at: p.created_at, records: p.records_processed }
        });
      }
    } catch (e) {
      console.warn('Duplicate pre-check skipped:', e.message); // never block import on a check failure
    }
  }

  let processed = 0, failed = 0, skipped = 0;
  let dataDate  = null;   // real data/trade date parsed from the file (for the audit log Trade Date column)
  const errors  = [];
  const dbClient = await pool.connect();

  try {
    const workbook  = XLSX.readFile(req.file.path, { cellDates: false, raw: true, dense: true });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];

    await dbClient.query('BEGIN');
    await dbClient.query("SET statement_timeout = '600000'"); // 10 min

    // ── CLIENT MASTER ─────────────────────────────────────
    if (file_type === 'client_master') {
      const rows   = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });
      const uccMap = {};

      for (const row of rows) {
        const ucc  = String(row['UCC'] || '').trim();
        const name = String(row['Client Name'] || '').trim();
        if (!ucc || !name) { failed++; continue; }
        const status      = String(row['Accross Exch\nOverall Status'] || row['Accross ExchOverall Status'] || row['Overall Status'] || '').trim();
        const clientType  = String(row['Client Type'] || row['Type'] || 'RI').trim();
        const regdDate    = parseDate(row['Regd Date']);
        const lastTrade   = parseDate(String(row['Last Trade\nAccross Exch'] || row['Last TradeAccross Exch'] || '').trim());
        const isActive    = status.toLowerCase().includes('active');
        uccMap[ucc] = { ucc, name, clientType, regdDate, lastTrade, isActive, status: status || 'Active' };
      }

      const dedupedRows = Object.values(uccMap);
      for (let i = 0; i < dedupedRows.length; i += BATCH_SIZE) {
        const batch = dedupedRows.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.name, r.clientType, 'zero-brokerage', r.regdDate, r.lastTrade, r.isActive, r.status);
        }
        await dbClient.query(`
          INSERT INTO clients (ucc, name, client_type, plan, account_open_date, last_trade_date, is_active, status)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc) DO UPDATE SET
            name              = EXCLUDED.name,
            client_type       = EXCLUDED.client_type,
            account_open_date = EXCLUDED.account_open_date,
            last_trade_date   = EXCLUDED.last_trade_date,
            is_active         = EXCLUDED.is_active,
            status            = EXCLUDED.status,
            updated_at        = NOW()
        `, params);
        processed += batch.length;
      }
    }

    // ── TRADE FILE — NCL F&O Position export (F&O only) ────────────────
    // Management format: 46-column NCL/NSE F&O position file. Each row is a client's open
    // position in one contract for the day, carrying BOTH the day's buy and sell trading
    // qty/value. We split each row into a buy leg and a sell leg so the raw `trades` table
    // and the 90-day summary (which aggregate by buy_sell) keep working unchanged.
    // Unified exchange trade format (46 cols) for all 5 slots: NSE_CM, BSE_CM, NSE_FO, BSE_FO, MCX.
    // Key cols (0-indexed): 1=BizDt(date) 2=Sgmt(CM/FO/CO) 4=Xchg 7=FinInstrmTp 10=TckrSymb 12=XpryDt
    //   14=StrkPric 15=OptnTp 18=ClntId(UCC) 24=BuySellInd(B/S) 25=TradQty 27=Pric.
    else if (TRADE_SLOTS[file_type]) {
      const arr  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      const slot = TRADE_SLOTS[file_type];

      // ── Exact-format validation: 46-column exchange header, exact names & order ──
      const EXPECTED = ['TradDt','BizDt','Sgmt','Src','Xchg','ClrMmbId','Brkr','FinInstrmTp','FinInstrmId',
        'ISIN','TckrSymb','SctySrs','XpryDt','FininstrmActlXpryDt','StrkPric','OptnTp','FinInstrmNm','ClntTp',
        'ClntId','FullyExctdConfSnt','OrgnlCtdnPtcptId','CtdnPtcptId','SttlmTp','SctiesSttlmTxId','BuySellInd',
        'TradQty','NewBrdLotQty','Pric','UnqTradIdr','RptdTxSts','TradDtTm','UpdDt','OrdrRef','OrdrDtTm',
        'InstgUsr','CtclId','TradRegnOrgn','OrdrTp','BlckDealInd','SttlmCycl','MktTpandId','Rmks',
        'Rsvd1','Rsvd2','Rsvd3','Rsvd4'];
      const header = (arr[0] || []).map(c => String(c ?? '').trim());
      const headerOk = header.length >= EXPECTED.length && EXPECTED.every((name, i) => header[i] === name);
      if (!headerOk) {
        throw new Error('FORMAT:Trade file must be the 46-column exchange export — TradDt, BizDt, Sgmt, Src, Xchg … ClntId … BuySellInd, TradQty … Pric.');
      }

      const { rows: uccRows } = await dbClient.query('SELECT ucc FROM clients');
      const knownUCCs = new Set(uccRows.map(r => String(r.ucc).trim()));
      const grouped   = {};
      const tradeRows = [];
      const dates     = new Set();   // trade dates present in THIS file → scope the summary rebuild to just these

      for (let ri = 1; ri < arr.length; ri++) {
        const row = arr[ri];
        if (!row || row.length < 28) continue;
        const ucc       = String(row[18] ?? '').trim();              // ClntId
        const tradeDate = parseDate(String(row[1] ?? '').trim());    // BizDt
        if (!ucc || !tradeDate) { failed++; continue; }
        if (!dataDate || tradeDate > dataDate) dataDate = tradeDate; // capture the file's trade date even if the client isn't mapped yet
        if (!knownUCCs.has(ucc)) { skipped++; continue; }
        dates.add(tradeDate);

        const seg       = (String(row[2] ?? '').trim().toUpperCase() || slot.sgmt);   // CM / FO / CO
        const exchange  = (String(row[4] ?? '').trim().toUpperCase() || slot.xchg);   // NSE / BSE / MCX
        const instrName = String(row[7] ?? '').trim();               // FinInstrmTp (STK/STF/IDO/FUO…)
        const tkr       = String(row[10] ?? '').trim();              // TckrSymb
        const expiry    = parseDate(String(row[12] ?? '').trim());   // XpryDt
        const strike    = parseFloat(row[14]) || null;               // StrkPric
        const ot        = String(row[15] ?? '').trim().toUpperCase() || null; // OptnTp
        const isOption  = ot === 'CE' || ot === 'PE';
        const bs        = String(row[24] ?? '').trim().toUpperCase().startsWith('S') ? 'S' : 'B'; // BuySellInd
        const qty       = parseFloat(row[25]) || 0;                  // TradQty
        const price     = parseFloat(row[27]) || 0;                  // Pric
        const value     = qty * price;                               // traded value = qty × price
        if (qty <= 0 && value <= 0) { skipped++; continue; }         // nothing to record

        // Readable, contract-unique trading symbol
        const symbol = isOption
          ? `${tkr} ${strike != null ? strike : ''}${ot}${expiry ? ' ' + expiry : ''}`.replace(/\s+/g, ' ').trim()
          : (expiry ? `${tkr} FUT ${expiry}`.trim() : tkr);

        // Execution time-of-day from TradDtTm (col 31, e.g. "2026-07-16T12:03:00") → "HH:MM:SS".
        // trans_time is a character-varying column, so we store the plain time string.
        const rawDtTm   = String(row[30] ?? '').trim();
        const timePart  = (rawDtTm.split(/[T ]/)[1] || '').slice(0, 8);
        const transTime = /^\d{2}:\d{2}/.test(timePart) ? timePart : null;

        // One raw `trades` row per executed trade. Segment (CM/FO/CO) is stored in product_type. Columns:
        // (ucc, client_name, trade_date, trans_time, exchange, trading_symbol, instrument_name,
        //  buy_sell, trade_qty, trade_price, traded_value, product_type, order_type, option_type,
        //  strike_price, expiry_date, trade_id, order_no, pan_number)
        tradeRows.push([ucc, '', tradeDate, transTime, exchange, symbol, instrName,
          bs, qty, price, value, seg, null, ot, strike, expiry, null, null, null]);

        // Aggregate for daily_trades, split by segment.
        const key = `${ucc}__${tradeDate}`;
        if (!grouped[key]) grouped[key] = {
          ucc, trade_date: tradeDate,
          eq_cash: 0, eq_fo: 0, comm: 0, opt_prem: 0,
          instruments: {}, calls: 0, puts: 0
        };
        if (seg === 'CM')      grouped[key].eq_cash += value;
        else if (seg === 'CO') grouped[key].comm    += value;
        else                   grouped[key].eq_fo   += value;   // FO
        grouped[key].opt_prem += isOption ? value : 0;
        if (symbol) grouped[key].instruments[symbol] = (grouped[key].instruments[symbol] || 0) + value;
        if (ot === 'CE') grouped[key].calls += value;
        if (ot === 'PE') grouped[key].puts  += value;
        processed++;
      }

      // Ensure indexes exist (created once, kept across imports). Previously they were DROPPED
      // and REBUILT on every upload, which re-indexed the WHOLE trades table each time and got
      // slower as data grew — unworkable at 180-day scale. Keep them; incremental inserts are fine.
      await dbClient.query('CREATE INDEX IF NOT EXISTS idx_trades_ucc ON trades(ucc)');
      await dbClient.query('CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date)');
      await dbClient.query('CREATE INDEX IF NOT EXISTS idx_trades_ucc_date ON trades(ucc, trade_date)');
      await dbClient.query('CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(trading_symbol)');

      // 1. Bulk insert individual trades (TRADE_BATCH kept small to avoid param limit)
      for (let i = 0; i < tradeRows.length; i += TRADE_BATCH) {
        const batch = tradeRows.slice(i, i + TRADE_BATCH);
        const values = [], params = [];
        let pi = 1;
        for (const t of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(...t);
        }
        await dbClient.query(`
          INSERT INTO trades (ucc, client_name, trade_date, trans_time, exchange, trading_symbol,
            instrument_name, buy_sell, trade_qty, trade_price, traded_value, product_type,
            order_type, option_type, strike_price, expiry_date, trade_id, order_no, pan_number)
          VALUES ${values.join(',')}
        `, params);
      }

      // Delete raw trades older than 90 days (per document)
      await dbClient.query(`DELETE FROM trades WHERE trade_date < CURRENT_DATE - INTERVAL '90 days'`);

      // ══ 90-DAY TRADE SUMMARY (points 30/31) ═══════════════════════════════
      // One summarized row per client per trade date, rebuilt from the raw
      // `trades` table on every import. Trade Insights reads ONLY from this
      // table. Realized P&L is stored (per-day matched buy/sell). A compact
      // per-symbol breakdown is kept in the `symbols` JSONB so instrument-level
      // panels can be reconstructed without touching raw trades. Rolls off at 90 days.
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS trade_summary_90d (
          ucc          TEXT      NOT NULL,
          trade_date   DATE      NOT NULL,
          total_trades INTEGER   DEFAULT 0,
          total_qty    NUMERIC   DEFAULT 0,
          turnover     NUMERIC   DEFAULT 0,
          eq_cash_to   NUMERIC   DEFAULT 0,
          eq_fut_to    NUMERIC   DEFAULT 0,
          comm_to      NUMERIC   DEFAULT 0,
          options_to   NUMERIC   DEFAULT 0,
          call_to      NUMERIC   DEFAULT 0,
          put_to       NUMERIC   DEFAULT 0,
          cnc_to       NUMERIC   DEFAULT 0,
          mis_to       NUMERIC   DEFAULT 0,
          other_to     NUMERIC   DEFAULT 0,
          cnc_trades   INTEGER   DEFAULT 0,
          mis_trades   INTEGER   DEFAULT 0,
          buy_val      NUMERIC   DEFAULT 0,
          sell_val     NUMERIC   DEFAULT 0,
          buy_qty      NUMERIC   DEFAULT 0,
          sell_qty     NUMERIC   DEFAULT 0,
          realized_pnl NUMERIC   DEFAULT 0,
          symbols      JSONB     DEFAULT '[]'::jsonb,
          updated_at   TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (ucc, trade_date)
        )
      `);
      await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_tsum_date ON trade_summary_90d(trade_date)`);

      // Rebuild the summary for every (ucc, trade_date) still present in trades
      // (bounded to the 90-day window because trades were just purged above).
      await dbClient.query(`
        INSERT INTO trade_summary_90d (
          ucc, trade_date, total_trades, total_qty, turnover,
          eq_cash_to, eq_fut_to, comm_to, options_to, call_to, put_to,
          cnc_to, mis_to, other_to, cnc_trades, mis_trades,
          buy_val, sell_val, buy_qty, sell_qty, realized_pnl, symbols, updated_at)
        WITH sym AS (
          SELECT ucc, trade_date, trading_symbol AS s,
            MAX(UPPER(COALESCE(option_type,''))) AS ot,
            MAX(COALESCE(product_type,''))       AS pt,
            MAX(UPPER(COALESCE(exchange,'')))    AS ex,
            SUM(trade_qty)::float    AS q,
            COUNT(*)::int            AS n,
            SUM(traded_value)::float AS to_,
            SUM(CASE WHEN UPPER(buy_sell) LIKE 'B%' THEN traded_value ELSE 0 END)::float AS bv,
            SUM(CASE WHEN UPPER(buy_sell) LIKE 'S%' THEN traded_value ELSE 0 END)::float AS sv,
            SUM(CASE WHEN UPPER(buy_sell) LIKE 'B%' THEN trade_qty    ELSE 0 END)::float AS bq,
            SUM(CASE WHEN UPPER(buy_sell) LIKE 'S%' THEN trade_qty    ELSE 0 END)::float AS sq
          FROM trades
          WHERE trade_date = ANY($1::date[])
          GROUP BY ucc, trade_date, trading_symbol
        )
        SELECT
          ucc, trade_date,
          SUM(n)::int AS total_trades,
          SUM(q)      AS total_qty,
          SUM(to_)    AS turnover,
          SUM(CASE WHEN pt = 'CM' THEN to_ ELSE 0 END) AS eq_cash_to,
          SUM(CASE WHEN pt = 'FO' AND (ot IS NULL OR ot = '') THEN to_ ELSE 0 END) AS eq_fut_to,
          SUM(CASE WHEN pt = 'CO' THEN to_ ELSE 0 END) AS comm_to,
          SUM(CASE WHEN ot IN ('CE','PE') THEN to_ ELSE 0 END) AS options_to,
          SUM(CASE WHEN ot = 'CE' THEN to_ ELSE 0 END) AS call_to,
          SUM(CASE WHEN ot = 'PE' THEN to_ ELSE 0 END) AS put_to,
          -- Delivery (CNC) vs Intraday (MIS) derived per symbol/day from matched buy vs sell:
          --   matched qty = LEAST(buy_qty, sell_qty)  → intraday round-trip (both legs)
          --   leftover (net position carried forward)  → delivery
          -- Turnover splits the same way and always sums back to total turnover.
          SUM((bv + sv) - LEAST(bq, sq) * ((CASE WHEN bq > 0 THEN bv / bq ELSE 0 END) + (CASE WHEN sq > 0 THEN sv / sq ELSE 0 END))) AS cnc_to,
          SUM(LEAST(bq, sq) * ((CASE WHEN bq > 0 THEN bv / bq ELSE 0 END) + (CASE WHEN sq > 0 THEN sv / sq ELSE 0 END))) AS mis_to,
          0::numeric AS other_to,
          SUM(CASE WHEN LEAST(bq, sq) = 0 THEN n ELSE 0 END)::int AS cnc_trades,
          SUM(CASE WHEN LEAST(bq, sq) > 0 THEN n ELSE 0 END)::int AS mis_trades,
          SUM(bv) AS buy_val, SUM(sv) AS sell_val, SUM(bq) AS buy_qty, SUM(sq) AS sell_qty,
          SUM(CASE WHEN bq > 0 AND sq > 0
                   THEN ((sv / NULLIF(sq,0)) - (bv / NULLIF(bq,0))) * LEAST(bq, sq)
                   ELSE 0 END) AS realized_pnl,
          jsonb_agg(jsonb_build_object(
            's', s, 'ot', ot, 'pt', pt, 'ex', ex,
            'bv', bv, 'sv', sv, 'bq', bq, 'sq', sq, 'to', to_, 'n', n)) AS symbols,
          NOW()
        FROM sym
        GROUP BY ucc, trade_date
        ON CONFLICT (ucc, trade_date) DO UPDATE SET
          total_trades = EXCLUDED.total_trades, total_qty = EXCLUDED.total_qty, turnover = EXCLUDED.turnover,
          eq_cash_to = EXCLUDED.eq_cash_to, eq_fut_to = EXCLUDED.eq_fut_to, comm_to = EXCLUDED.comm_to,
          options_to = EXCLUDED.options_to, call_to = EXCLUDED.call_to, put_to = EXCLUDED.put_to,
          cnc_to = EXCLUDED.cnc_to, mis_to = EXCLUDED.mis_to, other_to = EXCLUDED.other_to,
          cnc_trades = EXCLUDED.cnc_trades, mis_trades = EXCLUDED.mis_trades,
          buy_val = EXCLUDED.buy_val, sell_val = EXCLUDED.sell_val,
          buy_qty = EXCLUDED.buy_qty, sell_qty = EXCLUDED.sell_qty,
          realized_pnl = EXCLUDED.realized_pnl, symbols = EXCLUDED.symbols, updated_at = NOW()
      `, [Array.from(dates)]);

      // Roll the summary window: drop rows for dates that have aged out of the 90-day window.
      await dbClient.query(`DELETE FROM trade_summary_90d WHERE trade_date < CURRENT_DATE - INTERVAL '90 days'`);

      // Compute top_instrument per UCC per day
      const dailyGroups = Object.values(grouped);
      dailyGroups.forEach(g => {
        const instEntries = Object.entries(g.instruments || {});
        if (instEntries.length > 0) {
          instEntries.sort((a, b) => b[1] - a[1]);
          g.top_instrument = instEntries[0][0]; // symbol with highest turnover
          // Determine instrument type from the symbol
          const topSym = g.top_instrument.toUpperCase();
          if (topSym.endsWith('CE'))       g.top_instrument_type = 'CE';
          else if (topSym.endsWith('PE'))  g.top_instrument_type = 'PE';
          else if (topSym.includes('FUT')) g.top_instrument_type = 'FUT';
          else                             g.top_instrument_type = 'EQ';
        }
        // Call/put ratio
        const totalOptions = g.calls + g.puts;
        g.call_put_ratio = totalOptions > 0 ? parseFloat((g.calls / totalOptions * 100).toFixed(2)) : null;
      });

      // 2. Upsert aggregated daily_trades
      const groupedRows = Object.values(grouped);
      for (let i = 0; i < groupedRows.length; i += BATCH_SIZE) {
        const batch = groupedRows.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const g of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(g.ucc, g.trade_date, g.eq_cash, g.eq_fo, g.comm, g.opt_prem,
            g.top_instrument || null, g.top_instrument_type || null, g.call_put_ratio || null);
        }
        await dbClient.query(`
          INSERT INTO daily_trades (ucc, trade_date, eq_cash_turnover, eq_fo_turnover,
            commodity_fo_turnover, options_premium_turnover,
            top_instrument, top_instrument_type, call_put_ratio)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, trade_date) DO UPDATE SET
            eq_cash_turnover        = EXCLUDED.eq_cash_turnover,
            eq_fo_turnover          = EXCLUDED.eq_fo_turnover,
            commodity_fo_turnover   = EXCLUDED.commodity_fo_turnover,
            options_premium_turnover = EXCLUDED.options_premium_turnover,
            top_instrument          = EXCLUDED.top_instrument,
            top_instrument_type     = EXCLUDED.top_instrument_type,
            call_put_ratio          = EXCLUDED.call_put_ratio
        `, params);
      }

      // 3. Update permanent monthly summaries (per document)
      await dbClient.query(`
        INSERT INTO client_monthly_summary (ucc, month_year, eq_cash_to, eq_fo_to, comm_to, opt_prem_to, trade_days)
        SELECT ucc,
          TO_CHAR(trade_date, 'YYYY-MM') as month_year,
          SUM(eq_cash_turnover),
          SUM(eq_fo_turnover),
          SUM(commodity_fo_turnover),
          SUM(options_premium_turnover),
          COUNT(DISTINCT trade_date)
        FROM daily_trades
        WHERE trade_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY ucc, TO_CHAR(trade_date, 'YYYY-MM')
        ON CONFLICT (ucc, month_year) DO UPDATE SET
          eq_cash_to  = EXCLUDED.eq_cash_to,
          eq_fo_to    = EXCLUDED.eq_fo_to,
          comm_to     = EXCLUDED.comm_to,
          opt_prem_to = EXCLUDED.opt_prem_to,
          trade_days  = EXCLUDED.trade_days
      `);

      // 4. Bulk update last_trade_date in clients
      const latestDates = {};
      for (const g of groupedRows) {
        if (!latestDates[g.ucc] || g.trade_date > latestDates[g.ucc]) latestDates[g.ucc] = g.trade_date;
      }
      const dateEntries = Object.entries(latestDates);
      for (let i = 0; i < dateEntries.length; i += BATCH_SIZE) {
        const batch  = dateEntries.slice(i, i + BATCH_SIZE);
        const vals   = batch.map((_, idx) => `($${idx*2+1}::date, $${idx*2+2})`).join(',');
        const prms   = batch.flatMap(([ucc, date]) => [date, ucc]);
        await dbClient.query(`
          UPDATE clients SET last_trade_date = GREATEST(last_trade_date, v.d), updated_at = NOW()
          FROM (VALUES ${vals}) AS v(d, ucc)
          WHERE clients.ucc = v.ucc
        `, prms);
      }
    }

    // ── BROKERAGE FILE (ALL SEGMENTS export) ──────────────────────────
    // Management format: multi-segment Excel, 31 columns, two-row grouped header, with a
    // party row ("NAME [UCC]") before each client's block. One row per client PER TRADE DATE.
    // col 0 = UCC, col 1 = Client Name, col 4 = Trade Date, col 17 = Total Brokerage,
    // col 18 = Total Turnover, col 29 = Net Brokerage. Brokerage is keyed by the file's own date.
    else if (file_type === 'brokerage') {
      const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const norm  = (s) => String(s ?? '').replace(/_x000[dD]_/g, '').replace(/[\s\r\n]+/g, '').toUpperCase();
      const ncols = sheet['!ref'] ? (XLSX.utils.decode_range(sheet['!ref']).e.c + 1) : 0;

      // ── Exact-format validation: 31 columns; header row carries UCC / Client Name / Trade Date ──
      const hIdx = rows.findIndex(r => norm(r[0]) === 'UCC');
      const h    = hIdx >= 0 ? rows[hIdx] : [];
      const okHeader = hIdx >= 0 && ncols === 31
        && norm(h[1]).startsWith('CLIENTNAME')
        && norm(h[4]).startsWith('TRADEDATE');
      if (!okHeader) {
        throw new Error('FORMAT:Brokerage file must be the ALL-SEGMENTS export — 31 columns with UCC, Client Name and Trade Date header columns.');
      }

      const brokerageMap = {};
      for (let i = hIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const ucc = String(row[0] ?? '').trim();
        if (!ucc || isNaN(Number(ucc))) continue;            // skip party rows / the sub-header row
        const tradeDate = parseDate(String(row[4] ?? '').trim());
        if (!tradeDate) { failed++; continue; }
        const brokerage = parseFloat(row[17]) || 0;          // col 17 = Total Brokerage
        const key = ucc + '__' + tradeDate;
        if (!brokerageMap[key]) brokerageMap[key] = { ucc, tradeDate, brokerage: 0 };
        brokerageMap[key].brokerage += brokerage;
        processed++;
      }

      const dedupedBrokerage = Object.values(brokerageMap);
      for (let i = 0; i < dedupedBrokerage.length; i += BATCH_SIZE) {
        const batch = dedupedBrokerage.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.tradeDate, r.brokerage);
        }
        await dbClient.query(`
          INSERT INTO daily_trades (ucc, trade_date, brokerage_earned)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, trade_date) DO UPDATE SET brokerage_earned = EXCLUDED.brokerage_earned
        `, params);
      }
    }

    // ── LEDGER FILE ───────────────────────────────────────────────────
    // NEW format: xlsx "Subsidiary Trial Balance" — header row [UCC, Account Name,
    // Closing Debit, Closing Credit]. Stored balance = Closing Credit − Closing Debit
    // (net client ledger balance; matches the file's own "Net Closing Balance" footer).
    // OLD format (kept as fallback): SYMPHONY RMS pipe-delimited text, 23 cols, col 4 = base capital.
    // ledger_date comes from the file name (parsed above) either way.
    else if (file_type === 'ledger') {
      const today = ledgerFileDate;          // ledger_date comes from the file name (parsed above)
      dataDate    = ledgerFileDate;          // record it as the file's date (audit log + duplicate check)

      const lname  = (req.file.originalname || req.file.path || '').toLowerCase();
      const isXlsx = lname.endsWith('.ods') || lname.endsWith('.xlsx') || lname.endsWith('.xls');

      const { rows: clientRows } = await dbClient.query('SELECT ucc FROM clients');
      const clientSet = new Set(clientRows.map(r => String(r.ucc).trim()));
      const ledgerMap = {};

      if (isXlsx) {
        const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        const hi  = arr.findIndex(r => Array.isArray(r) && String(r[0] ?? '').trim().toUpperCase() === 'UCC');
        if (hi < 0) throw new Error('FORMAT:Ledger (xlsx) must have a header row with UCC, Account Name, Closing Debit, Closing Credit.');
        const hdr    = arr[hi].map(c => String(c ?? '').replace(/[\r\n]+/g, ' ').replace(/_x000[dD]_/g, ' ').trim().toUpperCase());
        const debCol = hdr.findIndex(c => c.startsWith('CLOSING') && c.includes('DEBIT'));
        const creCol = hdr.findIndex(c => c.startsWith('CLOSING') && c.includes('CREDIT'));
        const numOf  = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
        for (let ri = hi + 1; ri < arr.length; ri++) {
          const row = arr[ri]; if (!Array.isArray(row)) continue;
          const ucc = String(row[0] ?? '').trim();
          if (!ucc || ucc.toUpperCase() === 'CLIENTS') continue;                                  // separator / blank rows
          if (/grand total|net closing balance/i.test(ucc + ' ' + String(row[1] ?? ''))) continue; // footer rows
          if (!clientSet.has(ucc)) { skipped++; continue; }                                        // not a known client
          ledgerMap[ucc] = { ucc, balance: numOf(row[creCol]) - numOf(row[debCol]), today };       // net = credit − debit
        }
      } else {
        const raw   = fs.readFileSync(req.file.path, 'utf8');
        const lines = raw.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim().length > 0);
        const sample    = lines.slice(0, 25);
        const wrongCols = sample.length === 0 || sample.some(l => l.split('|').length !== 23);
        const firstUcc  = lines[0] ? String(lines[0].split('|')[0]).trim() : '';
        if (wrongCols || !firstUcc) {
          throw new Error('FORMAT:Base Capital file must be pipe-delimited ( | ) with exactly 23 columns — UCC in column 1 and base capital in column 5.');
        }
        for (const line of lines) {
          const parts = line.split('|');
          const ucc = String(parts[0] || '').trim();
          if (!ucc) { failed++; continue; }   // UCC may be alphanumeric (BAA00110); only blank UCC is a real failure
          if (!clientSet.has(ucc)) { skipped++; continue; }        // skip member / non-client ids (not a failure)
          ledgerMap[ucc] = { ucc, balance: parseFloat(parts[4]) || 0, today };   // col 4 = base capital
        }
      }

      const dedupedLedger = Object.values(ledgerMap);
      for (let i = 0; i < dedupedLedger.length; i += BATCH_SIZE) {
        const batch = dedupedLedger.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.today, r.balance);
        }
        await dbClient.query(`
          INSERT INTO daily_ledger (ucc, ledger_date, opening_balance)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, ledger_date) DO UPDATE SET opening_balance = EXCLUDED.opening_balance
        `, params);
        processed += batch.length;
      }
    }

    // ── HOLDINGS FILE ─────────────────────────────────────
    else if (file_type === 'holdings') {
      const today    = holdingFileDate;      // holding_date comes from the file name (parsed above)
      dataDate       = holdingFileDate;      // record it as the file's date (audit log + duplicate check)
      const holdings = {};

      // Holdings may arrive as a plain pipe-delimited text file, OR as a spreadsheet
      // (.ods / .xlsx) whose single column holds the pipe-delimited strings.
      const fname = (req.file.originalname || req.file.path || '').toLowerCase();
      let lines;
      if (fname.endsWith('.ods') || fname.endsWith('.xlsx') || fname.endsWith('.xls')) {
        const rowsArr = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        lines = rowsArr
          .map(r => (Array.isArray(r) ? String(r[0] ?? '') : String(r ?? '')).trim())
          .filter(l => l.includes('|'));
      } else {
        // Read raw file — pipe-delimited, no headers
        const rawContent = fs.readFileSync(req.file.path, 'utf8');
        lines = rawContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      }

      // ── Exact-format validation: pipe-delimited, exactly 12 fields, numeric UCC in col 0 ──
      const hSample = lines.slice(0, 25);
      const hWrong  = hSample.length === 0 || hSample.some(l => l.split('|').length !== 12);
      const hUcc    = lines[0] ? String(lines[0].split('|')[0]).trim() : '';
      if (hWrong || !hUcc) {
        throw new Error('FORMAT:Holdings file must be pipe-delimited ( | ) with exactly 12 columns — UCC in column 1, quantity in column 3, price in column 12.');
      }

      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length < 4) continue;
        const ucc      = String(parts[0]).trim();
        if (!ucc) continue;   // UCC may be alphanumeric
        const qty      = parseFloat(parts[2])  || 0;  // col 2 = quantity
        const avgPrice = parseFloat(parts[11]) || 0;  // col 11 = average price per unit
        const value    = qty * avgPrice;               // total holding value
        if (value === 0) { skipped++; continue; }
        if (!holdings[ucc]) holdings[ucc] = 0;
        holdings[ucc] += value;
        processed++;
      }

      const holdingRows = Object.entries(holdings);
      for (let i = 0; i < holdingRows.length; i += BATCH_SIZE) {
        const batch = holdingRows.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const [ucc, totalValue] of batch) {
          values.push(`($${pi++},$${pi++},$${pi++})`);
          params.push(ucc, today, totalValue);
        }
        await dbClient.query(`
          INSERT INTO holdings_summary (ucc, holding_date, total_holding_value)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, holding_date) DO UPDATE SET total_holding_value = EXCLUDED.total_holding_value
        `, params);
      }
    }

    // ── MTF FILE (weekly) ─────────────────────────────────────────────
    // Management format: 6-column Excel — header (From Date, To Date, Interest Rate,
    // Grace Days, Interest (Rs.), Net Charged), then a party row "NAME [UCC]" before each
    // client's interest periods. Each period's interest is spread evenly across its days
    // (interest ÷ day-count, inclusive) for real daily MTF interest — done at read time in the MIS.
    else if (file_type === 'mtf') {
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const norm = (s) => String(s ?? '').replace(/_x000[dD]_/g, '').replace(/[\s\r\n]+/g, '').toUpperCase();

      // ── Exact-format validation: header carries From Date / To Date / Interest (Rs.) ──
      const hIdx = rows.findIndex(r => norm(r[0]).startsWith('FROMDATE'));
      const h    = hIdx >= 0 ? rows[hIdx] : [];
      const okHeader = hIdx >= 0 && norm(h[1]).startsWith('TODATE') && norm(h[4]).startsWith('INTEREST');
      if (!okHeader) {
        throw new Error('FORMAT:MTF file must be the interest export — From Date, To Date, Interest Rate, Grace Days, Interest (Rs.), Net Charged header columns.');
      }

      // Period table — one row per client interest period; the MIS spreads it to daily.
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS mtf_interest (
          ucc TEXT NOT NULL, from_date DATE NOT NULL, to_date DATE NOT NULL,
          interest NUMERIC DEFAULT 0, rate NUMERIC DEFAULT 0, updated_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (ucc, from_date, to_date)
        )
      `);
      await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_mtf_int_dates ON mtf_interest(from_date, to_date)`);

      const periods = {};
      let currentUcc = null;
      for (let i = hIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const c0  = String(row[0] ?? '').trim();
        const bracket = c0.match(/\[(\d+)\]/);
        if (bracket) { currentUcc = bracket[1]; continue; }      // party row → set current client
        const fromDate = parseDate(c0);
        const toDate   = parseDate(String(row[1] ?? '').trim());
        if (!currentUcc || !fromDate || !toDate) continue;       // skip totals / blank rows
        const rate     = parseFloat(row[2]) || 0;
        const interest = parseFloat(row[4]) || 0;                // col 4 = Interest (Rs.)
        periods[`${currentUcc}__${fromDate}__${toDate}`] = { ucc: currentUcc, fromDate, toDate, interest, rate };
        processed++;
      }

      const rowsArr = Object.values(periods);
      for (let i = 0; i < rowsArr.length; i += BATCH_SIZE) {
        const batch = rowsArr.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.fromDate, r.toDate, r.interest, r.rate);
        }
        await dbClient.query(`
          INSERT INTO mtf_interest (ucc, from_date, to_date, interest, rate)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, from_date, to_date) DO UPDATE SET
            interest = EXCLUDED.interest, rate = EXCLUDED.rate, updated_at = NOW()
        `, params);
      }

      // Recompute the monthly rollup from all periods (Client 360 / concentration views).
      await dbClient.query(`
        INSERT INTO mtf_monthly (ucc, month_year, avg_mtf_balance, interest_earned, from_date, to_date, interest_rate)
        SELECT ucc, TO_CHAR(from_date,'YYYY-MM'), 0, SUM(interest), MIN(from_date), MAX(to_date), AVG(rate)
        FROM mtf_interest
        GROUP BY ucc, TO_CHAR(from_date,'YYYY-MM')
        ON CONFLICT (ucc, month_year) DO UPDATE SET
          interest_earned = EXCLUDED.interest_earned,
          from_date = EXCLUDED.from_date, to_date = EXCLUDED.to_date, interest_rate = EXCLUDED.interest_rate
      `);
    }

    else if (file_type === 'bhavcopy') {
      await dbClient.query('COMMIT');
      dbClient.release();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.json({ message: 'Bhavcopy not required — holdings file already contains computed values', processed: 0, failed: 0 });
    }

    // ── Duplicate check for date-bearing files (Trade, Brokerage, Ledger), by the file's REAL date ──
    // Trade/Brokerage carry the date inside the file; Ledger carries it in the file name. Either way,
    // a different date uploads normally; only the SAME date already imported is blocked (unless the
    // user chose Replace). This runs post-parse so it can roll back the just-parsed rows.
    if (!overwrite && ['nse_cm', 'bse_cm', 'nse_fo', 'bse_fo', 'mcx', 'brokerage', 'ledger', 'holdings'].includes(file_type) && dataDate) {
      await dbClient.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS trade_date DATE`);
      const dupd = await dbClient.query(
        `SELECT file_name, created_at, records_processed FROM import_log
         WHERE file_type = $1 AND trade_date = $2 AND status IN ('success','partial')
         ORDER BY created_at DESC LIMIT 1`,
        [file_type, dataDate]);
      if (dupd.rows.length > 0) {
        const p = dupd.rows[0];
        await dbClient.query('ROLLBACK');
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const dstr = new Date(dataDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        return res.status(409).json({
          conflict: true,
          file_type,
          file_name: req.file.originalname,
          message: `A ${FILE_LABELS[file_type] || file_type} for ${dstr} was already uploaded (${p.records_processed} records). Replace that date's data?`,
          existing: { file_name: p.file_name, imported_at: p.created_at, records: p.records_processed }
        });
      }
    }

    await dbClient.query('COMMIT');
    const audit = require('../utils/audit');

    // Inside handleUpload after dbClient.query('COMMIT'):
    await audit(req,
      overwrite ? 'IMPORT_REPLACED' : 'FILE_IMPORT',
      `${overwrite ? 'Replaced' : 'Imported'} ${processed} records, ${skipped} skipped, ${failed} failed (${req.file.originalname})`,
      null, failed > 0 ? 'partial' : 'success', 'import');

    await pool.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS trade_date DATE`);
    await pool.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS records_skipped INT DEFAULT 0`);
    await pool.query(`
      INSERT INTO import_log (import_date, file_type, file_name, records_processed, records_failed, records_skipped, status, imported_by, trade_date, created_at)
      VALUES (NOW() AT TIME ZONE 'Asia/Kolkata',$1,$2,$3,$4,$5,$6,$7,$8,NOW() AT TIME ZONE 'Asia/Kolkata')
    `, [file_type, req.file.originalname, processed, failed, skipped,
        failed === 0 ? 'success' : (processed > 0 ? 'partial' : 'failed'), req.user.id, dataDate]);

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.json({ message: 'Import complete', processed, skipped, failed, errors: errors.slice(0, 10) });

  } catch (err) {
    await dbClient.query('ROLLBACK').catch(() => {});
    if (fs.existsSync(req.file?.path)) fs.unlinkSync(req.file.path);
    // Format-validation failures are surfaced as a clean 400 (not a server error).
    if (err && typeof err.message === 'string' && err.message.startsWith('FORMAT:')) {
      return res.status(400).json({ message: 'Invalid file format — please upload the correct format for this file type.', detail: err.message.slice(7) });
    }
    console.error('IMPORT ERROR:', err.message);
    res.status(500).json({ message: 'Import failed', error: err.message });
  } finally {
    dbClient.release();
  }
});

router.get('/logs', auth, async (req, res) => {
  try {
    const from = req.query.from || null, to = req.query.to || null;
    const cond = [], params = [];
    if (from) { params.push(from); cond.push(`il.created_at::date >= $${params.length}`); }
    if (to)   { params.push(to);   cond.push(`il.created_at::date <= $${params.length}`); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const result = await pool.query(`
      SELECT il.*, u.name AS imported_by_name FROM import_log il
      LEFT JOIN users u ON il.imported_by = u.id
      ${where}
      ORDER BY il.created_at DESC LIMIT 500
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
});

router.post('/run-pipeline', auth, async (req, res) => {
  try {
    res.json({ message: 'Import pipeline completed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Pipeline failed', error: err.message });
  }
});

module.exports = router;