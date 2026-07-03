-- =============================================================================
-- MIGRATION: 0012_validation_rules_and_runs.sql
-- Criação do motor de validação e cadastro das regras da norma N/PD/004/02
-- =============================================================================

BEGIN;

-- 1. Tabela de Regras de Validação Versionadas
CREATE TABLE IF NOT EXISTS "JobsIA_validation_rules" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento       TEXT NOT NULL DEFAULT 'N/PD/004/02',
  versao          TEXT NOT NULL DEFAULT '2.0',
  secao           TEXT NOT NULL,
  codigo          TEXT NOT NULL UNIQUE,
  campo_alvo      TEXT NOT NULL,
  ambiente        TEXT NOT NULL CHECK (ambiente IN ('Unix', 'Windows', 'Mainframe', 'Global')),
  tipo_regra      TEXT NOT NULL CHECK (tipo_regra IN ('required', 'data_type', 'enum', 'regex', 'dependency', 'custom')),
  severidade      TEXT NOT NULL CHECK (severidade IN ('BLOQUEANTE', 'AVISO')),
  mensagem        TEXT NOT NULL,
  expressao       TEXT, -- Regex, valores permitidos ou config JSON de dependências
  ativo           BOOLEAN NOT NULL DEFAULT true,
  status          TEXT NOT NULL DEFAULT 'PUBLICADO',
  vigencia_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  vigencia_fim    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de Histórico de Execuções de Validação
