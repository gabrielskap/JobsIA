import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { app } from '../app';
import { pool } from '../db';

interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  token?: string;
  refreshToken?: string;
}

let adminUser: TestUser;
let activeUser: TestUser;
let inactiveUser: TestUser;

test.before(async () => {
  // Limpar dados de teste anteriores
  await pool.query(
    `DELETE FROM users WHERE email IN ($1, $2, $3, $4)`,
    [
      'admin-auth-test@jobsia.com',
      'active-auth-test@jobsia.com',
      'inactive-auth-test@jobsia.com',
      'transact-auth-test@jobsia.com'
    ]
  );

  const passwordHash = await bcrypt.hash('password123', 12);

  // 1. Criar admin para gerenciar outros usuários
  const adminRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id, email, name, role`,
    ['admin-auth-test@jobsia.com', passwordHash, 'Admin Auth', 'ADMIN']
  );
  adminUser = adminRes.rows[0];
  await pool.query(
    `INSERT INTO "JobsIA_profiles" (user_id, name, email, is_active)
     VALUES ($1, $2, $3, true)`,
    [adminUser.id, adminUser.name, adminUser.email]
  );
  adminUser.token = jwt.sign({ sub: adminUser.id }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  // 2. Criar usuário ativo normal
  const activeRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id, email, name, role`,
    ['active-auth-test@jobsia.com', passwordHash, 'Active Auth', 'SOLICITANTE']
  );
  activeUser = activeRes.rows[0];
  await pool.query(
    `INSERT INTO "JobsIA_profiles" (user_id, name, email, is_active)
     VALUES ($1, $2, $3, true)`,
    [activeUser.id, activeUser.name, activeUser.email]
  );

  // 3. Criar usuário inativo
  const inactiveRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id, email, name, role`,
    ['inactive-auth-test@jobsia.com', passwordHash, 'Inactive Auth', 'SOLICITANTE']
  );
  inactiveUser = inactiveRes.rows[0];
  await pool.query(
    `INSERT INTO "JobsIA_profiles" (user_id, name, email, is_active)
     VALUES ($1, $2, $3, false)`,
    [inactiveUser.id, inactiveUser.name, inactiveUser.email]
  );
});

test.after(async () => {
  // Limpeza de auditorias e usuários
  await pool.query(
    `DELETE FROM "JobsIA_audit_logs" WHERE user_id IN ($1, $2, $3)`,
    [adminUser.id, activeUser.id, inactiveUser.id]
  );

  await pool.query(
    `DELETE FROM users WHERE email IN ($1, $2, $3, $4)`,
    [
      'admin-auth-test@jobsia.com',
      'active-auth-test@jobsia.com',
      'inactive-auth-test@jobsia.com',
      'transact-auth-test@jobsia.com'
    ]
  );
  
  await pool.end();
});

// ===========================================================================
// TESTES DE LOGIN E AUTENTICAÇÃO
// ===========================================================================

test('POST /api/auth/login - Sucesso e dados completos', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'active-auth-test@jobsia.com', password: 'password123' })
    .expect(200);

  assert.ok(res.body.token);
  assert.ok(res.body.refreshToken);
  assert.equal(res.body.user.email, 'active-auth-test@jobsia.com');
  assert.equal(res.body.profile.email, 'active-auth-test@jobsia.com');
  assert.equal(res.body.profile.is_active, true);
  
  // Guardar token para testes subsequentes
  activeUser.token = res.body.token;
  activeUser.refreshToken = res.body.refreshToken;
});

test('POST /api/auth/login - Usuário inativo deve falhar', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'inactive-auth-test@jobsia.com', password: 'password123' })
    .expect(401);

  assert.equal(res.body.message, 'Usuário inativo');
});

test('GET /api/auth/me - Perfil com token válido', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${activeUser.token}`)
    .expect(200);

  assert.equal(res.body.user.email, 'active-auth-test@jobsia.com');
  assert.equal(res.body.profile.email, 'active-auth-test@jobsia.com');
});

