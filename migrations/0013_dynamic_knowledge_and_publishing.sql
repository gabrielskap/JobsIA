-- =============================================================================
-- MIGRATION: 0013_dynamic_knowledge_and_publishing.sql
-- Integração de normas e dicionário com versionamento, controle de publicação e logs de execução.
-- =============================================================================

BEGIN;

-- 1. Modificações na Tabela de Normas (Regras de Validação Versionadas)
ALTER TABLE "JobsIA_validation_rules" ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PUBLICADO' CONSTRAINT chk_norm_status CHECK (status IN ('RASCUNHO', 'APROVADO', 'PUBLICADO'));
ALTER TABLE "JobsIA_validation_rules" ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "JobsIA_validation_rules" ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES "JobsIA_validation_rules"(id) ON DELETE SET NULL;
ALTER TABLE "JobsIA_validation_rules" ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- 2. Modificações na Tabela de Dicionário
ALTER TABLE "JobsIA_dictionary_terms" ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PUBLICADO' CONSTRAINT chk_dict_status CHECK (status IN ('RASCUNHO', 'APROVADO', 'PUBLICADO'));
ALTER TABLE "JobsIA_dictionary_terms" ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "JobsIA_dictionary_terms" ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES "JobsIA_dictionary_terms"(id) ON DELETE SET NULL;
ALTER TABLE "JobsIA_dictionary_terms" ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Removendo JobsIA_norm_rules não utilizada no motor mas mantida para compatibilidade
ALTER TABLE "JobsIA_norm_rules" ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PUBLICADO';
ALTER TABLE "JobsIA_norm_rules" ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "JobsIA_norm_rules" ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES "JobsIA_norm_rules"(id) ON DELETE SET NULL;
ALTER TABLE "JobsIA_norm_rules" ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- 3. Nova Tabela de Execução do Agente (Registrar contexto do prompt e parâmetros em cada chamada)
CREATE TABLE IF NOT EXISTS "JobsIA_agent_executions" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES "JobsIA_conversations"(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  prompt_version  TEXT NOT NULL,
  norms_version   TEXT NOT NULL,
  dictionary_version TEXT NOT NULL,
  model           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_executions_conversation ON "JobsIA_agent_executions"(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_created_at ON "JobsIA_agent_executions"(created_at);

COMMIT;
