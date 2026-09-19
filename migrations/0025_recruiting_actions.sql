BEGIN;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS workflow_details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS source_snapshot jsonb;
UPDATE candidate_applications a SET source_snapshot=jsonb_build_object('source',c.source,'channel',c.source_channel,'campaign',c.source_campaign,'reference',c.source_reference)
FROM candidates c WHERE c.id=a.candidate_id AND a.source_snapshot IS NULL;
CREATE INDEX IF NOT EXISTS idx_candidate_action_due ON candidate_applications(organization_id,next_action_at) WHERE stage NOT IN ('started','first_shift','rejected','no_show');
COMMIT;
