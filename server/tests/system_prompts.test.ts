import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';

let adminToken: string;
let solicitanteToken: string;
let adminId: string;
let solicitanteId: string;

test.before(async () => {
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [
    'prompt_admin@dataprev.gov.br',
    'prompt_solicitante@dataprev.gov.br'
  ]);

  const adminRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['prompt_admin@dataprev.gov.br', 'dummy', 'Prompt Admin Test', 'ADMIN']
  );
  adminId = adminRes.rows[0].id;
  adminToken = jwt.sign({ sub: adminId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  const solRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['prompt_solicitante@dataprev.gov.br', 'dummy', 'Prompt Solicitante Test', 'SOLICITANTE']
  );
  solicitanteId = solRes.rows[0].id;
  solicitanteToken = jwt.sign({ sub: solicitanteId }, process.env.JWT_SECRET!, { expiresIn: '1h' });
});

test.after(async () => {
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [
    'prompt_admin@dataprev.gov.br',
    'prompt_solicitante@dataprev.gov.br'
  ]);
});

test('GET /api/system-prompts/active - Deve retornar o prompt ativo atual', async () => {
  const res = await request(app)
    .get('/api/system-prompts/active')
    .set('Authorization', `Bearer ${solicitanteToken}`);

  assert.strictEqual(res.status, 200);
  assert.ok('content' in res.body);
});

test('POST /api/system-prompts - Deve recusar atualização por usuário SOLICITANTE', async () => {
  const res = await request(app)
    .post('/api/system-prompts')
    .set('Authorization', `Bearer ${solicitanteToken}`)
    .send({ content: 'Prompt de teste invasivo' });

  assert.strictEqual(res.status, 403);
});

test('POST /api/system-prompts - Deve salvar novo prompt como ADMIN e torná-lo ativo', async () => {
  const testPromptContent = 'Você é um assistente especialista de testes unitários do JobsIA.';
  
  const postRes = await request(app)
    .post('/api/system-prompts')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ content: testPromptContent });

  assert.strictEqual(postRes.status, 201);
  assert.strictEqual(postRes.body.message, 'Prompt salvo');

  // Verificar se o GET/active retorna este novo prompt
  const getRes = await request(app)
    .get('/api/system-prompts/active')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.body.content, testPromptContent);
});
