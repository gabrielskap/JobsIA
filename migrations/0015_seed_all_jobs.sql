-- =============================================================================
-- MIGRATION: 0015_seed_all_jobs.sql
-- Inserção do catálogo completo de tipos de job do DIOT/Dataprev.
-- Cobre todas as operações suportadas pela norma N/PD/004/02 e pelos
-- fluxos da aplicação (transhost, swadm, java).
--
-- Nomenclatura dos scripts segue a norma (J.SIS.SUB.NNN.SH = 16 chars exatos).
-- Flags concatenadas ao valor: -aVALOR (sem espaço), conforme convenção dos scripts.
-- =============================================================================

BEGIN;

-- =============================================================================
-- TIPOS DE JOB
-- =============================================================================

INSERT INTO "JobsIA_types" (id, name, script, description) VALUES

-- GRUPO: SWADM — Administração de Software (promoção a produção)
(1,
  'Implantação de Shell Script Unix/Linux',
  '/u/bin/J.DIT.SWA.001.SH',
  'Promove um script ShellScript (tipo J) ao ambiente de produção Unix/Linux via SWADM. '
  'O nome do script deve seguir a norma N/PD/004/02 seção 5.1.1: J.SIS.SUB.NNN.SH, máximo 16 caracteres.'
),
(2,
  'Implantação de Objeto Procedural de BD',
  '/u/bin/J.DIT.SWA.002.SH',
  'Promove um script SQL de criação de objeto procedural de banco de dados (procedure, package, function ou trigger) '
  'ao ambiente de produção. Segue a norma N/PD/004/02 seção 5.2: tipo_NomeObjeto.sql (máx 42 chars).'
),
(4,
  'Implantação de Executável Java (JAR)',
  '/u/bin/J.DIT.SWA.004.SH',
  'Promove um pacote ou executável Java (.JAR) ao ambiente de produção Unix/Linux via SWADM. '
  'O nome do arquivo deve seguir a norma N/PD/004/02 seção 5.1.1: P.SIS.SUB.NNN.NOME.JAR, '
  'com até 18 caracteres de identificação antes da extensão.'
),

-- GRUPO: TRANSHOST — Transferência entre servidores internos
(3,
  'Gera Lista Trans_Hosts',
  '/u/bin/J.DIT.OPR.003.SH',
  'Pré-requisito obrigatório do processo Transhost. Gera a LISTA de arquivos a serem transferidos '
  'entre servidores internos, consumida pelo Job Tipo 10. Deve ser executado antes de qualquer transferência.'
),
(10,
  'Transferência de Arqs Entre Servidores',
  '/u/bin/J.DIT.OPR.010.SH',
  'Efetua a transferência de arquivos entre servidores internos via operação GET (captura remoto) '
  'ou PUT (envia ao remoto). Consome a lista gerada pelo Job Tipo 3. '
  'Exige execução prévia do Tipo 3 com a mesma Application.'
),

-- GRUPO: BACKUP — Rotulação e controle de fitas magnéticas (seção 5.3)
(5,
  'Rotulação de Fita Magnética (Backup)',
  '/u/bin/J.DIT.BCK.005.SH',
  'Registra e valida o rótulo de fita magnética para operações de backup, seguindo a norma '
  'N/PD/004/02 seção 5.3. Para Windows/Unix o padrão é FP-SERVIDOR/TIPO/MODO (máx 17 chars). '
  'Para Unix com banco de dados: FP-SERVIDOR-INSTÂNCIA/TIPO/MODO.'
),

-- GRUPO: CONNECT:DIRECT — Transferência com entidades externas (seção 5.4)
(6,
  'Transferência Connect:Direct (Dataprev → Externo)',
  '/u/bin/J.DIT.TCD.006.SH',
  'Configura o envio de arquivos da Dataprev para entidade externa via Connect:Direct. '
  'O nome do arquivo deve seguir a norma N/PD/004/02 seção 5.4.1: '
  'F SIS SUB 99 . MMMMMMMM . BXXX . AAAAMMDD . HHMMSS . X NNNNNNN.'
),
(7,
  'Recebimento Connect:Direct (Externo → Dataprev)',
  '/u/bin/J.DIT.TCD.007.SH',
  'Configura o recebimento de arquivos de entidade externa na Dataprev via Connect:Direct. '
  'O nome do arquivo deve seguir a norma N/PD/004/02 seção 5.4.2: '
  'SIS SUB 99 . BXXX . X NNNNNNN.'
)

ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- PARÂMETROS — Tipo 1: Implantação de Shell Script Unix/Linux
-- =============================================================================
-- Comando gerado: /u/bin/J.DIT.SWA.001.SH "J.SIS.SUB.001.SH" -aDIT.SWADM -sSIS -bSUB
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(1, null,  'file_name',          true,  'Nome do shell script a implantar. Formato: J.SIS.SUB.NNN.SH (exatamente 16 caracteres, MAIÚSCULAS, delimitador ponto).',
           'positional', 0, 'text',   null, 'J.CNS.VRC.001.SH', '^J\.[A-Z]{3}\.[A-Z]{3}\.[0-9]{3}\.SH$', true),
