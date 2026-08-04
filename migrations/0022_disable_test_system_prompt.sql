-- =============================================================================
-- MIGRATION: 0022_disable_test_system_prompt.sql
-- Objetivo: remover somente a diretriz de testes unitários que foi deixada
-- ativa por versões anteriores da suíte de integração.
-- =============================================================================

BEGIN;

UPDATE "JobsIA_system_prompts"
SET is_active = false
WHERE is_active = true
  AND btrim(content) = 'Você é um assistente especialista de testes unitários do JobsIA.';

COMMIT;
