-- Migration: Garantir que JobsIA_checklists tem todas as colunas necessárias
-- Inclui: type, data (JSONB), status, file_name, conversation_id, user_name, created_at

-- Criar tabela caso não exista (fresh install)
CREATE TABLE IF NOT EXISTS "JobsIA_checklists" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Adicionar colunas faltantes de forma segura
ALTER TABLE "JobsIA_checklists"
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS type           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data           JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'Concluído',
  ADD COLUMN IF NOT EXISTS file_name      TEXT,
  ADD COLUMN IF NOT EXISTS user_name      TEXT,
  ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();
