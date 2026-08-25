-- =============================================================================
-- MIGRATION: 0023_catalog_documents_and_embeddings.sql
-- Objetivo: Suportar documentos PDF importados no Catálogo e armazenamento de
-- trechos (chunks) vetorizados para busca semântica e contextualização da IA.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "JobsIA_catalog_documents" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       TEXT NOT NULL,
  file_size      BIGINT NOT NULL,
  total_pages    INT NOT NULL DEFAULT 1,
  extracted_text TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'VETORIZADO' CONSTRAINT chk_catalog_doc_status CHECK (status IN ('PROCESSANDO', 'VETORIZADO', 'FALHA')),
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "JobsIA_catalog_chunks" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL REFERENCES "JobsIA_catalog_documents"(id) ON DELETE CASCADE,
  chunk_index    INT NOT NULL,
  page_number    INT NOT NULL DEFAULT 1,
  chunk_text     TEXT NOT NULL,
  embedding      JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_count    INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_chunks_doc_id ON "JobsIA_catalog_chunks"(document_id);
CREATE INDEX IF NOT EXISTS idx_catalog_docs_created_at ON "JobsIA_catalog_documents"(created_at DESC);

COMMIT;
