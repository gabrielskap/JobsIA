import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';

let adminUserId: string;
let adminToken: string;
let operatorUserId: string;
let operatorToken: string;

test.before(async () => {
  // Limpar tabelas
  await pool.query('DELETE FROM "JobsIA_agent_executions"');
  await pool.query('DELETE FROM "JobsIA_validation_rules" WHERE texto_orientacao = $1', ['Regra de teste de integração para IA']);
  await pool.query('DELETE FROM "JobsIA_dictionary_terms" WHERE term = $1', ['TermoIntegracao']);
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', ['admin_integration@dataprev.gov.br', 'operator_integration@dataprev.gov.br']);

  // Criar ADMIN
  const resAdmin = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['admin_integration@dataprev.gov.br', 'dummy_hash', 'Admin Integrador', 'ADMIN']
  );
  adminUserId = resAdmin.rows[0].id;
  adminToken = jwt.sign({ sub: adminUserId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  // Criar OPERADOR
  const resOperator = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['operator_integration@dataprev.gov.br', 'dummy_hash', 'Operador Integrador', 'OPERADOR']
  );
  operatorUserId = resOperator.rows[0].id;
  operatorToken = jwt.sign({ sub: operatorUserId }, process.env.JWT_SECRET!, { expiresIn: '1h' });
});

test.after(async () => {
  await pool.query('DELETE FROM "JobsIA_agent_executions"');
  await pool.query('DELETE FROM "JobsIA_validation_rules" WHERE texto_orientacao = $1', ['Regra de teste de integração para IA']);
  await pool.query('DELETE FROM "JobsIA_dictionary_terms" WHERE term = $1', ['TermoIntegracao']);
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', ['admin_integration@dataprev.gov.br', 'operator_integration@dataprev.gov.br']);
});

test('Fluxo de Publicação e Integração com Prompt do Agente', async () => {
  // 1. Criar Norma como RASCUNHO (ADMIN)
  const normRes = await request(app)
    .post('/api/norms')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ environment: 'Geral', rule: 'Regra de teste de integração para IA' });
  
  assert.strictEqual(normRes.status, 201);
  assert.strictEqual(normRes.body.status, 'RASCUNHO');
  const normId = normRes.body.id;

  // 2. Tentar publicar diretamente pelo OPERADOR deve dar 403
  const opPubRes = await request(app)
    .post(`/api/norms/${normId}/publish`)
    .set('Authorization', `Bearer ${operatorToken}`);
  assert.strictEqual(opPubRes.status, 403);

  // 3. Aprovar Norma (ADMIN)
  const appRes = await request(app)
    .post(`/api/norms/${normId}/approve`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(appRes.status, 200);
  assert.strictEqual(appRes.body.status, 'APROVADO');

  // 4. Publicar Norma (ADMIN)
  const pubRes = await request(app)
    .post(`/api/norms/${normId}/publish`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(pubRes.status, 200);
  assert.strictEqual(pubRes.body.status, 'PUBLICADO');

  // 5. Consultar Contexto Consolidado da IA e verificar se a nova regra está contida
  const contextRes = await request(app)
    .get('/api/ai/context')
    .set('Authorization', `Bearer ${adminToken}`);
  
  assert.strictEqual(contextRes.status, 200);
  assert.ok(contextRes.body.prompt.includes('Regra de teste de integração para IA'));

  // 6. Chamar o endpoint /api/ai/chat e comprovar o registro de log
  const chatRes = await request(app)
    .post('/api/ai/chat')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      messages: [{ role: 'user', content: 'Olá, quais são as regras de nomenclatura?' }]
    });

  assert.strictEqual(chatRes.status, 200);

  // Verificar se gravou no JobsIA_agent_executions
  const { rows: execs } = await pool.query('SELECT * FROM "JobsIA_agent_executions" ORDER BY created_at DESC LIMIT 1');
  assert.strictEqual(execs.length, 1);
  assert.ok(execs[0].norms_version.includes(normId));
});
