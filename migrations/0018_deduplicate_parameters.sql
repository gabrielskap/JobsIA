-- =============================================================================
-- MIGRATION: 0018_deduplicate_parameters.sql
-- Banco: PostgreSQL
-- Objetivo: Remover parâmetros duplicados e garantir unicidade por (job_type_id, name)
-- =============================================================================

BEGIN;

-- 1. Remover registros duplicados mantendo apenas o primeiro inserido (menor ID via min de texto)
DELETE FROM "JobsIA_parameters"
WHERE id NOT IN (
  SELECT MIN(id::text)::uuid
  FROM "JobsIA_parameters"
  GROUP BY job_type_id, name
);

-- 2. Adicionar restrição de unicidade para evitar futuras duplicações (removendo antes se existir)
ALTER TABLE "JobsIA_parameters"
  DROP CONSTRAINT IF EXISTS unique_job_parameter_name;

ALTER TABLE "JobsIA_parameters"
  ADD CONSTRAINT unique_job_parameter_name UNIQUE (job_type_id, name);

COMMIT;
