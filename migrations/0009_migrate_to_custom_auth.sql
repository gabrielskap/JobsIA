-- =============================================================================
-- MIGRATION: 0009_migrate_to_custom_auth.sql
-- Banco: PostgreSQL
-- Objetivo: Finalizar a transição para Custom Auth desabilitando RLS de forma robusta
-- =============================================================================

BEGIN;

-- 1. Garantir que a tabela users existe e a FK com profiles está correta
ALTER TABLE "JobsIA_profiles"
  DROP CONSTRAINT IF EXISTS "profiles_user_id_fkey";

ALTER TABLE "JobsIA_profiles"
  ADD CONSTRAINT "profiles_user_id_fkey"
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 2. Desabilitar RLS (Row Level Security) em todas as tabelas JobsIA_*
ALTER TABLE "JobsIA_profiles"         DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_types"            DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_parameters"       DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_checklists"       DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_dictionary_terms" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_norm_rules"       DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_system_prompts"   DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_conversations"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_messages"         DISABLE ROW LEVEL SECURITY;

-- 3. Remover políticas RLS remanescentes se existirem
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE tablename LIKE 'JobsIA_%' OR tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END
$$;

-- 4. Remover trigger e função remanescentes da autenticação externa se existirem
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

COMMIT;
