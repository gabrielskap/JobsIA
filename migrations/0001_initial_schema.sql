-- =============================================================================
-- MIGRATION: 0001_initial_schema.sql
-- Banco: PostgreSQL
-- Objetivo: Criar a estrutura inicial de tabelas históricas do JobsIA,
-- mas utilizando autenticação local autônoma (tabela users própria).
-- =============================================================================

BEGIN;

-- 1. Tabela de Usuários local (substitui tabelas externas de autenticação)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de Perfis original
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT UNIQUE NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de Dicionário de Termos original
CREATE TABLE IF NOT EXISTS dictionary_terms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term       TEXT UNIQUE NOT NULL,
  definition TEXT NOT NULL,
  category   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de Normas e Regras original
CREATE TABLE IF NOT EXISTS norm_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL,
  rule        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabela de Tipos de Job original
CREATE TABLE IF NOT EXISTS job_types (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  script      TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabela de Parâmetros de Job original
CREATE TABLE IF NOT EXISTS job_parameters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type_id   INTEGER REFERENCES job_types(id) ON DELETE CASCADE,
  flag          TEXT,
  name          TEXT NOT NULL,
  required      BOOLEAN NOT NULL DEFAULT false,
  description   TEXT,
  order_index   INTEGER NOT NULL,
  data_type     TEXT NOT NULL,
  default_value TEXT,
  example_value TEXT,
  validation_regex TEXT,
  active        BOOLEAN NOT NULL DEFAULT true
);

-- 7. Tabela de Conversas original
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type  TEXT NOT NULL CHECK (flow_type IN ('transhost', 'swadm', 'java')),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Tabela de Mensagens original
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('agent', 'user')),
  text            TEXT NOT NULL,
  is_error        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Tabela de Checklists original (Vazia/Apenas ID inicialmente)
CREATE TABLE IF NOT EXISTS checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 10. Tabela de Prompts original (Vazia/Apenas ID inicialmente)
CREATE TABLE IF NOT EXISTS system_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Índices Iniciais
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_job_parameters_type ON job_parameters(job_type_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);

COMMIT;
