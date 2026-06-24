import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';

let adminToken: string;
let solicitanteToken: string;
let otherSolicitanteToken: string;

let adminId: string;
let solicitanteId: string;
let otherSolicitanteId: string;

let checklistId: string;
let conversationId: string;

test.before(async () => {
  // Limpar tabelas associadas a interações e feedbacks
  await pool.query('DELETE FROM "JobsIA_user_feedback"');
  await pool.query('DELETE FROM "JobsIA_interaction_classifications"');
  await pool.query('DELETE FROM "JobsIA_checklists"');
  await pool.query('DELETE FROM "JobsIA_messages"');
  await pool.query('DELETE FROM "JobsIA_conversations"');
  await pool.query('DELETE FROM users WHERE email IN ($1, $2, $3)', [
    'admin_test@dataprev.gov.br',
    'sol_test@dataprev.gov.br',
    'other_sol_test@dataprev.gov.br'
  ]);

  // Criar usuários de teste com diferentes papéis
  const adminRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['admin_test@dataprev.gov.br', 'dummy', 'Admin Test', 'ADMIN']
  );
  adminId = adminRes.rows[0].id;
  adminToken = jwt.sign({ sub: adminId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  const solRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['sol_test@dataprev.gov.br', 'dummy', 'Solicitante Test', 'SOLICITANTE']
  );
  solicitanteId = solRes.rows[0].id;
  solicitanteToken = jwt.sign({ sub: solicitanteId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  const otherSolRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['other_sol_test@dataprev.gov.br', 'dummy', 'Other Sol Test', 'SOLICITANTE']
  );
  otherSolicitanteId = otherSolRes.rows[0].id;
  otherSolicitanteToken = jwt.sign({ sub: otherSolicitanteId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  // Criar conversa e checklist vinculados ao solicitanteId
  const convRes = await pool.query(
    `INSERT INTO "JobsIA_conversations" (flow_type, user_id)
     VALUES ($1, $2) RETURNING id`,
    ['transhost', solicitanteId]
  );
  conversationId = convRes.rows[0].id;

  const chkRes = await pool.query(
    `INSERT INTO "JobsIA_checklists" (conversation_id, type, user_id, status)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [conversationId, 'transhost', solicitanteId, 'Concluído']
  );
  checklistId = chkRes.rows[0].id;
});

test('Auditoria - ADMIN/OPERADOR pode acessar aggregations', async () => {
  const res = await request(app)
    .get('/api/interactions/aggregations')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.ruleFailures !== undefined);
  assert.ok(res.body.recurrentTopics !== undefined);
  assert.ok(res.body.commonCorrections !== undefined);
  assert.ok(res.body.feedback !== undefined);
  assert.ok(res.body.auditHistory !== undefined);
});

test('Auditoria - SOLICITANTE é impedido de acessar aggregations', async () => {
  const res = await request(app)
    .get('/api/interactions/aggregations')
    .set('Authorization', `Bearer ${solicitanteToken}`);

  assert.strictEqual(res.status, 403);
});

test('Feedback - Proprietário (SOLICITANTE) pode registrar feedback', async () => {
  const res = await request(app)
    .post('/api/interactions/feedback')
    .set('Authorization', `Bearer ${solicitanteToken}`)
    .send({
      checklist_id: checklistId,
      rating: 4,
      comentario: 'Bom atendimento da LIA.',
      correcao_operador: 'ajuste_ambiente'
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.rating, 4);
  assert.strictEqual(res.body.correcao_operador, 'ajuste_ambiente');
});

test('Feedback - Não proprietário é bloqueado no feedback', async () => {
  const res = await request(app)
    .post('/api/interactions/feedback')
    .set('Authorization', `Bearer ${otherSolicitanteToken}`)
    .send({
      checklist_id: checklistId,
      rating: 5,
      comentario: 'Tentar invadir.'
    });

  assert.strictEqual(res.status, 403);
});
