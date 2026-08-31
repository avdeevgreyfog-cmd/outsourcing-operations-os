BEGIN;

-- 9000_demo_seed.sql intentionally remains compatible with the original schema.
-- After it runs, map its legacy status values into the new commercial lifecycle.
UPDATE requests
SET stage = CASE status
  WHEN 'draft' THEN 'new'
  WHEN 'calculated' THEN 'calculation'
  WHEN 'approved' THEN 'proposal_ready'
  WHEN 'sent' THEN 'proposal_sent'
  WHEN 'negotiation' THEN 'negotiation'
  WHEN 'accepted' THEN 'accepted'
  ELSE stage
END,
outcome = CASE WHEN status='accepted' THEN 'accepted' ELSE outcome END;

UPDATE calculations
SET origin = CASE WHEN request_id IS NULL THEN 'standalone' ELSE 'request' END,
    title = COALESCE(title, calculation_number);

UPDATE proposals p
SET accepted_at = COALESCE(accepted_at, CASE WHEN status='accepted' THEN created_at ELSE NULL END),
    client_snapshot = CASE WHEN client_snapshot='{}'::jsonb THEN jsonb_build_object(
      'client', c.name,
      'requestTitle', r.title
    ) ELSE client_snapshot END
FROM requests r
LEFT JOIN client_companies c ON c.id=r.client_company_id
WHERE p.request_id=r.id;

COMMIT;
