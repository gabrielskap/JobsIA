-- =============================================================================
-- MIGRATION: 0020_add_capador_parameters.sql
-- Adiciona os parâmetros do CAPADOR (Conferência de Armazenamento nos Servidores)
-- para suporte à verificação de armazenamento de arquivos em servidores.
-- =============================================================================

BEGIN;

-- Adicionar parâmetros de armazenamento aos Jobs de Transferência e Implantação (Tipos 1, 3, 4, 6, 7, 10)

-- Job Tipo 10: Transferência de Arqs Entre Servidores
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(10, null, 'diretorio_origem', false, 'Caminho físico do diretório de origem no servidor do CAPADOR.', 'internal', 5, 'path', null, '/u/data/origem', null, true),
(10, null, 'diretorio_destino', false, 'Caminho físico do diretório de destino no servidor do CAPADOR.', 'internal', 6, 'path', null, '/u/data/destino', null, true),
(10, null, 'capacidade_armazenamento', false, 'Volume/Capacidade estimada de disco em megabytes ou gigabytes.', 'internal', 7, 'text', null, '500MB', null, true),
(10, null, 'permissoes_usuario', false, 'Usuário Linux/Windows proprietário do armazenamento (ex: swadm, operacao).', 'internal', 8, 'text', null, 'swadm:operacao', null, true)
ON CONFLICT DO NOTHING;

-- Job Tipo 1: Shell Script
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(1, null, 'diretorio_origem', false, 'Caminho do repositório/diretório de origem do script no CAPADOR.', 'internal', 6, 'path', null, '/u/src/sh', null, true),
(1, null, 'capacidade_armazenamento', false, 'Capacidade em disco requerida no servidor de produção.', 'internal', 7, 'text', null, '10MB', null, true),
(1, null, 'permissoes_usuario', false, 'Permissões de acesso no diretório destino (ex: 755 swadm).', 'internal', 8, 'text', null, 'swadm:swadm', null, true)
ON CONFLICT DO NOTHING;

-- Job Tipo 4: Java JAR
INSERT INTO "JobsIA_parameters"
  (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
VALUES
(4, null, 'diretorio_origem', false, 'Caminho de origem da release JAR no CAPADOR.', 'internal', 6, 'path', null, '/u/releases/jar', null, true),
(4, null, 'capacidade_armazenamento', false, 'Capacidade em disco estimada para a aplicação Java e logs.', 'internal', 7, 'text', null, '100MB', null, true),
(4, null, 'permissoes_usuario', false, 'Usuário/Grupo proprietário do pacote Java no servidor.', 'internal', 8, 'text', null, 'swadm:javaapp', null, true)
ON CONFLICT DO NOTHING;

COMMIT;
