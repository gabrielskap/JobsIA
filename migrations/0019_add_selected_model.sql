-- MIGRATION: 0019_add_selected_model.sql
BEGIN;

ALTER TABLE "JobsIA_profiles"
  ADD COLUMN IF NOT EXISTS selected_model TEXT DEFAULT 'claude-sonnet';

COMMIT;
