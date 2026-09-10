-- ============================================================================
-- clientiq_remove_closed_uccs_15.sql
-- Permanently removes 15 CLOSED-account UCCs from the clients table (and their
-- CRM-layer records). Trade/turnover HISTORY is preserved by default so past MIS
-- totals still reconcile — an OPTIONAL full-purge block is at the bottom.
--
-- Same procedure as the repo's delete_closed_uccs.sql, scoped to these 15 UCCs.
-- Runs in ONE transaction: review the preview + verify counts, then COMMIT (or ROLLBACK).
-- Safe to run in the pgAdmin Query Tool. ⚠️ TAKE A DB BACKUP FIRST — this is irreversible.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _closed_uccs (ucc text PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _closed_uccs (ucc) VALUES
  ('CHR00279'),
  ('CHM00595'),
  ('CHB00242'),
  ('CHN00039'),
  ('CHP00119'),
  ('CHP00240'),
  ('MTS01432'),
  ('CHV01137'),
  ('CHG00253'),
  ('CHH00049'),
  ('CHV00206'),
  ('MTF42868'),
  ('CHM00200'),
  ('94442868'),
  ('CHS00285')
;

-- ── PREVIEW: how many of these UCCs actually exist in clients ──
-- (uccs_in_file should be 15; matched_in_clients = how many are really there.
--  Any difference = a UCC already gone or mistyped — check before committing.)
SELECT (SELECT COUNT(*) FROM _closed_uccs) AS uccs_in_file,
       (SELECT COUNT(*) FROM clients WHERE ucc IN (SELECT ucc FROM _closed_uccs)) AS matched_in_clients;

-- Optional: list which of the 15 are NOT in clients (already removed / typo).
SELECT z.ucc AS not_found_in_clients
FROM _closed_uccs z
LEFT JOIN clients c ON c.ucc = z.ucc
WHERE c.ucc IS NULL
ORDER BY 1;

-- ── Remove the CRM-layer footprint of these clients (guarded: only tables that
--    exist AND have a ucc column are touched, so a missing table is skipped) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_scores','lead_pool','unmap_requests','interactions','nudges','mapping_approvals','mapping_history'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = t)
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'ucc') THEN
      EXECUTE format('DELETE FROM %I WHERE ucc IN (SELECT ucc FROM _closed_uccs)', t);
    END IF;
  END LOOP;
END $$;

-- ── Remove the clients themselves ──
DELETE FROM clients WHERE ucc IN (SELECT ucc FROM _closed_uccs);

-- ── VERIFY: closed UCCs still present in clients (must be 0) ──
SELECT COUNT(*) AS remaining_closed_clients FROM clients WHERE ucc IN (SELECT ucc FROM _closed_uccs);
SELECT COUNT(*) AS clients_remaining FROM clients;

-- ── OPTIONAL FULL PURGE (leave commented unless you ALSO want to erase these
--    clients' trade/turnover HISTORY — WARNING: this CHANGES past-month MIS totals,
--    so April etc. will no longer reconcile to the brokerage report). To use it,
--    uncomment the block and re-run before COMMIT. ──
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY['trades','daily_trades','client_monthly_summary','daily_ledger','holdings_summary','mtf_interest','mtf_monthly'] LOOP
--     IF EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = t)
--        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'ucc') THEN
--       EXECUTE format('DELETE FROM %I WHERE ucc IN (SELECT ucc FROM _closed_uccs)', t);
--     END IF;
--   END LOOP;
-- END $$;

-- Review the preview + verify counts above. If correct:
COMMIT;
-- If anything looks wrong instead, run:  ROLLBACK;
