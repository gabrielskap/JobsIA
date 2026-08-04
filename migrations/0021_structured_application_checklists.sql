-- =============================================================================
-- MIGRATION: 0021_structured_application_checklists.sql
-- Objetivo: suportar checklists v2 por Application, com vários jobs ordenados,
-- agenda estruturada, CAPADOR documental e catálogo oficial extensível.
--
-- Não semeia nomenclaturas de Application nem os 27 genéricos: esses dados
-- precisam ser publicados pela DIOT como fonte de verdade.
-- =============================================================================

BEGIN;

-- Metadados independentes da montagem do comando. parameter_type continua
-- governando flags/posicionais; os campos abaixo determinam a coleta e o PDF.
ALTER TABLE "JobsIA_parameters"
  ADD COLUMN IF NOT EXISTS collection_scope TEXT NOT NULL DEFAULT 'JOB',
  ADD COLUMN IF NOT EXISTS collect_in_conversation BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS document_only BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "JobsIA_parameters"
  DROP CONSTRAINT IF EXISTS chk_parameter_collection_scope;

ALTER TABLE "JobsIA_parameters"
  ADD CONSTRAINT chk_parameter_collection_scope
  CHECK (collection_scope IN ('APPLICATION', 'JOB', 'CAPADOR'));

-- Campos gerados nunca devem ser solicitados ao usuário. Parâmetros internos
-- sem valor padrão são documentais/coletáveis; os com default preservam o
-- comportamento anterior de não pedir um valor calculado/fixo.
UPDATE "JobsIA_parameters"
SET collect_in_conversation = false
WHERE parameter_type = 'generated';

UPDATE "JobsIA_parameters"
SET
  document_only = true,
  collect_in_conversation = CASE WHEN default_value IS NULL THEN true ELSE false END
WHERE parameter_type = 'internal';

-- CAPADOR é sempre coletado/documentado e nunca anexado ao comando.
UPDATE "JobsIA_parameters"
SET
  collection_scope = 'CAPADOR',
  collect_in_conversation = true,
  document_only = true
WHERE name IN ('diretorio_origem', 'diretorio_destino', 'capacidade_armazenamento', 'permissoes_usuario');

-- Catálogo versionado; a carga dos genéricos e pontes oficiais será feita por
-- uma migração de dados DIOT ou pela administração, sem valores presumidos.
CREATE TABLE IF NOT EXISTS "JobsIA_checklist_catalog_items" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CONSTRAINT chk_checklist_catalog_kind CHECK (kind IN ('GENERIC', 'BRIDGE')),
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  official_version TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_catalog_kind_code
  ON "JobsIA_checklist_catalog_items"(kind, code);
CREATE INDEX IF NOT EXISTS idx_checklist_catalog_active_kind
  ON "JobsIA_checklist_catalog_items"(kind, active);

-- Requisitos por tipo de job. A tabela permite refletir as regras oficiais
-- gradualmente sem codificar suposições no prompt. O Tipo 3 é explicitamente
-- marcado porque o feedback aprovado exige servidor obrigatório nesse caso.
CREATE TABLE IF NOT EXISTS "JobsIA_job_checklist_requirements" (
  job_type_id       INTEGER PRIMARY KEY REFERENCES "JobsIA_types"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  requires_server   BOOLEAN NOT NULL DEFAULT false,
  requires_generic  BOOLEAN NOT NULL DEFAULT true,
  requires_bridge   BOOLEAN NOT NULL DEFAULT true,
  requires_capador  BOOLEAN NOT NULL DEFAULT false,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO "JobsIA_job_checklist_requirements" (job_type_id, requires_server)
SELECT id, true
FROM "JobsIA_types"
WHERE id = 3
ON CONFLICT (job_type_id) DO UPDATE
SET requires_server = true, updated_at = now();

-- Gancho versionado para a nomenclatura da Application. Nenhuma regex é
-- adicionada aqui até que a regra corporativa formal seja fornecida.
CREATE TABLE IF NOT EXISTS "JobsIA_application_validation_rules" (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE,
  description        TEXT NOT NULL DEFAULT '',
  validation_regex   TEXT,
  severity           TEXT NOT NULL DEFAULT 'BLOQUEANTE'
                       CONSTRAINT chk_application_rule_severity CHECK (severity IN ('BLOQUEANTE', 'AVISO')),
  message            TEXT NOT NULL DEFAULT 'Nome de Application fora do padrão corporativo.',
  suggestion_template TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  status             TEXT NOT NULL DEFAULT 'RASCUNHO'
                       CONSTRAINT chk_application_rule_status CHECK (status IN ('RASCUNHO', 'APROVADO', 'PUBLICADO')),
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_validation_rules_active
  ON "JobsIA_application_validation_rules"(active, status);

-- Persistência nativa do checklist v2. A coluna data continua sendo a cópia
-- completa compatível para consumidores legados; as colunas abaixo permitem
-- consultas, rascunhos e geração de PDF sem inferir aliases.
ALTER TABLE "JobsIA_checklists"
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'FINAL',
  ADD COLUMN IF NOT EXISTS application_name TEXT,
  ADD COLUMN IF NOT EXISTS responsible_name TEXT,
  ADD COLUMN IF NOT EXISTS application_data JSONB,
  ADD COLUMN IF NOT EXISTS job_items JSONB,
  ADD COLUMN IF NOT EXISTS schedule_data JSONB;

ALTER TABLE "JobsIA_checklists"
  DROP CONSTRAINT IF EXISTS chk_checklist_schema_version;
ALTER TABLE "JobsIA_checklists"
  ADD CONSTRAINT chk_checklist_schema_version CHECK (schema_version IN (1, 2));

ALTER TABLE "JobsIA_checklists"
  DROP CONSTRAINT IF EXISTS chk_checklist_workflow_status;
ALTER TABLE "JobsIA_checklists"
  ADD CONSTRAINT chk_checklist_workflow_status CHECK (workflow_status IN ('RASCUNHO', 'FINAL'));

CREATE INDEX IF NOT EXISTS idx_checklists_schema_workflow
  ON "JobsIA_checklists"(schema_version, workflow_status);
CREATE INDEX IF NOT EXISTS idx_checklists_application_name
  ON "JobsIA_checklists"(application_name);

COMMIT;
