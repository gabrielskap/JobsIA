-- =============================================================================
-- ROLLBACK SCHEMA: Remove todas as tabelas e views do JobsIA
-- Executar para limpar o banco de dados completamente (ambiente vazio)
-- =============================================================================

BEGIN;

-- 1. Remover views dependentes
DROP VIEW IF EXISTS v_checklist_history CASCADE;
DROP VIEW IF EXISTS v_checklist_kpis CASCADE;

-- 2. Remover tabelas na ordem inversa de suas dependências (FKs)
DROP TABLE IF EXISTS "JobsIA_refresh_tokens" CASCADE;
DROP TABLE IF EXISTS "JobsIA_messages" CASCADE;
DROP TABLE IF EXISTS "JobsIA_conversations" CASCADE;
DROP TABLE IF EXISTS "JobsIA_checklists" CASCADE;
DROP TABLE IF EXISTS "JobsIA_parameters" CASCADE;
DROP TABLE IF EXISTS "JobsIA_types" CASCADE;
DROP TABLE IF EXISTS "JobsIA_dictionary_terms" CASCADE;
DROP VIEW IF EXISTS "JobsIA_norm_rules" CASCADE;
DROP TABLE IF EXISTS "JobsIA_norm_rules" CASCADE;
DROP TABLE IF EXISTS "JobsIA_norm_rules_backup" CASCADE;
DROP TABLE IF EXISTS "JobsIA_system_prompts" CASCADE;
DROP TABLE IF EXISTS "JobsIA_profiles" CASCADE;
DROP TABLE IF EXISTS "JobsIA_audit_logs" CASCADE;
DROP TABLE IF EXISTS "JobsIA_validation_results" CASCADE;
DROP TABLE IF EXISTS "JobsIA_validation_runs" CASCADE;
DROP TABLE IF EXISTS "JobsIA_validation_rules" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- 3. Remover types/enums residuais (se existirem)
DROP TYPE IF EXISTS checklist_status CASCADE;
DROP TYPE IF EXISTS flow_type_enum CASCADE;
DROP TYPE IF EXISTS parameter_type_enum CASCADE;

COMMIT;
