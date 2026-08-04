import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';
import { validationEngine } from '../services/validationEngine';

let testUserId: string;
let testUserToken: string;
let testJobTypeId = 999;

// Configurar usuário de teste e Tipo de Job de teste
test.before(async () => {
  // Limpar tabelas de validação e checklists de teste anteriores
  await pool.query('DELETE FROM "JobsIA_validation_runs"');
  await pool.query('DELETE FROM "JobsIA_checklists"');
  await pool.query('DELETE FROM "JobsIA_parameters" WHERE job_type_id = $1', [testJobTypeId]);
  await pool.query('DELETE FROM "JobsIA_types" WHERE id = $1', [testJobTypeId]);
  await pool.query('DELETE FROM users WHERE email = $1', ['testval@dataprev.gov.br']);

  // Criar usuário
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['testval@dataprev.gov.br', 'dummy_hash', 'Val Tester', 'OPERADOR']
  );
  testUserId = userRes.rows[0].id;
  testUserToken = jwt.sign({ sub: testUserId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  // Criar Tipo de Job genérico com parâmetros para teste
  await pool.query(
    `INSERT INTO "JobsIA_types" (id, name, script, description)
     VALUES ($1, $2, $3, $4)`,
    [testJobTypeId, 'Job de Validação Teste', '/u/bin/test_validation.sh', 'Job para testar motor de validação']
  );

  // Criar parâmetros
  await pool.query(
    `INSERT INTO "JobsIA_parameters" 
      (job_type_id, name, required, parameter_type, order_index, data_type, validation_regex, active)
     VALUES 
      ($1, 'file_name', true, 'positional', 0, 'text', null, true),
      ($1, 'numero_registro', true, 'flag', 1, 'number', null, true),
      ($1, 'confirmar_envio', false, 'flag', 2, 'boolean', null, true),
      ($1, 'data_execucao', false, 'flag', 3, 'date', null, true),
      ($1, 'object_name', false, 'flag', 4, 'text', null, true),
      ($1, 'tape_label', false, 'flag', 5, 'text', null, true),
      ($1, 'diretorio_origem', false, 'flag', 6, 'text', null, true),
      ($1, 'diretorio_destino', false, 'flag', 7, 'text', null, true)`,
    [testJobTypeId]
  );

  // Garantir que as regras da norma existam e estejam publicadas no banco de testes
  await pool.query(`
    INSERT INTO "JobsIA_validation_rules" (secao, codigo, campo_alvo, ambiente, tipo_regra, severidade, mensagem, expressao, status)
    VALUES
      ('5.1.1', 'RULE-UNIX-PREFIX', 'file_name', 'Unix', 'regex', 'BLOQUEANTE', 
       'O nome do arquivo Unix/Linux deve iniciar com o prefixo padrão de 13 caracteres T.SIS.SUB.999 (onde T é B,D,F,J,L,P,T,W,X; SIS e SUB têm 3 letras maiúsculas; 999 tem 3 dígitos).',
       '^[BDFJLPTWX]\\.[A-Z]{3}\\.[A-Z]{3}\\.[0-9]{3}', 'PUBLICADO'),
      
      ('5.1.1', 'RULE-UNIX-UPPER-MAX', 'file_name', 'Unix', 'regex', 'BLOQUEANTE',
       'O nome do arquivo Unix/Linux deve estar em LETRAS MAIÚSCULAS e ter no máximo 36 caracteres.',
       '^[A-Z0-9._-]{1,36}$', 'PUBLICADO'),

      ('5.1.1', 'RULE-UNIX-SHELL-LIMIT', 'file_name', 'Unix', 'custom', 'BLOQUEANTE',
       'O nome de arquivos do tipo Job ShellScript (.sh) deve ter no máximo 16 caracteres.',
       'shell_exception', 'PUBLICADO'),

      ('5.1.1', 'RULE-UNIX-JAR-LIMIT', 'file_name', 'Unix', 'custom', 'BLOQUEANTE',
       'O nome de arquivos de pacotes ou executáveis Java (.jar) deve ter no máximo 18 caracteres de identificação (sem contar a extensão .jar).',
       'jar_exception', 'PUBLICADO'),

      ('5.1.2', 'RULE-WIN-PREFIX', 'file_name', 'Windows', 'regex', 'BLOQUEANTE', 
       'O nome do arquivo Windows deve iniciar com o prefixo padrão de 13 caracteres T_SIS_SUB_999.',
       '^[BDFJLPTWX]_[A-Z]{3}_[A-Z]{3}_[0-9]{3}', 'PUBLICADO'),

      ('5.1.2', 'RULE-WIN-UPPER-MAX', 'file_name', 'Windows', 'regex', 'BLOQUEANTE',
       'O nome do arquivo Windows deve estar em LETRAS MAIÚSCULAS e ter no máximo 36 caracteres.',
       '^[A-Z0-9_]{1,36}$', 'PUBLICADO'),

      ('5.1.3', 'RULE-MAINFRAME-PREFIX', 'file_name', 'Mainframe', 'regex', 'BLOQUEANTE', 
       'O nome do arquivo Mainframe deve iniciar com o prefixo padrão de 13 caracteres T/SIS/SUB/999.',
       '^[BDFJLPTWX]/[A-Z]{3}/[A-Z]{3}/[0-9]{3}', 'PUBLICADO'),

      ('5.1.3', 'RULE-MAINFRAME-UPPER-MAX', 'file_name', 'Mainframe', 'regex', 'BLOQUEANTE',
       'O nome do arquivo Mainframe deve estar em LETRAS MAIÚSCULAS e ter no máximo 36 caracteres.',
       '^[A-Z0-9/]{1,36}$', 'PUBLICADO'),

      ('5.2', 'RULE-DB-SQL-FORMAT', 'file_name', 'Global', 'regex', 'BLOQUEANTE',
       'O script SQL para objetos procedurais deve possuir extensão .sql, usar underscore e ter no máximo 42 caracteres no formato tipo_NomeObjeto.sql (ex: pr_PR_CNS_MIG_001_INSERCAO.sql).',
       '^(pkg|pkgbody|pr|fc|tr)_[A-Za-z0-9_]{1,30}\\.sql$', 'PUBLICADO'),

      ('5.2.1', 'RULE-DB-OBJ-FORMAT', 'object_name', 'Global', 'custom', 'BLOQUEANTE',
       'O nome do objeto interno para rotinas batch deve ter no máximo 30 caracteres, letras maiúsculas, no padrão TT_SIS_SUB_999_OPCIONAL.',
       'db_object_name_validation', 'PUBLICADO'),

      ('5.3.1', 'RULE-TAPE-WIN-UNIX', 'tape_label', 'Global', 'custom', 'BLOQUEANTE',
       'Rótulo de fita de backup Windows/Unix inválido. Deve seguir o padrão F P HHHHHHHH / T / OO (máximo 17 caracteres).',
       'tape_win_unix_validation', 'PUBLICADO'),

      ('5.3.2', 'RULE-TAPE-UNIX-DB', 'tape_label', 'Global', 'custom', 'BLOQUEANTE',
       'Rótulo de fita de backup Unix para banco de dados inválido. Deve seguir o padrão F P NNNNNNNN IIIII / T / 00 (ex: FDUXRJO063PB3/F/ON).',
       'tape_unix_db_validation', 'PUBLICADO'),

      ('5.4.1', 'RULE-CD-SEND', 'file_name', 'Global', 'custom', 'BLOQUEANTE',
       'Nome do arquivo de transferência Connect:Direct (Dataprev -> Externo) inválido. Deve seguir o padrão F SIS SUB 99 . MMMMMMMM . BXXX . AAAAMMDD . HHMMSS . X NNNNNNN.',
       'cd_send_validation', 'PUBLICADO'),

      ('5.4.2', 'RULE-CD-RECEIVE', 'file_name', 'Global', 'custom', 'BLOQUEANTE',
       'Nome do arquivo recebido via Connect:Direct (Externo -> Dataprev) inválido. Deve seguir o padrão SIS SUB 99 . BXXX . X NNNNNNN.',
       'cd_receive_validation', 'PUBLICADO')
    ON CONFLICT (codigo) DO UPDATE SET status = 'PUBLICADO'
  `);
});

test.after(async () => {
  // Limpar tabelas
  await pool.query('DELETE FROM "JobsIA_validation_runs"');
  await pool.query('DELETE FROM "JobsIA_checklists"');
  await pool.query('DELETE FROM "JobsIA_parameters" WHERE job_type_id = $1', [testJobTypeId]);
  await pool.query('DELETE FROM "JobsIA_types" WHERE id = $1', [testJobTypeId]);
  await pool.query('DELETE FROM users WHERE email = $1', ['testval@dataprev.gov.br']);
});

// ===========================================================================
// SEÇÃO 1: TESTES DO MOTOR DE VALIDAÇÃO (DIRETO)
// ===========================================================================

test('Motor de Validação - Nomenclatura Unix Válida (5.1.1)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    numero_registro: '1234',
  }, testUserId, false);
  console.log('DIAGNOSTIC result Unix Válida:', JSON.stringify(result, null, 2));

  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.errors.length, 0);
});

