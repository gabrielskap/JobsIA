import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';

let userToken: string;
let userId: string;
let otherUserToken: string;
let otherUserId: string;

test.before(async () => {
  // Limpar dados anteriores de teste
  await pool.query('DELETE FROM "JobsIA_messages"');
  await pool.query('DELETE FROM "JobsIA_conversations"');
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [
    'test_chat_user@dataprev.gov.br',
    'test_chat_other@dataprev.gov.br'
  ]);

  // Criar usuários
  const res1 = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['test_chat_user@dataprev.gov.br', 'dummy', 'Chat User', 'SOLICITANTE']
  );
  userId = res1.rows[0].id;
  userToken = jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  const res2 = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['test_chat_other@dataprev.gov.br', 'dummy', 'Other User', 'SOLICITANTE']
  );
  otherUserId = res2.rows[0].id;
  otherUserToken = jwt.sign({ sub: otherUserId }, process.env.JWT_SECRET!, { expiresIn: '1h' });
});

test('Fluxo de conversas e mensagens do chat', async (t) => {
  let conversationId: string;

  await t.test('Deve criar uma nova conversa via POST /api/ai/conversations', async () => {
    const res = await request(app)
      .post('/api/ai/conversations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ flow_type: 'transhost' });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.id);
    assert.strictEqual(res.body.flow_type, 'transhost');
    assert.strictEqual(res.body.user_id, userId);
    conversationId = res.body.id;
  });

  await t.test('Deve listar as conversas do usuário logado via GET /api/ai/conversations', async () => {
    const res = await request(app)
      .get('/api/ai/conversations')
      .set('Authorization', `Bearer ${userToken}`);

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, conversationId);
  });

  await t.test('Não deve listar conversas de outros usuários', async () => {
    const res = await request(app)
      .get('/api/ai/conversations')
      .set('Authorization', `Bearer ${otherUserToken}`);

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 0);
  });

  await t.test('Deve permitir enviar uma mensagem via /chat e persistir na conversa', async () => {
    // Vamos simular a chamada para /chat enviando a última mensagem de usuário
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        conversation_id: conversationId,
        messages: [{ role: 'user', content: 'Olá, IA!' }]
      });

    // Como chamamos a LIA API real, dependemos da configuração ou podemos esperar 200/500 dependendo da config.
    // Mas a mensagem do usuário já deve ter sido persistida de qualquer forma.
    // Vamos verificar se a mensagem do usuário foi criada.
    const { rows: msgs } = await pool.query(
      `SELECT * FROM "JobsIA_messages" WHERE conversation_id = $1`,
      [conversationId]
    );
    assert.ok(msgs.length > 0);
    assert.strictEqual(msgs[0].role, 'user');
    assert.strictEqual(msgs[0].text, 'Olá, IA!');
  });

  await t.test('Deve recuperar as mensagens da conversa pelo ID correto', async () => {
    const res = await request(app)
      .get(`/api/ai/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${userToken}`);

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
    assert.strictEqual(res.body[0].text, 'Olá, IA!');
  });

  await t.test('Não deve permitir que outro usuário veja as mensagens da conversa alheia', async () => {
    const res = await request(app)
      .get(`/api/ai/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${otherUserToken}`);

    assert.strictEqual(res.status, 403);
  });
});