test('GET /api/auth/me - Token inválido deve retornar 401', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer token-totalmente-invalido-123`)
    .expect(401);

  assert.equal(res.body.message, 'Token inválido');
});

// ===========================================================================
// TESTES DE REFRESH E REVOGAÇÃO
// ===========================================================================

test('POST /api/auth/refresh e POST /api/auth/logout - Fluxo completo de tokens', async () => {
  // 1. Refresh do token
  const refreshRes = await request(app)
    .post('/api/auth/refresh')
    .send({ refreshToken: activeUser.refreshToken })
    .expect(200);

  assert.ok(refreshRes.body.token);
  assert.ok(refreshRes.body.refreshToken);
  assert.notEqual(refreshRes.body.token, activeUser.token);
  assert.notEqual(refreshRes.body.refreshToken, activeUser.refreshToken);

  const newAccessToken = refreshRes.body.token;
  const newRefreshToken = refreshRes.body.refreshToken;

  // 2. Tentar usar o refresh token antigo (deve falhar, pois foi excluído)
  await request(app)
    .post('/api/auth/refresh')
    .send({ refreshToken: activeUser.refreshToken })
    .expect(401);

  // 3. Validar acesso com o novo access token
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${newAccessToken}`)
    .expect(200);

  // 4. Efetuar logout usando o novo refresh token
  await request(app)
    .post('/api/auth/logout')
    .send({ refreshToken: newRefreshToken })
    .expect(200);

  // 5. Tentar dar refresh novamente (deve falhar pós logout)
  await request(app)
    .post('/api/auth/refresh')
    .send({ refreshToken: newRefreshToken })
    .expect(401);
});

// ===========================================================================
// TESTES DE CRIAÇÃO TRANSACIONAL (POST /api/users)
// ===========================================================================

test('POST /api/users - Criação transacional e rollback sob erro', async () => {
  // Para testar o rollback transacional em users.ts, tentamos criar um usuário com e-mail duplicado de profile ou violar alguma constraint
  // O endpoint POST /api/users insere na tabela users e depois em "JobsIA_profiles".
  // Vamos enviar um payload para criar um novo usuário 'transact-auth-test@jobsia.com',
  // porém faremos uma inserção manual prévia de um profile com o mesmo e-mail associado a outro user para forçar UNIQUE violation no e-mail do profile.
  // Como o e-mail do profile tem constraint UNIQUE, a inserção do profile na transação vai falhar.
  // Isso testará se o rollback remove o usuário inserido na primeira query da transação.

  const tempUserRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['temp-unique-check@jobsia.com', 'hash', 'Temp User', 'SOLICITANTE']
  );
  
  // Inserir profile com o e-mail 'transact-auth-test@jobsia.com'
  await pool.query(
    `INSERT INTO "JobsIA_profiles" (user_id, name, email, is_active)
     VALUES ($1, $2, $3, true)`,
    [tempUserRes.rows[0].id, 'Conflito', 'transact-auth-test@jobsia.com']
  );

  // Agora chamamos o POST /api/users tentando criar o usuário 'transact-auth-test@jobsia.com'
  // Deve dar erro 500 ou 409 devido ao conflito/erro interno, mas a chave é verificar se o usuário no final NÃO existe na tabela users.
  await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminUser.token}`)
    .send({
      name: 'Transact Auth Test',
      email: 'transact-auth-test@jobsia.com',
      password: 'password123',
      role: 'SOLICITANTE',
      is_active: true
    });

  // Verificar se o usuário foi criado na tabela users
  const userCheck = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    ['transact-auth-test@jobsia.com']
  );

  // Deve ter sido desfeito pelo ROLLBACK, ou seja, zero linhas
  assert.equal(userCheck.rows.length, 0, 'O usuário transact-auth-test@jobsia.com deveria ter sofrido rollback.');

  // Limpeza local
  await pool.query('DELETE FROM users WHERE id = $1', [tempUserRes.rows[0].id]);
});
