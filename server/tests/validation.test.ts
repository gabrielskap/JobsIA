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
  const resultDate = await validationEngine.validateChecklist(testJobTypeId, {
    ambiente: 'Unix',
    file_name: 'D.CNS.BOE.002.20251016',
    numero_registro: '123',
    data_execucao: '24-06-2026', // Deve ser YYYY-MM-DD
  }, testUserId, false);
  assert.strictEqual(resultDate.passed, false);
  assert.ok(resultDate.errors.find(e => e.ruleCode.includes('PARAM-TYPE-DATE')));
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
