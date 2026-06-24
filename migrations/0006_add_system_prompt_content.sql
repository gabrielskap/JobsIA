-- =============================================================================
-- MIGRATION: 0006_add_system_prompt_content.sql
-- Banco: PostgreSQL
-- Objetivo: Garantir colunas content e is_active na tabela JobsIA_system_prompts
-- =============================================================================

BEGIN;

ALTER TABLE "JobsIA_system_prompts"
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMIT;
