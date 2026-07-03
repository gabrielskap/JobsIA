-- =============================================================================
-- MIGRATION: 0017_unify_validation_rules.sql
-- Unificação de regras na tabela JobsIA_validation_rules e depreciação de JobsIA_norm_rules.
-- =============================================================================

BEGIN;

-- 1. Evolução da tabela JobsIA_validation_rules
ALTER TABLE "JobsIA_validation_rules" ADD COLUMN IF NOT EXISTS texto_orientacao TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobsIA_validation_rules" ADD COLUMN IF NOT EXISTS aplicabilidade_job INTEGER[] DEFAULT NULL;
ALTER TABLE "JobsIA_validation_rules" ADD COLUMN IF NOT EXISTS casos_teste JSONB DEFAULT NULL;

-- Atualizar o texto_orientacao usando a mensagem da própria regra por padrão para as já existentes
UPDATE "JobsIA_validation_rules" SET texto_orientacao = mensagem WHERE texto_orientacao = '';

-- 2. Adicionar campos de snapshot na tabela de checklists
ALTER TABLE "JobsIA_checklists" ADD COLUMN IF NOT EXISTS applied_rules_snapshot JSONB DEFAULT NULL;
ALTER TABLE "JobsIA_checklists" ADD COLUMN IF NOT EXISTS applied_rules_hash TEXT DEFAULT NULL;

-- 3. Depreciação de JobsIA_norm_rules
-- Fazer backup de dados caso existam regras personalizadas
CREATE TABLE IF NOT EXISTS "JobsIA_norm_rules_backup" AS SELECT * FROM "JobsIA_norm_rules";

-- Dropar a tabela original para que possamos recriá-la como view de compatibilidade
DROP TABLE IF EXISTS "JobsIA_norm_rules" CASCADE;

-- Criar a view de compatibilidade somente leitura
CREATE OR REPLACE VIEW "JobsIA_norm_rules" AS
SELECT
  id,
  ambiente AS environment,
  texto_orientacao AS rule,
  created_at,
  status,
  version,
  previous_version_id,
  ativo AS active
FROM "JobsIA_validation_rules";

COMMIT;
