-- =============================================================================
-- MIGRATION: Adicionar ON UPDATE CASCADE na FK de JobsIA_parameters.job_type_id
-- Banco: PostgreSQL
-- Data: 2026-05-14
--
-- Objetivo: quando o id de um tipo de job (JobsIA_types) for alterado,
-- o job_type_id em JobsIA_parameters é atualizado automaticamente pelo banco.
-- =============================================================================

BEGIN;

-- 1. Descobrir o nome atual da constraint (execute o SELECT abaixo para confirmar)
-- SELECT conname
-- FROM pg_constraint
-- WHERE conrelid = '"JobsIA_parameters"'::regclass
--   AND contype = 'f';

-- 2. Remover a FK existente (ajuste o nome se necessário — veja o SELECT acima)
ALTER TABLE "JobsIA_parameters"
  DROP CONSTRAINT IF EXISTS job_parameters_job_type_id_fkey;

-- Nome alternativo gerado após o rename:
ALTER TABLE "JobsIA_parameters"
  DROP CONSTRAINT IF EXISTS "JobsIA_parameters_job_type_id_fkey";

-- 3. Recriar a FK com ON UPDATE CASCADE e ON DELETE CASCADE
ALTER TABLE "JobsIA_parameters"
  ADD CONSTRAINT "JobsIA_parameters_job_type_id_fkey"
  FOREIGN KEY (job_type_id)
  REFERENCES "JobsIA_types" (id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

-- =============================================================================
-- Verificação pós-migration:
-- SELECT conname, confupdtype, confdeltype
-- FROM pg_constraint
-- WHERE conrelid = '"JobsIA_parameters"'::regclass
--   AND contype = 'f';
--
-- confupdtype = 'a' significa CASCADE (action).
-- =============================================================================

COMMIT;
