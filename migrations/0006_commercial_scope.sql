BEGIN;
ALTER TABLE calculations ADD COLUMN assigned_team_id uuid REFERENCES teams(id);
UPDATE calculations c SET assigned_team_id=r.assigned_team_id FROM requests r WHERE r.id=c.request_id AND c.assigned_team_id IS NULL;
CREATE INDEX idx_calculations_team ON calculations(organization_id,assigned_team_id,created_at DESC);
CREATE UNIQUE INDEX objects_source_request_unique ON objects(organization_id,source_request_id) WHERE source_request_id IS NOT NULL;
COMMIT;
