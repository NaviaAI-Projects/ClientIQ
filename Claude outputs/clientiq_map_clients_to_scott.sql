-- ============================================================================
-- clientiq_map_clients_to_scott.sql
-- Directly map 3 clients to the EXISTING RM "Scott" (no opt-in, no approval).
--
-- Assumes the RM already exists in rm_master. The block below is guarded: it
-- refuses to run if it finds NO RM matching "scott" or MORE THAN ONE (so it can
-- never map to the wrong RM). If it complains about multiple matches, put the
-- exact rm_name in the two spots marked  <-- EXACT RM NAME.
--
-- Runs in ONE transaction. Review the previews, then COMMIT (or ROLLBACK).
-- ============================================================================

BEGIN;

-- ── Which RM(s) match "scott"? (should be exactly one row) ──
SELECT id, rm_name, status FROM rm_master WHERE rm_name ILIKE '%scott%' ORDER BY rm_name;

-- ── Which of the 3 UCCs exist in clients? (any missing here will NOT map) ──
SELECT z.ucc,
       CASE WHEN c.ucc IS NULL THEN 'NOT FOUND' ELSE 'ok' END AS in_clients,
       rm.rm_name AS currently_mapped_to
FROM (VALUES ('96001959'),('NF000016'),('NM000079')) z(ucc)
LEFT JOIN clients c    ON c.ucc = z.ucc
LEFT JOIN rm_master rm ON rm.id = c.assigned_rm_id
ORDER BY z.ucc;

-- ── Direct assignment, guarded to a single matching RM ──
DO $$
DECLARE rid int; cnt int;
BEGIN
  SELECT COUNT(*), MIN(id) INTO cnt, rid
  FROM rm_master WHERE rm_name ILIKE '%scott%';          -- <-- EXACT RM NAME (or keep the pattern)

  IF cnt = 0 THEN
    RAISE EXCEPTION 'No RM matching "scott" in rm_master — create the RM first.';
  ELSIF cnt > 1 THEN
    RAISE EXCEPTION 'Multiple RMs match "scott" — replace the ILIKE pattern with the exact rm_name.';
  END IF;

  UPDATE clients
  SET assigned_rm_id = rid,
      is_mapped      = TRUE,
      mapped_at      = NOW(),
      updated_at     = NOW()
  WHERE ucc IN ('96001959','NF000016','NM000079');

  RAISE NOTICE 'Mapped % client(s) to rm_master id %.',
    (SELECT COUNT(*) FROM clients WHERE assigned_rm_id = rid
       AND ucc IN ('96001959','NF000016','NM000079')), rid;
END $$;

-- ── VERIFY ──
SELECT c.ucc, c.name, rm.rm_name AS mapped_to, c.mapped_at
FROM clients c JOIN rm_master rm ON rm.id = c.assigned_rm_id
WHERE c.ucc IN ('96001959','NF000016','NM000079')
ORDER BY c.ucc;

-- If correct:  COMMIT;   If not:  ROLLBACK;
COMMIT;
