-- =============================================================================
-- MIGRATION: 0005_add_parameter_type.sql
-- Banco: PostgreSQL
-- Objetivo: Suporte a tipos de parâmetros na tabela JobsIA_parameters
-- =============================================================================

BEGIN;

-- 1. Adicionar coluna parameter_type com default 'flag'
ALTER TABLE "JobsIA_parameters"
  ADD COLUMN IF NOT EXISTS parameter_type TEXT NOT NULL DEFAULT 'flag';

-- 2. Permitir que flag seja nulo
ALTER TABLE "JobsIA_parameters"
  ALTER COLUMN flag DROP NOT NULL;

ALTER TABLE "JobsIA_parameters"
  ALTER COLUMN flag SET DEFAULT NULL;

-- 3. Ajustar registros existentes se for migração
UPDATE "JobsIA_parameters"
SET
  parameter_type = 'positional',
  flag = NULL
WHERE job_type_id = 1;

-- 4. Garantir a constraint de domínio
ALTER TABLE "JobsIA_parameters"
  DROP CONSTRAINT IF EXISTS chk_parameter_type;

ALTER TABLE "JobsIA_parameters"
  ADD CONSTRAINT chk_parameter_type
  CHECK (parameter_type IN ('flag', 'positional', 'internal', 'generated'));

COMMIT;
