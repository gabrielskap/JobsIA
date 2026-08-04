import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';
import { aiCache } from '../routes/ai';

let adminToken: string;
let solicitanteToken: string;
let adminId: string;
let solicitanteId: string;

const TEST_JOB_ID = 999111;

test.before(async () => {
  // Limpar dados anteriores deste teste
  await pool.query('DELETE FROM "JobsIA_parameters" WHERE job_type_id = $1', [TEST_JOB_ID]);
  await pool.query('DELETE FROM "JobsIA_types" WHERE id = $1', [TEST_JOB_ID]);
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [
    'jobs_admin@dataprev.gov.br',
    'jobs_solicitante@dataprev.gov.br'
  ]);

  // Criar Admin
  const adminRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['jobs_admin@dataprev.gov.br', 'dummy', 'Jobs Admin Test', 'ADMIN']
  );
  adminId = adminRes.rows[0].id;
  adminToken = jwt.sign({ sub: adminId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  // Criar Solicitante
  const solRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['jobs_solicitante@dataprev.gov.br', 'dummy', 'Jobs Solicitante Test', 'SOLICITANTE']
  );
  solicitanteId = solRes.rows[0].id;
  solicitanteToken = jwt.sign({ sub: solicitanteId }, process.env.JWT_SECRET!, { expiresIn: '1h' });
});

test.after(async () => {
  await pool.query('DELETE FROM "JobsIA_parameters" WHERE job_type_id = $1', [TEST_JOB_ID]);
  await pool.query('DELETE FROM "JobsIA_types" WHERE id = $1', [TEST_JOB_ID]);
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [
    'jobs_admin@dataprev.gov.br',
    'jobs_solicitante@dataprev.gov.br'
  ]);
});

test('GET /api/jobs - Deve listar jobs e seus parâmetros', async () => {
  const res = await request(app)
    .get('/api/jobs')
    .set('Authorization', `Bearer ${solicitanteToken}`);

  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('POST /api/jobs - Deve impedir criação por SOLICITANTE (RBAC)', async () => {
  const res = await request(app)
    .post('/api/jobs')
    .set('Authorization', `Bearer ${solicitanteToken}`)
    .send({
      job: { id: TEST_JOB_ID, name: 'Job Teste RBAC', script: '/u/bin/rbac.sh', description: 'Teste' },
      parameters: []
    });

  assert.strictEqual(res.status, 403);
});

test('POST /api/jobs - Deve criar job e parâmetros com ADMIN', async () => {
  aiCache.set('consolidated_prompt', { prompt: 'catálogo obsoleto' });

  const res = await request(app)
    .post('/api/jobs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      job: {
        id: TEST_JOB_ID,
        name: 'Job Novo Teste',
        script: '/u/bin/job_novo.sh',
        description: 'Descrição do Job Novo'
      },
      parameters: [
        {
          name: 'param1',
          required: true,
          description: 'Primeiro parâmetro',
          parameter_type: 'positional',
          order_index: 0,
          data_type: 'text'
        }
      ]
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.id, TEST_JOB_ID);
  assert.strictEqual(res.body.parameters.length, 1);
  assert.strictEqual(res.body.parameters[0].name, 'param1');
  assert.strictEqual(aiCache.get('consolidated_prompt'), null, 'A criação do job deve invalidar o catálogo em cache');
});

test('PUT /api/jobs/:id - Deve atualizar job e seus parâmetros como ADMIN', async () => {
  aiCache.set('consolidated_prompt', { prompt: 'catálogo obsoleto' });

  const res = await request(app)
    .put(`/api/jobs/${TEST_JOB_ID}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      job: {
        name: 'Job Teste Atualizado',
        script: '/u/bin/job_atualizado.sh',
        description: 'Descrição Atualizada'
      },
      parameters: [
        {
          name: 'param_atualizado',
          required: false,
          description: 'Parâmetro atualizado',
          parameter_type: 'flag',
          order_index: 0,
          data_type: 'text'
        }
      ]
    });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.name, 'Job Teste Atualizado');
  assert.strictEqual(res.body.parameters[0].name, 'param_atualizado');
  assert.strictEqual(aiCache.get('consolidated_prompt'), null, 'A atualização do job deve invalidar o catálogo em cache');
});

test('PUT /api/jobs/:id - Retorna 404 para job inexistente', async () => {
  const res = await request(app)
    .put('/api/jobs/999999999')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      job: { name: 'Inexistente', script: 'test', description: 'test' },
      parameters: []
    });

  assert.strictEqual(res.status, 404);
});

test('POST /api/jobs/seed - Deve verificar seed de jobs como ADMIN', async () => {
  const res = await request(app)
    .post('/api/jobs/seed')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(res.status, 200);
  assert.ok(typeof res.body.seeded === 'boolean');
});

test('DELETE /api/jobs/:id - Deve remover job e parâmetros com ADMIN', async () => {
  aiCache.set('consolidated_prompt', { prompt: 'catálogo obsoleto' });

  const res = await request(app)
    .delete(`/api/jobs/${TEST_JOB_ID}`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(res.status, 204);
  assert.strictEqual(aiCache.get('consolidated_prompt'), null, 'A remoção do job deve invalidar o catálogo em cache');

  // Verificar se removeu do banco
  const { rows } = await pool.query('SELECT * FROM "JobsIA_types" WHERE id = $1', [TEST_JOB_ID]);
  assert.strictEqual(rows.length, 0);
});
