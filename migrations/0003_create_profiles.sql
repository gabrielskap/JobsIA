-- =============================================================================
-- MIGRATION: 0003_create_profiles.sql
-- Banco: PostgreSQL
-- Objetivo: Garantir colunas e índices de JobsIA_profiles sem dependências de provedores de autenticação externos
-- =============================================================================

BEGIN;

-- 1. Garantir que as colunas básicas existem (caso venha do rename ou fresh install)
ALTER TABLE "JobsIA_profiles"
  ADD COLUMN IF NOT EXISTS user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name       TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email      TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Garantir colunas adicionais usadas no JOIN do backend
ALTER TABLE "JobsIA_profiles"
  ADD COLUMN IF NOT EXISTS matricula  TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true;

-- 3. Constraints de unicidade com tratamento seguro
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JobsIA_profiles_user_id_key'
  ) THEN
    ALTER TABLE "JobsIA_profiles" ADD CONSTRAINT "JobsIA_profiles_user_id_key" UNIQUE (user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JobsIA_profiles_email_key'
  ) THEN
    ALTER TABLE "JobsIA_profiles" ADD CONSTRAINT "JobsIA_profiles_email_key" UNIQUE (email);
  END IF;
END $$;

-- 4. Índices
CREATE INDEX IF NOT EXISTS "JobsIA_profiles_user_id_idx" ON "JobsIA_profiles" (user_id);
CREATE INDEX IF NOT EXISTS "JobsIA_profiles_email_idx"   ON "JobsIA_profiles" (email);

-- 5. Sem RLS e sem triggers externos (autenticação local gerenciada pelo Express)
ALTER TABLE "JobsIA_profiles" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"       ON "JobsIA_profiles";
DROP POLICY IF EXISTS "profiles_update_own"       ON "JobsIA_profiles";
DROP POLICY IF EXISTS "profiles_service_role_all" ON "JobsIA_profiles";
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

COMMIT;
