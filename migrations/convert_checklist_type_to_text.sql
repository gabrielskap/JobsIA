-- Migration: Converter type de enum para TEXT em JobsIA_checklists
-- Dropa as duas views dependentes, altera a coluna e as recria.

BEGIN;

-- 1. Dropar ambas as views que bloqueiam a alteração
DROP VIEW IF EXISTS v_checklist_kpis;
DROP VIEW IF EXISTS v_checklist_history;

-- 2. Converter coluna type de enum para TEXT
ALTER TABLE "JobsIA_checklists"
  ALTER COLUMN type TYPE TEXT;

-- 3. Garantir coluna data (JSONB) caso não exista
ALTER TABLE "JobsIA_checklists"
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

-- 4. Recriar v_checklist_kpis (status permanece como enum checklist_status)
CREATE OR REPLACE VIEW v_checklist_kpis AS
SELECT
  count(*) AS total,
  round(
    count(*) FILTER (WHERE status = 'Concluído'::checklist_status)::numeric
    / NULLIF(count(*), 0)::numeric * 100,
    1
  ) AS success_rate,
  count(*) FILTER (WHERE status = 'Falha Validação'::checklist_status) AS validation_failures,
  mode() WITHIN GROUP (ORDER BY type) AS most_requested_type
FROM "JobsIA_checklists";

-- 5. Recriar v_checklist_history
CREATE OR REPLACE VIEW v_checklist_history AS
SELECT
  c.id,
  c.type,
  COALESCE(c.file_name, c.shell_name, c.program_name) AS file,
  to_char((c.created_at AT TIME ZONE 'America/Sao_Paulo'::text), 'DD/MM/YYYY HH24:MI'::text) AS date,
  c.status,
  COALESCE(p.matricula, p.name, p.email) AS "user"
FROM "JobsIA_checklists" c
LEFT JOIN "JobsIA_profiles" p ON p.id = c.user_id;

COMMIT;