test('Motor de Validação - Nomenclatura Unix Inválida (5.1.1 - Sem prefixo correto)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'CNS.BOE.002.20251016', // Sem tipo inicial D.
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, false);
  const prefixError = result.errors.find(e => e.ruleCode === 'RULE-UNIX-PREFIX');
  assert.ok(prefixError);
});

test('Motor de Validação - Application não é usada como nome de arquivo', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    Application: 'DIT.TRH.DIARIO',
    numero_registro: '1234',
  }, testUserId, false);

  assert.ok(result.errors.some(error => error.ruleCode === 'PARAM-REQUIRED-FILE_NAME'));
  assert.ok(!result.errors.some(error => error.ruleCode === 'RULE-UNIX-PREFIX'));
  assert.ok(!result.errors.some(error => error.ruleCode === 'RULE-UNIX-UPPER-MAX'));
});

test('Checklist Application - Tipos 3 e 10 não validam Application como file_name', async () => {
  const result = await validationEngine.validateApplicationChecklist({
    request_id: 'validation-no-file-name-for-transhost',
    schema_version: 2,
    application: {
      name: 'DIT.TRH.DIARIO',
      responsible_name: 'Val Tester',
      server_mode: 'shared',
      shared_server: 'UXRJO001',
    },
    jobs: [
      {
        sequence: 1,
        job_type_id: 3,
        generic: { name: 'Hadoop' },
        bridge: { name: 'PONTE-DIOT-01' },
        server: 'UXRJO001',
        parameters: {
          Application: 'DIT.TRH.DIARIO',
          'Data de Processamento': '20260805',
        },
        capador: { applicable: false },
      },
      {
        sequence: 2,
        job_type_id: 10,
        generic: { name: 'DataFlux' },
        bridge: { name: 'PONTE-DIOT-02' },
        parameters: {
          Application: 'DIT.TRH.DIARIO',
          'Operação (GET/PUT)': 'GET',
          'Servidor de Origem': 'UXRJO001',
          'Servidor de Destino': 'UXRSP002',
          'Data de Processamento': '20260805',
        },
        capador: { applicable: false },
      },
    ],
  }, testUserId, false);

  assert.ok(!result.errors.some(error => error.ruleCode === 'RULE-UNIX-PREFIX'));
  assert.ok(!result.errors.some(error => error.field.endsWith('.parameters.file_name')));
});

