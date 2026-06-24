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
  conversation_id UUID REFERENCES "JobsIA_conversations"(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'Concluído',
  file_name       TEXT,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  user_name       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Tabela: JobsIA_dictionary_terms (Dicionário de Termos)
CREATE TABLE IF NOT EXISTS "JobsIA_dictionary_terms" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term        TEXT UNIQUE NOT NULL,
  definition  TEXT NOT NULL,
  category    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Tabela: JobsIA_norm_rules (Normas e Regras)
CREATE TABLE IF NOT EXISTS "JobsIA_norm_rules" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL,
  rule        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Tabela: JobsIA_system_prompts (Prompts de Sistema de IA)
CREATE TABLE IF NOT EXISTS "JobsIA_system_prompts" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Tabela: JobsIA_audit_logs (Logs de Auditoria Administrativa)
CREATE TABLE IF NOT EXISTS "JobsIA_audit_logs" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- CRIAÇÃO DE ÍNDICES ADICIONAIS PARA DESEMPENHO E CHAVES ESTRANGEIRAS
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON "JobsIA_profiles"(user_id);
CREATE INDEX IF NOT EXISTS idx_parameters_job_type_id ON "JobsIA_parameters"(job_type_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON "JobsIA_conversations"(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON "JobsIA_messages"(conversation_id);
CREATE INDEX IF NOT EXISTS idx_checklists_user_id ON "JobsIA_checklists"(user_id);
CREATE INDEX IF NOT EXISTS idx_checklists_conversation_id ON "JobsIA_checklists"(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON "JobsIA_audit_logs"(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON "JobsIA_audit_logs"(created_at);

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
