-- =============================================================================
-- MIGRATION: 0011_add_rbac.sql
-- Banco: PostgreSQL
-- Objetivo: Implementar RBAC adicionando a coluna role na tabela users e
-- criando a tabela de logs de auditoria
-- =============================================================================

BEGIN;

-- 1. Criar coluna role na tabela users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'SOLICITANTE'
  CONSTRAINT chk_user_role CHECK (role IN ('ADMIN', 'OPERADOR', 'SOLICITANTE'));

-- 2. Criar a tabela de logs de auditoria para ações administrativas
CREATE TABLE IF NOT EXISTS "JobsIA_audit_logs" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar índice para busca de auditoria por usuário e ação
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON "JobsIA_audit_logs"(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON "JobsIA_audit_logs"(created_at);

-- 3. Atualizar o primeiro usuário criado para ser ADMIN (para garantir que haja um ADMIN)
UPDATE users
SET role = 'ADMIN'
WHERE id IN (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 1
);

COMMIT;
