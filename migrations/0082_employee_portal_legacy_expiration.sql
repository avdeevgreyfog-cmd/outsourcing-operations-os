-- Safely convert only the previous implementation's automatic 30-day expiry
-- to permanent links. An explicitly entered date is not derived exactly from created_at.
-- Manual expiry dates, auto-revocation dates, revoked links, and tokens are unchanged.
-- Existing audit/history is preserved; the redacted trigger from 0080 records the change.
UPDATE worker_timesheet_links
SET expires_at=NULL,changed_at=now()
WHERE status IN ('active','paused')
  AND replaced_by_link_id IS NULL
  AND expires_at IS NOT NULL
  AND auto_revoke_at IS NULL
  AND portal_config_snapshot->>'validDays'='30'
  AND expires_at BETWEEN created_at+interval '30 days'-interval '5 seconds'
                     AND created_at+interval '30 days'+interval '5 seconds';
