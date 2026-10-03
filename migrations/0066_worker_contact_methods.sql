BEGIN;
-- Contacts belong to the existing employee profile; no parallel person entity.
-- NULL inherits the linked candidate contacts until the employee contacts are edited.
-- An explicit empty array means the operator cleared them.
-- Additive only. Existing phone/email, candidate contacts and assignments are preserved.
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS contact_methods jsonb;
ALTER TABLE worker_profiles ADD CONSTRAINT worker_contact_methods_array CHECK(contact_methods IS NULL OR jsonb_typeof(contact_methods)='array' AND jsonb_array_length(contact_methods)<=12);
COMMIT;
