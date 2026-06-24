-- =============================================================================
-- MIGRATION: 0007_add_user_name_to_checklists.sql
-- Banco: PostgreSQL
-- Objetivo: Garantir colunas em JobsIA_checklists e adicionar user_id como FK
--
-- NOTA DE ARQUITETURA:
-- A coluna user_id faz referência direta à tabela users.id (e não a JobsIA_profiles.id),
-- de modo a centralizar o controle de identidade na entidade principal de usuários (users)
-- e simplificar exclusões em cascata caso uma conta de usuário seja deletada.
-- =============================================================================

BEGIN;

-- 1. Criar tabela caso não exista (fresh install)
CREATE TABLE IF NOT EXISTS "JobsIA_checklists" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 2. Adicionar colunas faltantes de forma segura
ALTER TABLE "JobsIA_checklists"
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES "JobsIA_conversations"(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data            JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'Concluído',
  ADD COLUMN IF NOT EXISTS file_name       TEXT,
  ADD COLUMN IF NOT EXISTS user_name       TEXT,
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Adicionar coluna user_id com FK apontando para users(id)
ALTER TABLE "JobsIA_checklists"
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 4. Adicionar índice para otimizar busca por usuário
CREATE INDEX IF NOT EXISTS "JobsIA_checklists_user_id_idx" ON "JobsIA_checklists" (user_id);
CREATE INDEX IF NOT EXISTS "JobsIA_checklists_conversation_id_idx" ON "JobsIA_checklists" (conversation_id);

COMMIT;
