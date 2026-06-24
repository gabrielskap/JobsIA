-- =============================================================================
-- BASELINE SCHEMA: Criação do banco de dados do JobsIA completo do zero
-- Banco: PostgreSQL
-- Executar em uma única transação para provisionar ambientes limpos
-- =============================================================================

BEGIN;

-- 1. Tabela: users (Autenticação Customizada Local)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'SOLICITANTE' CONSTRAINT chk_user_role CHECK (role IN ('ADMIN', 'OPERADOR', 'SOLICITANTE')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela: JobsIA_profiles (Perfil dos Usuários)
CREATE TABLE IF NOT EXISTS "JobsIA_profiles" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  email       TEXT UNIQUE NOT NULL DEFAULT '',
  matricula   TEXT,
  avatar_url  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela: JobsIA_types (Tipos de Jobs)
CREATE TABLE IF NOT EXISTS "JobsIA_types" (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  script      TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela: JobsIA_parameters (Parâmetros de Jobs com constraint de domínio)
CREATE TABLE IF NOT EXISTS "JobsIA_parameters" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type_id       INTEGER REFERENCES "JobsIA_types"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  flag              TEXT DEFAULT NULL,
  name              TEXT NOT NULL,
  required          BOOLEAN NOT NULL DEFAULT false,
  description       TEXT,
  parameter_type    TEXT NOT NULL CONSTRAINT chk_parameter_type CHECK (parameter_type IN ('flag', 'positional', 'internal', 'generated')),
  order_index       INTEGER NOT NULL,
  data_type         TEXT NOT NULL,
  default_value     TEXT,
  example_value     TEXT,
  validation_regex  TEXT,
  active            BOOLEAN NOT NULL DEFAULT true
);

-- 5. Tabela: JobsIA_conversations (Conversas do Chat)
CREATE TABLE IF NOT EXISTS "JobsIA_conversations" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type   TEXT NOT NULL CONSTRAINT chk_flow_type CHECK (flow_type IN ('transhost', 'swadm', 'java')),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabela: JobsIA_messages (Mensagens do Chat)
CREATE TABLE IF NOT EXISTS "JobsIA_messages" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES "JobsIA_conversations"(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CONSTRAINT chk_role CHECK (role IN ('agent', 'user')),
  text            TEXT NOT NULL,
  is_error        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Tabela: JobsIA_checklists (Checklists validados)
CREATE TABLE IF NOT EXISTS "JobsIA_checklists" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES "JobsIA_conversations"(id) ON DELETE SET NULL,
  type            TEXT NOT NULL,
  data            JSONB NOT NULL,
  status          TEXT NOT NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name       TEXT NOT NULL DEFAULT '',
  file_name       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  semantic_type   TEXT,
  job_type_id     INTEGER REFERENCES "JobsIA_types"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  target_file     TEXT,
  request_id      TEXT UNIQUE,
  errors          JSONB DEFAULT '[]'::jsonb,
  warnings        JSONB DEFAULT '[]'::jsonb,
  command         TEXT,
  applied_rules_snapshot JSONB DEFAULT NULL,
  applied_rules_hash     TEXT DEFAULT NULL
);

-- 8. Tabela: JobsIA_dictionary_terms (Dicionário de Termos)
CREATE TABLE IF NOT EXISTS "JobsIA_dictionary_terms" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term                TEXT UNIQUE NOT NULL,
  definition          TEXT NOT NULL,
  category            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PUBLICADO' CONSTRAINT chk_dict_status CHECK (status IN ('RASCUNHO', 'APROVADO', 'PUBLICADO')),
  version             INTEGER NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES "JobsIA_dictionary_terms"(id) ON DELETE SET NULL,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Tabela: JobsIA_system_prompts (Prompts de Sistema de IA)
CREATE TABLE IF NOT EXISTS "JobsIA_system_prompts" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Tabela: JobsIA_audit_logs (Logs de Auditoria Administrativa)
CREATE TABLE IF NOT EXISTS "JobsIA_audit_logs" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Tabela: JobsIA_validation_rules (Regras de Validação Versionadas)
CREATE TABLE IF NOT EXISTS "JobsIA_validation_rules" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento           TEXT NOT NULL DEFAULT 'N/PD/004/02',
  versao              TEXT NOT NULL DEFAULT '2.0',
  secao               TEXT NOT NULL,
  codigo              TEXT NOT NULL UNIQUE,
  campo_alvo          TEXT NOT NULL,
  ambiente            TEXT NOT NULL CHECK (ambiente IN ('Unix', 'Windows', 'Mainframe', 'Global')),
  tipo_regra          TEXT NOT NULL CHECK (tipo_regra IN ('required', 'data_type', 'enum', 'regex', 'dependency', 'custom')),
  severidade          TEXT NOT NULL CHECK (severidade IN ('BLOQUEANTE', 'AVISO')),
  mensagem            TEXT NOT NULL,
  expressao           TEXT,
  ativo               BOOLEAN NOT NULL DEFAULT true,
  status              TEXT NOT NULL DEFAULT 'PUBLICADO' CONSTRAINT chk_norm_status CHECK (status IN ('RASCUNHO', 'APROVADO', 'PUBLICADO')),
  version             INTEGER NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES "JobsIA_validation_rules"(id) ON DELETE SET NULL,
  vigencia_inicio     TIMESTAMPTZ NOT NULL DEFAULT now(),
  vigencia_fim        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  texto_orientacao    TEXT NOT NULL DEFAULT '',
  aplicabilidade_job  INTEGER[] DEFAULT NULL,
  casos_teste         JSONB DEFAULT NULL
);

