-- =============================================================================
-- MIGRATION: 0004_add_cascade_update_parameters.sql
-- Banco: PostgreSQL
-- Objetivo: Adicionar ON UPDATE CASCADE na FK de JobsIA_parameters.job_type_id
-- =============================================================================

BEGIN;

-- 1. Remover FKs antigas se existirem
ALTER TABLE "JobsIA_parameters"
  DROP CONSTRAINT IF EXISTS job_parameters_job_type_id_fkey;

ALTER TABLE "JobsIA_parameters"
  DROP CONSTRAINT IF EXISTS "JobsIA_parameters_job_type_id_fkey";

-- 2. Recriar a FK com ON UPDATE CASCADE e ON DELETE CASCADE
ALTER TABLE "JobsIA_parameters"
  ADD CONSTRAINT "JobsIA_parameters_job_type_id_fkey"
  FOREIGN KEY (job_type_id)
  REFERENCES "JobsIA_types" (id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

COMMIT;