(1, '-a',  'Application',        true,  'Nome da Application no Workload que agrupará o script em produção.',
           'flag', 1, 'text',   null, 'DIT.SWADM.DIARIO', null, true),
(1, '-s',  'Sistema',            true,  'Sigla do sistema (3 caracteres alfabéticos em MAIÚSCULAS, ex: CNS, BGP, SCO).',
           'flag', 2, 'text',   null, 'CNS', '^[A-Z]{3}$', true),
(1, '-b',  'Subsistema',         true,  'Sigla do subsistema (3 caracteres alfabéticos em MAIÚSCULAS, ex: VRC, ETL, ATU).',
           'flag', 3, 'text',   null, 'VRC', '^[A-Z]{3}$', true),
(1, '-d',  'Diretório Destino',  false, 'Caminho do diretório onde o script será instalado em produção. Se omitido, usa o padrão do sistema.',
           'flag', 4, 'path',   null, '/u/bin', null, true),
(1, null,  'objetivo',           false, 'Descrição do objetivo e funcionalidade do script a ser implantado.',
           'internal', 5, 'text', null, 'Processar transferência diária de arquivos', null, true);

-- =============================================================================
-- PARÂMETROS — Tipo 2: Implantação de Objeto Procedural de BD
-- =============================================================================
-- Comando gerado: /u/bin/J.DIT.SWA.002.SH "pr_PR_CNS_MIG_001_INSERCAO.sql" -oPR_CNS_MIG_001_INSERCAO -tpr -sCNS -bMIG
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(2, null,  'file_name',    true,  'Nome do script SQL. Formato: tipo_NomeObjeto.sql (máx 42 chars). Ex: pr_PR_CNS_MIG_001_INSERCAO.sql. Tipos: pkg (package), pkgbody (body), pr (procedure), fc (function), tr (trigger).',
           'positional', 0, 'text', null, 'pr_PR_CNS_MIG_001_INSERCAO.sql', '^(pkg|pkgbody|pr|fc|tr)_[A-Za-z0-9_]{1,30}\.sql$', true),
(2, '-o',  'object_name',  true,  'Nome do objeto interno para execução pelo JOB (rotina batch). Formato: TT_SIS_SUB_NNN_OPCIONAL (máx 30 chars, MAIÚSCULAS). Ex: PR_CNS_MIG_001_INSERCAO.',
           'flag', 1, 'text', null, 'PR_CNS_MIG_001_INSERCAO', '^(PG|PR)_[A-Z]{3}_[A-Z]{3}_[0-9]{3}(_[A-Z0-9]{1,15})?$', true),
(2, '-t',  'Tipo de Objeto', true, 'Tipo do objeto de banco de dados: pr (PROCEDURE), pg (PACKAGE), pkgbody (PACKAGE BODY), fc (FUNCTION), tr (TRIGGER).',
           'flag', 2, 'text', null, 'pr', '^(pkg|pkgbody|pr|fc|tr)$', true),
(2, '-s',  'Sistema',      true,  'Sigla do sistema (3 caracteres em MAIÚSCULAS).',
           'flag', 3, 'text', null, 'CNS', '^[A-Z]{3}$', true),
(2, '-b',  'Subsistema',   true,  'Sigla do subsistema (3 caracteres em MAIÚSCULAS).',
           'flag', 4, 'text', null, 'MIG', '^[A-Z]{3}$', true),
(2, null,  'objetivo',     false, 'Objetivo do objeto procedural a ser implantado.',
           'internal', 5, 'text', null, 'Inserção de registros migrados do CNIS', null, true);

-- =============================================================================
-- PARÂMETROS — Tipo 3: Gera Lista Trans_Hosts
-- =============================================================================
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(3, '-a', 'Application',          true,  'Nome da Application no Workload que agrupa o fluxo de jobs. Identifica o conjunto de operações a executar.',
          'flag', 0, 'text', null, 'DIT.TRH.DIARIO', null, true),