test('Motor de Validação - Nomenclatura Unix Inválida (5.1.1 - Tamanho > 36)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.ESTENOMEDEESTRAPOLAOOLIMITEDEPRONTO',
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, false);
  const maxLenError = result.errors.find(e => e.ruleCode === 'RULE-UNIX-UPPER-MAX');
  assert.ok(maxLenError);
});

test('Motor de Validação - Exceção Unix ShellScript <= 16 chars (5.1.1)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'J.CNS.BOE.002.SH', // 16 caracteres
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, true);
});

test('Motor de Validação - Exceção Unix ShellScript > 16 chars (5.1.1)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'J.CNS.BOE.002.SHELL.SH', // > 16 caracteres
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, false);
  const shellError = result.errors.find(e => e.ruleCode === 'RULE-UNIX-SHELL-LIMIT');
  assert.ok(shellError);
});

test('Motor de Validação - Exceção Unix JAR <= 18 chars id (5.1.1)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'P.CNS.BOE.002.JAR', // 17 caracteres (id possui 13 chars 'P.CNS.BOE.002')
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, true);
});

test('Motor de Validação - Exceção Unix JAR > 18 chars id (5.1.1)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'P.CNS.BOE.002.MAISDEOITOCHARSID.JAR', // id possui > 18 chars
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, false);
  const jarError = result.errors.find(e => e.ruleCode === 'RULE-UNIX-JAR-LIMIT');
  assert.ok(jarError);
});

