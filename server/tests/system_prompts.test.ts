import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';
import { aiCache } from '../routes/ai';

let adminToken: string;
let solicitanteToken: string;
let adminId: string;
let solicitanteId: string;
let activePromptIdsBeforeTest: string[] = [];
let createdPromptId: string | undefined;
const testPromptContent = `Diretriz administrativa de teste (${randomUUID()}).`;

test.before(async () => {
  // O endpoint de teste troca o prompt ativo. Guardar o estado original evita
  // que uma suíte deixe uma diretriz de teste ativa no banco compartilhado.
  const { rows: activePrompts } = await pool.query<{ id: string }>(
    'SELECT id FROM "JobsIA_system_prompts" WHERE is_active = true'
  );
  activePromptIdsBeforeTest = activePrompts.map((prompt) => prompt.id);

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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (createdPromptId) {
      await client.query('DELETE FROM "JobsIA_system_prompts" WHERE id = $1', [createdPromptId]);
    }
    if (activePromptIdsBeforeTest.length > 0) {
      await client.query(
        'UPDATE "JobsIA_system_prompts" SET is_active = true WHERE id = ANY($1::uuid[])',
        [activePromptIdsBeforeTest]
      );
    }
    await client.query('COMMIT');
    aiCache.clear();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

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
  aiCache.set('consolidated_prompt', { prompt: 'contexto obsoleto' });

  const postRes = await request(app)
    .post('/api/system-prompts')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ content: testPromptContent });

  assert.strictEqual(postRes.status, 201);
  assert.strictEqual(postRes.body.message, 'Prompt salvo');
  assert.strictEqual(aiCache.get('consolidated_prompt'), null, 'A troca de prompt deve invalidar o contexto em cache');

  const { rows: savedPrompts } = await pool.query<{ id: string }>(
    `SELECT id FROM "JobsIA_system_prompts"
     WHERE content = $1 AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [testPromptContent]
  );
  createdPromptId = savedPrompts[0]?.id;
  assert.ok(createdPromptId, 'O prompt de teste deve ter sido persistido como ativo');

  // Verificar se o GET/active retorna este novo prompt
  const getRes = await request(app)
    .get('/api/system-prompts/active')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.body.content, testPromptContent);

  // O prompt administrativo é uma sobreposição: a política e o catálogo
  // corporativos continuam presentes no contexto consolidado.
  const contextRes = await request(app)
    .get('/api/ai/context')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(contextRes.status, 200);
  assert.ok(contextRes.body.prompt.includes('POLÍTICA OPERACIONAL IMUTÁVEL'));
  assert.ok(contextRes.body.prompt.includes('CATÁLOGO OPERACIONAL DE JOBS'));
  assert.ok(contextRes.body.prompt.includes(testPromptContent));
});
