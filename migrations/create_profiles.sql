-- =============================================================================
-- MIGRATION: Criar/ajustar tabela JobsIA_profiles para armazenar dados dos usuários
-- Banco: PostgreSQL
-- Data: 2026-05-15
--
-- Compatível com a tabela já existente (renomeada via rename_tables.sql).
-- Usa ADD COLUMN IF NOT EXISTS para não quebrar se a tabela já tiver colunas.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Criar tabela caso não exista (cenário fresh install)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "JobsIA_profiles" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- -----------------------------------------------------------------------------
-- 2. Garantir que todas as colunas necessárias existem
--    (seguro de rodar mesmo se a tabela já existia com colunas parciais)
-- -----------------------------------------------------------------------------
ALTER TABLE "JobsIA_profiles"
  ADD COLUMN IF NOT EXISTS user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name       TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email      TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Remover defaults temporários usados apenas para a migration
ALTER TABLE "JobsIA_profiles"
  ALTER COLUMN name  DROP DEFAULT,
  ALTER COLUMN email DROP DEFAULT;

-- -----------------------------------------------------------------------------
-- 3. Constraints de unicidade (IF NOT EXISTS via DO block)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. Índices
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "JobsIA_profiles_user_id_idx" ON "JobsIA_profiles" (user_id);
CREATE INDEX IF NOT EXISTS "JobsIA_profiles_email_idx"   ON "JobsIA_profiles" (email);

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE "JobsIA_profiles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"       ON "JobsIA_profiles";
DROP POLICY IF EXISTS "profiles_update_own"       ON "JobsIA_profiles";
DROP POLICY IF EXISTS "profiles_service_role_all" ON "JobsIA_profiles";

-- Usuário autenticado vê apenas o próprio perfil
CREATE POLICY "profiles_select_own"
  ON "JobsIA_profiles" FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Usuário autenticado atualiza apenas o próprio perfil
CREATE POLICY "profiles_update_own"
  ON "JobsIA_profiles" FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role tem acesso total (usado pelo userService.ts via SERVICE_ROLE_KEY)
CREATE POLICY "profiles_service_role_all"
  ON "JobsIA_profiles" FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 6. Trigger: cria perfil automaticamente ao cadastrar usuário no Auth
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO "JobsIA_profiles" (user_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- -----------------------------------------------------------------------------
-- Verificação pós-execução:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'JobsIA_profiles' ORDER BY ordinal_position;
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'JobsIA_profiles';
-- -----------------------------------------------------------------------------

COMMIT;