test('Motor de Validação - Nomenclatura Windows Válida (5.1.2)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Windows',
    file_name: 'D_SCO_ATU_005_BATIMENTO',
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, true);
});

test('Motor de Validação - Nomenclatura Mainframe Válida (5.1.3)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Mainframe',
    file_name: 'D/SCO/ATU/005/BATIMENTO',
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, true);
});

test('Motor de Validação - Objeto Procedural SQL e Nome do Objeto (5.2 / 5.2.1)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'pr_PR_CNS_MIG_001_INSERCAO.sql',
    object_name: 'PR_CNS_MIG_001_INSERCAO',
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, true);
});

test('Motor de Validação - Objeto Procedural SQL Inválido (5.2)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'pr_PR_CNS_MIG_001_INSERCAO.txt', // Extensão errada
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, false);
  const sqlError = result.errors.find(e => e.ruleCode === 'RULE-DB-SQL-FORMAT');
  assert.ok(sqlError);
});

test('Motor de Validação - Fita Magnética Windows/Unix Válida (5.3.1)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    tape_label: 'FDWXRJO098/F/ON',
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, true);
});

test('Motor de Validação - Fita Magnética Unix Banco de Dados Válida (5.3.2)', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    tape_label: 'FDUXRJO063PB3/F/ON',
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, true);
});

test('Motor de Validação - Connect:Direct Envio Válido (5.4.1)', async () => {
  // Padrão: F SIS SUB 99 . MMMMMMMM . BXXX . AAAAMMDD . HHMMSS . X NNNNNNN
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'FCNSVRC01.MMMMMMMM.B009.20260624.120000.D0000001',
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, true);

  // Caso real com identificador dinâmico numérico
  const resultReal = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'FCNSVRC01.20456868.B009.20260624.120000.D0000653',
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(resultReal.passed, true);
});

test('Motor de Validação - Connect:Direct Recebimento Válido (5.4.2)', async () => {
  // Padrão: SIS SUB 99 . BXXX . X NNNNNNN
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'CNSVRC01.B009.D0000001',
    numero_registro: '1234',
  }, testUserId, false);

  assert.strictEqual(result.passed, true);
});

