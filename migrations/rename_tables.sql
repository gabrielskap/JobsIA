-- =============================================================================
-- MIGRATION: Renomear tabelas para o padrão JobsIA_*
-- Banco: PostgreSQL
-- Data: 2026-05-14
--
-- ATENÇÃO: Execute este script em uma única transação.
-- FK constraints sobrevivem ao rename (PostgreSQL usa OIDs internamente).
-- Views, funções e triggers que referenciam os nomes antigos como strings
-- precisarão ser atualizados manualmente após este script.
-- =============================================================================

BEGIN;

-- 1. profiles → JobsIA_profiles
ALTER TABLE IF EXISTS profiles RENAME TO "JobsIA_profiles";

-- 2. dictionary_terms → JobsIA_dictionary_terms
ALTER TABLE IF EXISTS dictionary_terms RENAME TO "JobsIA_dictionary_terms";

-- 3. norm_rules → JobsIA_norm_rules
ALTER TABLE IF EXISTS norm_rules RENAME TO "JobsIA_norm_rules";

-- 4. job_types → JobsIA_types
ALTER TABLE IF EXISTS job_types RENAME TO "JobsIA_types";

-- 5. job_parameters → JobsIA_parameters
ALTER TABLE IF EXISTS job_parameters RENAME TO "JobsIA_parameters";

-- 6. conversations → JobsIA_conversations
ALTER TABLE IF EXISTS conversations RENAME TO "JobsIA_conversations";

-- 7. messages → JobsIA_messages
ALTER TABLE IF EXISTS messages RENAME TO "JobsIA_messages";

-- 8. checklists → JobsIA_checklists
ALTER TABLE IF EXISTS checklists RENAME TO "JobsIA_checklists";

-- 9. system_prompts → JobsIA_system_prompts
ALTER TABLE IF EXISTS system_prompts RENAME TO "JobsIA_system_prompts";

-- =============================================================================
-- Atualizar nomes de sequences geradas automaticamente (se existirem)
-- Postgres renomeia sequences vinculadas a SERIAL automaticamente no ALTER TABLE,
-- mas sequences criadas manualmente precisam ser renomeadas explicitamente.
-- =============================================================================

-- Sequences de profiles
ALTER SEQUENCE IF EXISTS profiles_id_seq RENAME TO "JobsIA_profiles_id_seq";

-- Sequences de dictionary_terms
ALTER SEQUENCE IF EXISTS dictionary_terms_id_seq RENAME TO "JobsIA_dictionary_terms_id_seq";

-- Sequences de norm_rules
ALTER SEQUENCE IF EXISTS norm_rules_id_seq RENAME TO "JobsIA_norm_rules_id_seq";

-- Sequences de job_types
ALTER SEQUENCE IF EXISTS job_types_id_seq RENAME TO "JobsIA_types_id_seq";

-- Sequences de job_parameters
ALTER SEQUENCE IF EXISTS job_parameters_id_seq RENAME TO "JobsIA_parameters_id_seq";

-- Sequences de conversations
ALTER SEQUENCE IF EXISTS conversations_id_seq RENAME TO "JobsIA_conversations_id_seq";

-- Sequences de messages
ALTER SEQUENCE IF EXISTS messages_id_seq RENAME TO "JobsIA_messages_id_seq";

-- Sequences de checklists
ALTER SEQUENCE IF EXISTS checklists_id_seq RENAME TO "JobsIA_checklists_id_seq";

-- Sequences de system_prompts
ALTER SEQUENCE IF EXISTS system_prompts_id_seq RENAME TO "JobsIA_system_prompts_id_seq";

-- =============================================================================
-- Recriar políticas RLS se referenciarem os nomes antigos como strings.
-- As políticas baseadas em OID sobrevivem automaticamente.
-- Verifique com: SELECT tablename, policyname FROM pg_policies;
-- =============================================================================

-- =============================================================================
-- Verificação pós-rename (execute como SELECT para conferir):
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
-- =============================================================================

COMMIT;
