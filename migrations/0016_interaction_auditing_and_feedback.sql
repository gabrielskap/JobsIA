-- =============================================================================
-- MIGRATION: 0016_interaction_auditing_and_feedback.sql
-- Adiciona tabelas de classificação de interações, feedback de usuários e auditoria
-- =============================================================================

BEGIN;

-- 1. Criar Tabela de Classificação de Interações
CREATE TABLE IF NOT EXISTS "JobsIA_interaction_classifications" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID REFERENCES "JobsIA_messages"(id) ON DELETE CASCADE,
  assunto         TEXT NOT NULL, -- ex: 'nomenclatura', 'parametros', 'ambiente', 'duvida_geral'
  job_type_id     INTEGER REFERENCES "JobsIA_types"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  duvida          TEXT,
  regra_acionada  TEXT REFERENCES "JobsIA_validation_rules"(codigo) ON UPDATE CASCADE ON DELETE SET NULL,
  resultado       TEXT NOT NULL, -- ex: 'Sucesso', 'Falha Validação', 'Sem Ação'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Criar Tabela de Feedback do Usuário e Correção do Operador
CREATE TABLE IF NOT EXISTS "JobsIA_user_feedback" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id      UUID REFERENCES "JobsIA_checklists"(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES "JobsIA_conversations"(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  rating            INTEGER NOT NULL CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5),
  comentario        TEXT,
  correcao_operador TEXT, -- Anotações ou alterações feitas pelo operador
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Índices adicionais para auditoria e agregação
CREATE INDEX IF NOT EXISTS idx_interaction_classifications_msg ON "JobsIA_interaction_classifications"(message_id);
CREATE INDEX IF NOT EXISTS idx_interaction_classifications_job ON "JobsIA_interaction_classifications"(job_type_id);
CREATE INDEX IF NOT EXISTS idx_interaction_classifications_created ON "JobsIA_interaction_classifications"(created_at);
CREATE INDEX IF NOT EXISTS idx_user_feedback_checklist ON "JobsIA_user_feedback"(checklist_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_conv ON "JobsIA_user_feedback"(conversation_id);

-- 4. Corrigir e Atualizar as Views de KPIs reais baseadas em validações concretas
CREATE OR REPLACE VIEW v_checklist_kpis AS
SELECT
  count(*) AS total,
  round(
    count(*) FILTER (WHERE status = 'Concluído')::numeric
    / NULLIF(count(*), 0)::numeric * 100,
    1
  ) AS success_rate,
  count(*) FILTER (WHERE status = 'Falha Validação') AS validation_failures,
  mode() WITHIN GROUP (ORDER BY type) AS most_requested_type
FROM "JobsIA_checklists";

COMMIT;
