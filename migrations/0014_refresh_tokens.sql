-- =============================================================================
-- MIGRATION: 0014_refresh_tokens.sql
-- Banco: PostgreSQL
-- Objetivo: Criar tabela para gerenciar refresh tokens e ciclo de vida de sessões
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "JobsIA_refresh_tokens" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Desabilitar RLS na nova tabela
ALTER TABLE "JobsIA_refresh_tokens" DISABLE ROW LEVEL SECURITY;

COMMIT;