CREATE TABLE IF NOT EXISTS "JobsIA_validation_runs" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  UUID REFERENCES "JobsIA_checklists"(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  passed        BOOLEAN NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de Resultados Detalhados de Validação
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

-- Índices para otimização das validações
CREATE INDEX IF NOT EXISTS idx_validation_rules_codigo ON "JobsIA_validation_rules"(codigo);
CREATE INDEX IF NOT EXISTS idx_validation_rules_campo_alvo ON "JobsIA_validation_rules"(campo_alvo);
CREATE INDEX IF NOT EXISTS idx_validation_runs_checklist ON "JobsIA_validation_runs"(checklist_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_run ON "JobsIA_validation_results"(validation_run_id);

-- 4. Popular Regras da Norma N/PD/004/02
INSERT INTO "JobsIA_validation_rules" (secao, codigo, campo_alvo, ambiente, tipo_regra, severidade, mensagem, expressao, status)
VALUES
  -- 5.1 / 5.1.1 - Unix/Linux Nomenclatura e Delimitador '.'
  ('5.1.1', 'RULE-UNIX-PREFIX', 'file_name', 'Unix', 'regex', 'BLOQUEANTE', 
   'O nome do arquivo Unix/Linux deve iniciar com o prefixo padrão de 13 caracteres T.SIS.SUB.999 (onde T é B,D,F,J,L,P,T,W,X; SIS e SUB têm 3 letras maiúsculas; 999 tem 3 dígitos).',
   '^[BDFJLPTWX]\.[A-Z]{3}\.[A-Z]{3}\.[0-9]{3}', 'PUBLICADO'),
  
  ('5.1.1', 'RULE-UNIX-UPPER-MAX', 'file_name', 'Unix', 'regex', 'BLOQUEANTE',
   'O nome do arquivo Unix/Linux deve estar em LETRAS MAIÚSCULAS e ter no máximo 36 caracteres.',
   '^[A-Z0-9._-]{1,36}$', 'PUBLICADO'),

  ('5.1.1', 'RULE-UNIX-SHELL-LIMIT', 'file_name', 'Unix', 'custom', 'BLOQUEANTE',
   'O nome de arquivos do tipo Job ShellScript (.sh) deve ter no máximo 16 caracteres.',
   'shell_exception', 'PUBLICADO'),

  ('5.1.1', 'RULE-UNIX-JAR-LIMIT', 'file_name', 'Unix', 'custom', 'BLOQUEANTE',
   'O nome de arquivos de pacotes ou executáveis Java (.jar) deve ter no máximo 18 caracteres de identificação (sem contar a extensão .jar).',
   'jar_exception', 'PUBLICADO'),

  -- 5.1.2 - Windows Nomenclatura e Delimitador '_'
  ('5.1.2', 'RULE-WIN-PREFIX', 'file_name', 'Windows', 'regex', 'BLOQUEANTE', 
   'O nome do arquivo Windows deve iniciar com o prefixo padrão de 13 caracteres T_SIS_SUB_999.',
   '^[BDFJLPTWX]_[A-Z]{3}_[A-Z]{3}_[0-9]{3}', 'PUBLICADO'),

  ('5.1.2', 'RULE-WIN-UPPER-MAX', 'file_name', 'Windows', 'regex', 'BLOQUEANTE',
   'O nome do arquivo Windows deve estar em LETRAS MAIÚSCULAS e ter no máximo 36 caracteres.',
   '^[A-Z0-9_]{1,36}$', 'PUBLICADO'),

  -- 5.1.3 - Mainframe Nomenclatura e Delimitador '/'
  ('5.1.3', 'RULE-MAINFRAME-PREFIX', 'file_name', 'Mainframe', 'regex', 'BLOQUEANTE', 
   'O nome do arquivo Mainframe deve iniciar com o prefixo padrão de 13 caracteres T/SIS/SUB/999.',
   '^[BDFJLPTWX]/[A-Z]{3}/[A-Z]{3}/[0-9]{3}', 'PUBLICADO'),

  ('5.1.3', 'RULE-MAINFRAME-UPPER-MAX', 'file_name', 'Mainframe', 'regex', 'BLOQUEANTE',
   'O nome do arquivo Mainframe deve estar em LETRAS MAIÚSCULAS e ter no máximo 36 caracteres.',
   '^[A-Z0-9/]{1,36}$', 'PUBLICADO'),

  -- 5.2 / 5.2.1 - Objetos Procedurais do Banco de Dados (.sql)
  ('5.2', 'RULE-DB-SQL-FORMAT', 'file_name', 'Global', 'regex', 'BLOQUEANTE',
   'O script SQL para objetos procedurais deve possuir extensão .sql, usar underscore e ter no máximo 42 caracteres no formato tipo_NomeObjeto.sql (ex: pr_PR_CNS_MIG_001_INSERCAO.sql).',
   '^(pkg|pkgbody|pr|fc|tr)_[A-Za-z0-9_]{1,30}\.sql$', 'PUBLICADO'),

  ('5.2.1', 'RULE-DB-OBJ-FORMAT', 'object_name', 'Global', 'custom', 'BLOQUEANTE',
   'O nome do objeto interno para rotinas batch deve ter no máximo 30 caracteres, letras maiúsculas, no padrão TT_SIS_SUB_999_OPCIONAL.',
   'db_object_name_validation', 'PUBLICADO'),

  -- 5.3 / 5.3.1 / 5.3.2 - Fitas Magnéticas (Backup)
  ('5.3.1', 'RULE-TAPE-WIN-UNIX', 'tape_label', 'Global', 'custom', 'BLOQUEANTE',
   'Rótulo de fita de backup Windows/Unix inválido. Deve seguir o padrão F P HHHHHHHH / T / OO (máximo 17 caracteres).',
   'tape_win_unix_validation', 'PUBLICADO'),

  ('5.3.2', 'RULE-TAPE-UNIX-DB', 'tape_label', 'Global', 'custom', 'BLOQUEANTE',
   'Rótulo de fita de backup Unix para banco de dados inválido. Deve seguir o padrão F P NNNNNNNN IIIII / T / 00 (ex: FDUXRJO063PB3/F/ON).',
   'tape_unix_db_validation', 'PUBLICADO'),

  -- 5.4 / 5.4.1 / 5.4.2 - Connect:Direct
  ('5.4.1', 'RULE-CD-SEND', 'file_name', 'Global', 'custom', 'BLOQUEANTE',
   'Nome do arquivo de transferência Connect:Direct (Dataprev -> Externo) inválido. Deve seguir o padrão F SIS SUB 99 . MMMMMMMM . BXXX . AAAAMMDD . HHMMSS . X NNNNNNN.',
   'cd_send_validation', 'PUBLICADO'),

  ('5.4.2', 'RULE-CD-RECEIVE', 'file_name', 'Global', 'custom', 'BLOQUEANTE',
   'Nome do arquivo recebido via Connect:Direct (Externo -> Dataprev) inválido. Deve seguir o padrão SIS SUB 99 . BXXX . X NNNNNNN.',
   'cd_receive_validation', 'PUBLICADO')
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
