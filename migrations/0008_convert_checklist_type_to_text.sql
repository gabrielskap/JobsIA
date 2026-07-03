-- =============================================================================
-- MIGRATION: 0008_convert_checklist_type_to_text.sql
-- Banco: PostgreSQL
-- Objetivo: Converter type para TEXT e recriar as views v_checklist_kpis e
-- v_checklist_history corrigindo incompatibilidades de Fresh Install e joins.
-- =============================================================================

BEGIN;

-- 1. Dropar ambas as views que dependem de JobsIA_checklists
DROP VIEW IF EXISTS v_checklist_kpis CASCADE;
DROP VIEW IF EXISTS v_checklist_history CASCADE;

-- 2. Converter coluna type para TEXT
ALTER TABLE "JobsIA_checklists"
  ALTER COLUMN type TYPE TEXT;

-- 3. Garantir coluna data (JSONB)
ALTER TABLE "JobsIA_checklists"
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

-- 4. Recriar v_checklist_kpis (sem dependência do enum checklist_status)
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

-- 5. Recriar v_checklist_history (corrigida colunas inexistentes e JOIN por user_id)
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
