-- =============================================================================
-- MIGRATION: 0015_add_structured_fields_to_checklists.sql
-- Adiciona colunas estruturadas para tornar o fluxo de geração mais seguro e auditável.
-- =============================================================================

BEGIN;

ALTER TABLE "JobsIA_checklists"
  ADD COLUMN IF NOT EXISTS semantic_type TEXT,
  ADD COLUMN IF NOT EXISTS job_type_id INTEGER REFERENCES "JobsIA_types"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_file TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS errors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS warnings JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS command TEXT;

-- Criação de índice para otimização de buscas por request_id (idempotência)
CREATE INDEX IF NOT EXISTS idx_checklists_request_id ON "JobsIA_checklists"(request_id);
CREATE INDEX IF NOT EXISTS idx_checklists_job_type ON "JobsIA_checklists"(job_type_id);

COMMIT;
