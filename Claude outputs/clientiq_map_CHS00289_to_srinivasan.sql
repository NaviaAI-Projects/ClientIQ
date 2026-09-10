-- ============================================================================
-- Map client CHS00289 to the EXISTING RM "Srinivasan" (direct assignment).
-- No opt-in / no approval. Guarded: only maps if exactly one RM matches "srinivasan".
-- Runs in ONE transaction — review the previews, then COMMIT (or ROLLBACK).
-- ============================================================================

BEGIN;

-- ── Which RM(s) match "srinivasan"? (should be exactly one row) ──
SELECT id, rm_name, status FROM rm_master WHERE rm_name ILIKE '%srinivasan%' ORDER BY rm_name;

-- ── Does CHS00289 exist, and who is it mapped to now? ──
SELECT z.ucc,
       CASE WHEN c.ucc IS NULL THEN 'NOT FOUND' ELSE 'ok' END AS in_clients,
       rm.rm_name AS currently_mapped_to
FROM (VALUES ('CHS00289')) z(ucc)
LEFT JOIN clients c    ON c.ucc = z.ucc
LEFT JOIN rm_master rm ON rm.id = c.assigned_rm_id;

-- ── Direct assignment, guarded to a single matching RM ──
DO $$
DECLARE rid int; cnt int;
BEGIN
  SELECT COUNT(*), MIN(id) INTO cnt, rid
  FROM rm_master WHERE rm_name ILIKE '%srinivasan%';     -- <-- exact rm_name if multiple match

  IF cnt = 0 THEN
    RAISE EXCEPTION 'No RM matching "srinivasan" in rm_master — create the RM first.';
  ELSIF cnt > 1 THEN
    RAISE EXCEPTION 'Multiple RMs match "srinivasan" — replace the ILIKE pattern with the exact rm_name.';
  END IF;

  UPDATE clients
  SET assigned_rm_id = rid,
      is_mapped      = TRUE,
      mapped_at      = NOW(),
      updated_at     = NOW()
  WHERE ucc = 'CHS00289';

  RAISE NOTICE 'Mapped % client(s) to rm_master id %.',
    (SELECT COUNT(*) FROM clients WHERE assigned_rm_id = rid AND ucc = 'CHS00289'), rid;
END $$;

-- ── VERIFY ──
SELECT c.ucc, c.name, rm.rm_name AS mapped_to, c.mapped_at
FROM clients c JOIN rm_master rm ON rm.id = c.assigned_rm_id
WHERE c.ucc = 'CHS00289';

-- If correct:  COMMIT;   If not:  ROLLBACK;
COMMIT;
