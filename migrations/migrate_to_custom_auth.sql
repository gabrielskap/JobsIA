-- Migration: substituir Auth por tabela users própria
-- Executar uma única vez no banco PostgreSQL de destino

-- 1. Criar tabela de usuários (substitui auth.users)
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        UNIQUE NOT NULL,
  password_hash TEXT      NOT NULL,
  name        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Remover FK antiga que referenciava auth.users (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'JobsIA_profiles_user_id_fkey'
      AND table_name = 'JobsIA_profiles'
  ) THEN
    ALTER TABLE "JobsIA_profiles" DROP CONSTRAINT "JobsIA_profiles_user_id_fkey";
  END IF;
END
$$;

-- 3. Adicionar FK de JobsIA_profiles apontando para a nova tabela users
ALTER TABLE "JobsIA_profiles"
  ADD CONSTRAINT "profiles_user_id_fkey"
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 4. Desabilitar RLS (Row Level Security) — autenticação passa a ser feita na camada API
ALTER TABLE "JobsIA_profiles"       DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_types"          DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_parameters"     DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_checklists"     DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_dictionary_terms" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_norm_rules"     DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JobsIA_system_prompts" DISABLE ROW LEVEL SECURITY;

-- 5. Remover políticas RLS remanescentes (se existirem)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE tablename LIKE 'JobsIA_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END
$$;

-- 6. Remover trigger que criava perfis automaticamente via auth.users (se existir)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();