test('Motor de Validação - Tipos de Dados e Required do Parâmetro Schema', async () => {
  // Teste número inválido
  const resultNum = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    numero_registro: 'abc', // Deve ser número
  }, testUserId, false);
  assert.strictEqual(resultNum.passed, false);
  assert.ok(resultNum.errors.find(e => e.ruleCode.includes('PARAM-TYPE-NUMBER')));

  // Teste boolean inválido
  const resultBool = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    numero_registro: '123',
    confirmar_envio: 'talvez', // Deve ser boolean
  }, testUserId, false);
  assert.strictEqual(resultBool.passed, false);
  assert.ok(resultBool.errors.find(e => e.ruleCode.includes('PARAM-TYPE-BOOL')));

  // Teste data inválida
  const resultDateInvalid = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    numero_registro: '123',
    data_execucao: '24-06-2026', // Formato incorreto (DD-MM-YYYY)
  }, testUserId, false);
  assert.strictEqual(resultDateInvalid.passed, false);
  assert.ok(resultDateInvalid.errors.find(e => e.ruleCode.includes('PARAM-TYPE-DATE')));

  // Teste data válida formato YYYY-MM-DD
  const resultDateDash = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    numero_registro: '123',
    data_execucao: '2026-06-24', // Formato YYYY-MM-DD
  }, testUserId, false);
  assert.strictEqual(resultDateDash.passed, true);

  // Teste data válida formato YYYYMMDD
  const resultDateCompact = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    numero_registro: '123',
    data_execucao: '20260624', // Formato YYYYMMDD
  }, testUserId, false);
  assert.strictEqual(resultDateCompact.passed, true);
});

test('Motor de Validação - Dependência entre campos', async () => {
  const result = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    numero_registro: '123',
    diretorio_origem: '/var/tmp/origem',
    // Falta diretorio_destino
  }, testUserId, false);

  assert.strictEqual(result.passed, false);
  assert.ok(result.errors.find(e => e.ruleCode === 'DEP-DIR-DESTINO'));
});

// ===========================================================================
// SEÇÃO 2: TESTES DOS ENDPOINTS API
// ===========================================================================

test('API POST /api/validate-checklist - Execução com Sucesso', async () => {
  const res = await request(app)
    .post('/api/validate-checklist')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      job_type_id: testJobTypeId,
      data: {
        ambiente: 'Unix',
        file_name: 'D.CNS.BOE.002.20251016',
        numero_registro: '1234',
      },
    });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.passed, true);
  assert.ok(res.body.validationRunId);
});

test('API POST /api/validate-checklist - Falha de validação bloqueante', async () => {
  const res = await request(app)
    .post('/api/validate-checklist')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      job_type_id: testJobTypeId,
      data: {
        ambiente: 'Unix',
        file_name: 'NOME_INVALIDO_COMPLETAMENTE',
        numero_registro: '1234',
      },
    });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.passed, false);
  assert.ok(res.body.errors.length > 0);
});

test('API POST /api/checklists - Salvamento gera status Concluído se passar na validação', async () => {
  const res = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      conversation_id: null,
      type: 'test_validation',
      status: 'Concluído',
      file_name: 'D.CNS.BOE.002.20251016',
      data: {
        __job_type_id: testJobTypeId,
        __job_name: 'Job de Validação Teste',
        ambiente: 'Unix',
        file_name: 'D.CNS.BOE.002.20251016',
        numero_registro: '1234',
      },
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.status, 'Concluído');
});

test('API POST /api/checklists - Salvamento força status Falha Validação se houver erro bloqueante', async () => {
  const res = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      conversation_id: null,
      type: 'test_validation',
      status: 'Concluído', // Tenta salvar como concluído
      file_name: 'D.CNS.BOE.002.20251016',
      data: {
        __job_type_id: testJobTypeId,
        __job_name: 'Job de Validação Teste',
        ambiente: 'Unix',
        file_name: 'INVALIDO_PREFIXO_AQUI',
        numero_registro: '1234',
      },
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.status, 'Falha Validação'); // Deve ter sido alterado para Falha Validação
});

test('Motor de Validação - Normalização Case-Insensitive dos Parâmetros', async () => {
  const data: Record<string, any> = {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    NUMERO_REGISTRO: '456', // Testando uppercase
  };
  
  const result = await validationEngine.validateChecklist(
    testJobTypeId,
    data,
    testUserId,
    false
  );
  
  assert.strictEqual(result.passed, true);
  assert.strictEqual(data['numero_registro'], '456');
  assert.strictEqual(data['NUMERO_REGISTRO'], '456');
});