(3, '-s', 'Servidor',             false, 'Nome do servidor onde o job será executado. Se omitido, usa o servidor padrão da Application.',
          'flag', 1, 'text', null, 'UXRJO001', null, true),
(3, '-d', 'Data de Processamento', false, 'Data de referência para geração da lista no formato AAAAMMDD. Se omitida, usa a data corrente.',
          'flag', 2, 'date', null, '20251016', '^\d{8}$', true)

ON CONFLICT DO NOTHING;

-- =============================================================================
-- PARÂMETROS — Tipo 4: Implantação de Executável Java (JAR)
-- =============================================================================
-- Comando gerado: /u/bin/J.DIT.SWA.004.SH "P.CNS.ETL.001.LOADER.JAR" -aDIT.JAVA -sCNS -bETL -d/u/app/cns
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(4, null,  'file_name',           true,  'Nome do arquivo JAR. Formato: P.SIS.SUB.NNN.NOME.JAR onde NOME tem até 18 chars de identificação (MAIÚSCULAS, delimitador ponto). Ex: P.BGC.ETL.001.GERACAO.RELATORIO.JAR.',
           'positional', 0, 'text', null, 'P.CNS.ETL.001.LOADER.JAR', '^P\.[A-Z]{3}\.[A-Z]{3}\.[0-9]{3}\.[A-Z0-9.]{1,18}\.JAR$', true),
(4, '-a',  'Application',         true,  'Nome da Application no Workload que executará o JAR em produção.',
           'flag', 1, 'text', null, 'DIT.JAVA.BATCH', null, true),
(4, '-s',  'Sistema',             true,  'Sigla do sistema (3 caracteres em MAIÚSCULAS).',
           'flag', 2, 'text', null, 'CNS', '^[A-Z]{3}$', true),
(4, '-b',  'Subsistema',          true,  'Sigla do subsistema (3 caracteres em MAIÚSCULAS).',
           'flag', 3, 'text', null, 'ETL', '^[A-Z]{3}$', true),
(4, '-d',  'Diretório Destino',   false, 'Caminho de instalação do JAR em produção.',
           'flag', 4, 'path', null, '/u/app/cns', null, true),
(4, null,  'objetivo',            false, 'Objetivo da aplicação Java a ser implantada.',
           'internal', 5, 'text', null, 'Geração de relatório de extração ETL', null, true);

-- =============================================================================
-- PARÂMETROS — Tipo 5: Rotulação de Fita Magnética (Backup)
-- =============================================================================
-- Comando gerado: /u/bin/J.DIT.BCK.005.SH -rFDWXRJO098/F/ON -sWXRJO098 -tF -pD -mON
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(5, '-r', 'Rótulo da Fita',    true,  'Rótulo identificador da fita magnética (máx 17 chars). '
                                       'Windows/Unix: FP-SERVIDOR/TIPO/MODO (ex: FDWXRJO098/F/ON). '
                                       'Unix BD: FP-SERVIDOR-INSTÂNCIA/TIPO/MODO (ex: FDUXRJO063PB3/F/ON).',
          'flag', 0, 'text', null, 'FDWXRJO098/F/ON', null, true),
(5, '-s', 'Servidor',          true,  'Nome do servidor de backup (ex: WXRJO098, UXRJO063).',
          'flag', 1, 'text', null, 'WXRJO098', null, true),
(5, '-t', 'Tipo de Backup',    true,  'Tipo do backup: F (Full/UNIX), N (Normal/Windows), I (Incremental), C (Cópia/Windows), D (Diferencial/Windows).',
          'flag', 2, 'text', null, 'F', '^(F|N|I|C|D)$', true),
(5, '-p', 'Periodicidade',     true,  'Periodicidade do backup: D (Diário), H (Semanal/Hebdomadário), M (Mensal), E (Eventual).',
          'flag', 3, 'text', null, 'D', '^(D|H|M|E)$', true),
(5, '-m', 'Modo de Execução',  true,  'Modo de execução: ON (Online - sistema ativo) ou OF (Offline - sistema parado).',
          'flag', 4, 'text', null, 'ON', '^(ON|OF)$', true),
(5, '-i', 'Instância BD',      false, 'Instância do banco de dados (até 6 chars, minúsculas). Obrigatório apenas para fitas Unix de banco de dados (ex: pb3, pcnis1).',
          'flag', 5, 'text', null, 'pb3', '^[a-z0-9]{1,6}$', true);

