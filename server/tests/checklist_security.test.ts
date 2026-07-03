import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';

let testUserId: string;
let testUserToken: string;
const testJobTypeId = 888;

test.before(async () => {
  // Limpar tabelas de testes
  await pool.query('DELETE FROM "JobsIA_validation_runs"');
  await pool.query('DELETE FROM "JobsIA_checklists"');
  await pool.query('DELETE FROM "JobsIA_parameters" WHERE job_type_id = $1', [testJobTypeId]);
  await pool.query('DELETE FROM "JobsIA_types" WHERE id = $1', [testJobTypeId]);
  await pool.query('DELETE FROM users WHERE email = $1', ['sec_tester@dataprev.gov.br']);

  // Criar usuário
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['sec_tester@dataprev.gov.br', 'dummy_hash', 'Sec Tester', 'SOLICITANTE']
  );
  testUserId = userRes.rows[0].id;
  testUserToken = jwt.sign({ sub: testUserId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  // Criar Tipo de Job de teste
  await pool.query(
    `INSERT INTO "JobsIA_types" (id, name, script, description)
     VALUES ($1, $2, $3, $4)`,
    [testJobTypeId, 'Job Seguro Teste', '/u/bin/secure_job.sh', 'Job para testar segurança e persistência']
  );

  // Parâmetros do Job
  await pool.query(
    `INSERT INTO "JobsIA_parameters" 
      (job_type_id, name, required, parameter_type, order_index, data_type, validation_regex, active)
     VALUES 
      ($1, 'file_name', true, 'positional', 0, 'text', null, true),
      ($1, 'max_records', true, 'flag', 1, 'number', null, true),
      ($1, 'ambiente', true, 'flag', 2, 'internal', null, true)`,
    [testJobTypeId]
  );
});

test('Segurança Checklist - Sucesso na Criação Estruturada', async () => {
  const requestId = 'req-success-12345';
  const res = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      request_id: requestId,
      job_type_id: testJobTypeId,
      collected_data: {
        file_name: 'D.CNS.BOE.999.20260624',
        max_records: '150',
        ambiente: 'Unix',
      },
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.request_id, requestId);
  assert.strictEqual(res.body.status, 'Concluído');
  assert.strictEqual(res.body.job_type_id, testJobTypeId);
  assert.strictEqual(res.body.semantic_type, 'shell_script'); // Termina em .sh do script
  assert.strictEqual(res.body.target_file, 'D.CNS.BOE.999.20260624');
  assert.strictEqual(res.body.command, '/u/bin/secure_job.sh "D.CNS.BOE.999.20260624"');
  assert.deepStrictEqual(res.body.errors, []);
  assert.deepStrictEqual(res.body.warnings, []);
});

test('Segurança Checklist - Falha de Validação Estruturada', async () => {
  const requestId = 'req-failure-54321';
  // Enviar max_records inválido (não numérico) para forçar falha no validador
  const res = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      request_id: requestId,
      job_type_id: testJobTypeId,
      collected_data: {
        file_name: 'D.CNS.BOE.999.20260624',
        max_records: 'texto_invalido',
        ambiente: 'Unix',
      },
    });

  assert.strictEqual(res.status, 201); // Retorna 201 mas salva como Falha Validação
  assert.strictEqual(res.body.request_id, requestId);
  assert.strictEqual(res.body.status, 'Falha Validação');
  assert.ok(res.body.errors.length > 0);
  assert.ok(res.body.errors.some((e: any) => e.ruleCode.includes('PARAM-TYPE-NUMBER')));
});

test('Segurança Checklist - Idempotência (Duplicidade)', async () => {
  const requestId = 'req-idempotent-999';
  const payload = {
    request_id: requestId,
    job_type_id: testJobTypeId,
    collected_data: {
      file_name: 'D.CNS.BOE.999.20260624',
      max_records: '500',
      ambiente: 'Unix',
    },
  };

  // Primeira requisição: Cria
  const res1 = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send(payload);

  assert.strictEqual(res1.status, 201);
  const originalId = res1.body.id;

  // Segunda requisição (duplicada): Deve retornar o checklist existente com status 200
  const res2 = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send(payload);

  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.id, originalId);
  assert.strictEqual(res2.body.request_id, requestId);
  
  // Garantir que não houve inserção duplicada no banco
  const dbCheck = await pool.query('SELECT count(*) FROM "JobsIA_checklists" WHERE request_id = $1', [requestId]);
  assert.strictEqual(Number(dbCheck.rows[0].count), 1);
});

test('Segurança Checklist - Validação de Schema (Erro Controlado)', async () => {
  // Enviar proposta sem job_type_id
  const resNoJob = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      request_id: 'req-bad-schema-1',
      collected_data: {
        file_name: 'teste.sh',
      },
    });

  assert.strictEqual(resNoJob.status, 400);
  assert.ok(resNoJob.body.message.includes('Erro de validação do schema'));
  assert.ok(resNoJob.body.errors.some((e: string) => e.includes('job_type_id')));

  // Enviar proposta sem request_id mas no fluxo estruturado (campo ausente/vazio)
  const resNoRequest = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      request_id: '',
      job_type_id: testJobTypeId,
      collected_data: {
        file_name: 'teste.sh',
      },
    });

  assert.strictEqual(resNoRequest.status, 400);
  assert.ok(resNoRequest.body.errors.some((e: string) => e.includes('request_id')));
});

test('Segurança Checklist - Retry com Nova Chave', async () => {
  // Cenário de retry: se o usuário tenta criar com uma chave que falhou na validação, 
  // ele pode corrigir e enviar com um NOVO request_id para tentar criar com sucesso.
  const reqIdFail = 'req-retry-fail';
  const resFail = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      request_id: reqIdFail,
      job_type_id: testJobTypeId,
      collected_data: {
        file_name: 'D.CNS.BOE.999.20260624',
        max_records: 'abc', // Incorreto
        ambiente: 'Unix',
      },
    });

  assert.strictEqual(resFail.body.status, 'Falha Validação');

  // Retry com outra chave e dados corrigidos
  const reqIdSuccess = 'req-retry-success';
  const resSuccess = await request(app)
    .post('/api/checklists')
    .set('Authorization', `Bearer ${testUserToken}`)
    .send({
      request_id: reqIdSuccess,
      job_type_id: testJobTypeId,
      collected_data: {
        file_name: 'D.CNS.BOE.999.20260624',
        max_records: '200', // Corrigido
        ambiente: 'Unix',
      },
    });

  assert.strictEqual(resSuccess.status, 201);
  assert.strictEqual(resSuccess.body.status, 'Concluído');
});
