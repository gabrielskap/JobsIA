-- Suporte a tipos de parâmetros nos Jobs genéricos
-- Executar no SQL Editor

-- 1. Adiciona coluna parameter_type com default 'flag' (compatível com dados existentes)
ALTER TABLE "JobsIA_parameters"
  ADD COLUMN IF NOT EXISTS parameter_type text NOT NULL DEFAULT 'flag';

-- 2. Torna a coluna flag nullable
--    NULL  = parâmetro sem flag (positional, internal, generated)
--    ''    = string vazia (flag explicitamente vazia)
ALTER TABLE "JobsIA_parameters"
  ALTER COLUMN flag DROP NOT NULL;

ALTER TABLE "JobsIA_parameters"
  ALTER COLUMN flag SET DEFAULT NULL;

-- 3. Ajusta registros existentes do Job Tipo 1 (SWADM)
--    Seus "parâmetros" são posicionais: shellName, params, executor
UPDATE "JobsIA_parameters"
SET
  parameter_type = 'positional',
  flag = NULL
WHERE job_type_id = 1;

-- 4. Garante constraint de domínio nos tipos permitidos
ALTER TABLE "JobsIA_parameters"
  DROP CONSTRAINT IF EXISTS chk_parameter_type;

ALTER TABLE "JobsIA_parameters"
  ADD CONSTRAINT chk_parameter_type
  CHECK (parameter_type IN ('flag', 'positional', 'internal', 'generated'));