-- =============================================================================
-- PARÂMETROS — Tipo 6: Transferência Connect:Direct (Dataprev → Externo)
-- =============================================================================
-- Comando gerado: /u/bin/J.DIT.TCD.006.SH "FCNSVRC01.MMMMMMMM.B009.20260624.120000.D0000001" -eB009 -d20260624 -h120000 -tD
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(6, null,  'file_name',          true,  'Nome do arquivo de transferência. Formato norma 5.4.1: '
                                         'F SIS SUB 99 . MMMMMMMM . BXXX . AAAAMMDD . HHMMSS . X NNNNNNN. '
                                         'Exemplo: FCNSVRC01.MMMMMMMM.B009.20260624.120000.D0000001.',
           'positional', 0, 'text', null, 'FCNSVRC01.MMMMMMMM.B009.20260624.120000.D0000001', null, true),
(6, '-e',  'Código da Entidade', true,  'Código de identificação da entidade externa: B (banco), I (INSS), E (externo) + 3 dígitos. Ex: B009 (Serpro), B888 (Correio), I997 (INSS).',
           'flag', 1, 'text', null, 'B009', '^[BIE][0-9]{3}$', true),
(6, '-d',  'Data de Tramitação', true,  'Data de tramitação do arquivo no formato AAAAMMDD.',
           'flag', 2, 'date', null, '20260624', '^\d{8}$', true),
(6, '-h',  'Horário de Tramitação', true, 'Horário de tramitação no formato HHMMSS.',
           'flag', 3, 'text', null, '120000', '^\d{6}$', true),
(6, '-t',  'Tipo de Arquivo',   true,  'Tipo do arquivo: D (Dados) ou R (Relatório/Resposta).',
           'flag', 4, 'text', null, 'D', '^(D|R)$', true),
(6, null,  'maquina_gateway',   false, 'Máquina gateway na Dataprev que tem o link com a entidade externa (campo MMMMMMMM). Padrão: MMMMMMMM.',
           'internal', 5, 'text', 'MMMMMMMM', 'MMMMMMMM', null, true);

-- =============================================================================
-- PARÂMETROS — Tipo 7: Recebimento Connect:Direct (Externo → Dataprev)
-- =============================================================================
-- Comando gerado: /u/bin/J.DIT.TCD.007.SH "CNSVRC01.B009.D0000001" -eB009
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(7, null,  'file_name',          true,  'Nome do arquivo recebido. Formato norma 5.4.2 (enviado pela entidade externa): '
                                         'SIS SUB 99 . BXXX . X NNNNNNN. '
                                         'Exemplo: CNSVRC01.B009.D0000001.',
           'positional', 0, 'text', null, 'CNSVRC01.B009.D0000001', null, true),
(7, '-e',  'Código da Entidade', true,  'Código de identificação da entidade de origem: B/I/E + 3 dígitos. Ex: B009 (Serpro), B888 (Correio), I997 (INSS).',
           'flag', 1, 'text', null, 'B009', '^[BIE][0-9]{3}$', true),
(7, null,  'sistema_origem',    false, 'Sigla do sistema de origem na entidade externa (3 chars).',
           'internal', 2, 'text', null, 'CNS', '^[A-Z]{3}$', true);

-- =============================================================================
-- PARÂMETROS — Tipo 10: Transferência de Arqs Entre Servidores
-- =============================================================================
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(10, '-a', 'Application',           true,  'Nome da Application no Workload. Deve ser a mesma informada no Job Tipo 3 que gerou a lista de transferência.',
           'flag', 0, 'text', null, 'DIT.TRH.DIARIO', null, true),
(10, '-o', 'Operação (GET/PUT)',     true,  'Sentido da transferência: GET = servidor local captura arquivo do remoto; PUT = servidor local envia arquivo ao remoto.',
           'flag', 1, 'text', null, 'GET', '^(GET|PUT)$', true),
(10, '-s', 'Servidor de Origem',    true,  'Nome do servidor de onde os arquivos serão transferidos.',
           'flag', 2, 'text', null, 'UXRJO001', null, true),
(10, '-t', 'Servidor de Destino',   true,  'Nome do servidor que receberá os arquivos.',
           'flag', 3, 'text', null, 'UXRSP002', null, true),
(10, '-d', 'Data de Processamento', false, 'Data de referência no formato AAAAMMDD. Deve coincidir com a usada no Job Tipo 3.',
           'flag', 4, 'date', null, '20251016', '^\d{8}$', true)

ON CONFLICT DO NOTHING;

COMMIT;
