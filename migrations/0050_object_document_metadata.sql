BEGIN;

-- Object documents stay in the shared document model: business date, version,
-- author and expiry are explicit rather than being inferred from free-form notes.
ALTER TABLE object_documents
  ADD COLUMN IF NOT EXISTS document_date date,
  ADD COLUMN IF NOT EXISTS version_label text;

ALTER TABLE object_documents DROP CONSTRAINT IF EXISTS object_documents_version_label_check;
ALTER TABLE object_documents ADD CONSTRAINT object_documents_version_label_check
  CHECK (version_label IS NULL OR length(trim(version_label)) BETWEEN 1 AND 80);

CREATE INDEX IF NOT EXISTS idx_object_documents_document_date
  ON object_documents(organization_id,object_id,document_date DESC)
  WHERE status<>'archived';

COMMIT;