-- 12. View de compatibilidade JobsIA_norm_rules
CREATE OR REPLACE VIEW "JobsIA_norm_rules" AS
SELECT
  id,
  ambiente AS environment,
  texto_orientacao AS rule,
  created_at,
  status,
  version,
  previous_version_id,
  ativo AS active
FROM "JobsIA_validation_rules";

-- 13. Tabela: JobsIA_validation_runs (Execuções de Validação)
CREATE TABLE IF NOT EXISTS "JobsIA_validation_runs" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  UUID REFERENCES "JobsIA_checklists"(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  passed        BOOLEAN NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Tabela: JobsIA_validation_results (Resultados Detalhado da Validação)
CREATE TABLE IF NOT EXISTS "JobsIA_validation_results" (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_run_id  UUID NOT NULL REFERENCES "JobsIA_validation_runs"(id) ON DELETE CASCADE,
  rule_id            UUID REFERENCES "JobsIA_validation_rules"(id) ON DELETE SET NULL,
  rule_code          TEXT NOT NULL,
  rule_version       TEXT NOT NULL,
  campo_alvo         TEXT NOT NULL,
  valor_analisado    TEXT,
  severidade         TEXT NOT NULL,
  mensagem           TEXT NOT NULL,
  passou             BOOLEAN NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. Tabela: JobsIA_refresh_tokens (Tokens de Atualização)
CREATE TABLE IF NOT EXISTS "JobsIA_refresh_tokens" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- CRIAÇÃO DE ÍNDICES ADICIONAIS PARA DESEMPENHO E CHAVES ESTRANGEIRAS
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_validation_rules_codigo ON "JobsIA_validation_rules"(codigo);
CREATE INDEX IF NOT EXISTS idx_validation_rules_campo_alvo ON "JobsIA_validation_rules"(campo_alvo);
CREATE INDEX IF NOT EXISTS idx_validation_runs_checklist ON "JobsIA_validation_runs"(checklist_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_run ON "JobsIA_validation_results"(validation_run_id);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON "JobsIA_profiles"(user_id);
CREATE INDEX IF NOT EXISTS idx_parameters_job_type_id ON "JobsIA_parameters"(job_type_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON "JobsIA_conversations"(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON "JobsIA_messages"(conversation_id);
CREATE INDEX IF NOT EXISTS idx_checklists_user_id ON "JobsIA_checklists"(user_id);
CREATE INDEX IF NOT EXISTS idx_checklists_conversation_id ON "JobsIA_checklists"(conversation_id);
CREATE INDEX IF NOT EXISTS idx_checklists_request_id ON "JobsIA_checklists"(request_id);
CREATE INDEX IF NOT EXISTS idx_checklists_job_type ON "JobsIA_checklists"(job_type_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON "JobsIA_audit_logs"(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON "JobsIA_audit_logs"(created_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON "JobsIA_refresh_tokens"(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON "JobsIA_refresh_tokens"(token);

-- =============================================================================
-- CRIAÇÃO DAS VIEWS DE NEGÓCIO CORRIGIDAS (SEM DEPS DE ENUMS LEGADOS)
-- =============================================================================

-- View 1: v_checklist_kpis (Métricas de checklists executados)
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

-- View 2: v_checklist_history (Histórico legível com join resolvido)
CREATE OR REPLACE VIEW v_checklist_history AS
SELECT
  c.id,
  c.type,
  COALESCE(c.file_name, c.data->>'shell_name', c.data->>'program_name') AS file,
  to_char((c.created_at AT TIME ZONE 'America/Sao_Paulo'::text), 'DD/MM/YYYY HH24:MI'::text) AS date,
  c.status,
  COALESCE(p.matricula, p.name, p.email) AS "user"
FROM "JobsIA_checklists" c
LEFT JOIN "JobsIA_profiles" p ON p.user_id = c.user_id;

COMMIT;
