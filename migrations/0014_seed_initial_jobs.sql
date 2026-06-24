-- =============================================================================
-- MIGRATION: 0014_seed_initial_jobs.sql
-- Inserção dos tipos de job iniciais do processo Transhost (Tipo 3 e Tipo 10),
-- conforme descrito no dicionário da base de conhecimento do JobsIA.
-- Nomenclatura dos scripts segue a norma N/PD/004/02 (J.SIS.SUB.NNN.SH, máx 16 chars).
-- =============================================================================

BEGIN;

-- =============================================================================
-- TIPOS DE JOB
-- =============================================================================

INSERT INTO "JobsIA_types" (id, name, script, description) VALUES
(
  3,
  'Gera Lista Trans_Hosts',
  '/u/bin/J.DIT.OPR.003.SH',
  'Pré-requisito obrigatório do processo Transhost. Gera a LISTA de arquivos a serem transferidos entre servidores, consumida pelo Job Tipo 10. Deve ser executado antes de qualquer transferência.'
),
(
  10,
  'Transferência de Arqs Entre Servidores',
  '/u/bin/J.DIT.OPR.010.SH',
  'Efetua a transferência de arquivos entre servidores internos via operação GET (captura remoto) ou PUT (envia para remoto). Consome a lista gerada pelo Job Tipo 3. Exige execução prévia do Tipo 3 com a mesma Application.'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- PARÂMETROS — Job Tipo 3: Gera Lista Trans_Hosts
-- =============================================================================

INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(
  3, '-a', 'Application', true,
  'Nome da Application no Workload que agrupa o fluxo de jobs. Identifica o conjunto de operações a executar.',
  'flag', 0, 'text', null, 'DIT.TRH.DIARIO', null, true
),
(
  3, '-s', 'Servidor', false,
  'Nome do servidor onde o job será executado. Se omitido, usa o servidor padrão da Application.',
  'flag', 1, 'text', null, 'UXRJO001', null, true
),
(
  3, '-d', 'Data de Processamento', false,
  'Data de referência para geração da lista no formato AAAAMMDD. Se omitida, usa a data corrente.',
  'flag', 2, 'date', null, '20251016', '^\d{8}$', true
);

-- =============================================================================
-- PARÂMETROS — Job Tipo 10: Transferência de Arqs Entre Servidores
-- =============================================================================

INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(
  10, '-a', 'Application', true,
  'Nome da Application no Workload. Deve ser a mesma informada no Job Tipo 3 que gerou a lista de transferência.',
  'flag', 0, 'text', null, 'DIT.TRH.DIARIO', null, true
),
(
  10, '-o', 'Operação (GET/PUT)', true,
  'Sentido da transferência: GET = servidor local captura arquivo do remoto; PUT = servidor local envia arquivo ao remoto.',
  'flag', 1, 'text', null, 'GET', '^(GET|PUT)$', true
),
(
  10, '-s', 'Servidor de Origem', true,
  'Nome do servidor de onde os arquivos serão transferidos (origem).',
  'flag', 2, 'text', null, 'UXRJO001', null, true
),
(
  10, '-t', 'Servidor de Destino', true,
  'Nome do servidor que receberá os arquivos (destino).',
  'flag', 3, 'text', null, 'UXRSP002', null, true
),
(
  10, '-d', 'Data de Processamento', false,
  'Data de referência no formato AAAAMMDD. Deve coincidir com a data usada na execução do Job Tipo 3.',
  'flag', 4, 'date', null, '20251016', '^\d{8}$', true
);

COMMIT;
