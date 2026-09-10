-- ============================================================================
-- ClientIQ · Create a new RM and directly map an AP's clients to that RM
-- ----------------------------------------------------------------------------
-- One-time operation. Direct assignment (NO opt-in email, NO supervisor approval).
--
-- FILL IN 3 THINGS below, then run the whole file in pgAdmin / psql:
--   1. RM_FULL_NAME  — the new RM's name  (must be IDENTICAL in the users row and
--                       the rm_master row — that name is how the two are linked)
--   2. rm_email / RM_PHONE — the new RM's login email and phone
--   3. The AP's client UCCs — in the ap_uccs VALUES list in section (B)
--
-- The whole thing runs in ONE transaction: if anything looks wrong in the
-- verification output, ROLLBACK instead of COMMIT and nothing is changed.
-- ============================================================================

BEGIN;

-- ---- (A) Create the RM: login row + rm_master mapping target -----------------
-- These two INSERTs mirror EXACTLY what the Users & Roles "Add User" screen does.
-- Default login password is  Navia@123  (the bcrypt hash below). TELL THE RM TO
-- CHANGE IT after first login. (If you'd rather, create the RM in the UI first and
-- then DELETE this whole section (A) — sections B–E still map the clients.)
INSERT INTO users (name, email, password_hash, role, supervisor_sub_role, agent_number, phone, permissions)
VALUES (
  'RM_FULL_NAME',                       -- <-- new RM name
  'rm_email@navia.co.in',               -- <-- new RM login email
  '$2b$10$zGu3yCpeLsbZTff1Xt4.1O7aEic/L1Jtda07NGlT3C.T69wBGy3wW',  -- bcrypt('Navia@123')
  'rm',                                 -- role = RM
  NULL, NULL,
  'RM_PHONE',                           -- <-- new RM phone (or NULL)
  NULL
)
ON CONFLICT DO NOTHING;                 -- safe to re-run; won't duplicate

INSERT INTO rm_master (rm_name, capacity, status)
VALUES ('RM_FULL_NAME', 100, 'active')  -- <-- SAME name as above
ON CONFLICT DO NOTHING;

-- ---- (B) The AP's client UCCs ------------------------------------------------
-- Paste the AP's UCCs here, each quoted, comma-separated. Keeping them in a temp
-- table lets us both assign them AND report any that don't match the client master.
CREATE TEMP TABLE ap_uccs (ucc TEXT) ON COMMIT DROP;
INSERT INTO ap_uccs (ucc) VALUES
  ('UCC1'),
  ('UCC2'),
  ('UCC3')                              -- <-- replace with the full AP UCC list
;

-- ---- (C) Sanity check: UCCs in your list that are NOT in the client master ----
-- Review this list — these will NOT be mapped (typo, closed, or not yet imported).
SELECT a.ucc AS unmatched_ucc_will_not_map
FROM ap_uccs a
LEFT JOIN clients c ON c.ucc = a.ucc
WHERE c.ucc IS NULL
ORDER BY 1;

-- ---- (D) Direct bulk-assign (no opt-in / no approval) ------------------------
UPDATE clients c
SET assigned_rm_id = rm.id,
    is_mapped      = TRUE,
    mapped_at      = NOW(),
    updated_at     = NOW()
FROM rm_master rm
WHERE rm.rm_name = 'RM_FULL_NAME'       -- <-- SAME name again
  AND c.ucc IN (SELECT ucc FROM ap_uccs);

-- ---- (E) Verify before committing -------------------------------------------
-- How many clients are now mapped to this RM, and how many UCCs you supplied.
SELECT rm.rm_name,
       COUNT(*)                         AS clients_now_mapped,
       (SELECT COUNT(*) FROM ap_uccs)   AS uccs_supplied
FROM clients c
JOIN rm_master rm ON rm.id = c.assigned_rm_id
WHERE rm.rm_name = 'RM_FULL_NAME'
GROUP BY rm.rm_name;

-- If the numbers look right:  COMMIT;
-- If anything is off:         ROLLBACK;
COMMIT;
