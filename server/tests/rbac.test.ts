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
  token: string;
  is_active: boolean;
}

let adminUser: TestUser;
let operadorUser: TestUser;
let solicitante1: TestUser;
let solicitante2: TestUser;
let inativoUser: TestUser;

async function createTestUser(name: string, email: string, role: string, isActive = true): Promise<TestUser> {
  const passwordHash = await bcrypt.hash('password123', 12);
  
  // Inserir usuário
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role`,
    [email.toLowerCase(), passwordHash, name, role]
  );
  const user = userRes.rows[0];

  // Inserir profile correspondente
  await pool.query(
    `INSERT INTO "JobsIA_profiles" (user_id, name, email, is_active)
     VALUES ($1, $2, $3, $4)`,
    [user.id, user.name, user.email, isActive]
  );

  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    token,
    is_active: isActive
  };
}

// ===========================================================================
// SETUP & TEARDOWN GLOBAL
// ===========================================================================

test.before(async () => {
  // Limpar usuários de teste anteriores caso existam
  await pool.query(
    `DELETE FROM users WHERE email IN ($1, $2, $3, $4, $5, $6)`,
    [
      'admin-test@jobsia.com',
      'operador-test@jobsia.com',
      'solicitante1-test@jobsia.com',
      'solicitante2-test@jobsia.com',
      'inativo-test@jobsia.com',
      'novo.solicitante@jobsia.com'
    ]
  );

  // Criar massa de dados
  adminUser = await createTestUser('Admin Test', 'admin-test@jobsia.com', 'ADMIN');
  operadorUser = await createTestUser('Operador Test', 'operador-test@jobsia.com', 'OPERADOR');
  solicitante1 = await createTestUser('Solicitante 1', 'solicitante1-test@jobsia.com', 'SOLICITANTE');
  solicitante2 = await createTestUser('Solicitante 2', 'solicitante2-test@jobsia.com', 'SOLICITANTE');
  inativoUser = await createTestUser('Inativo Test', 'inativo-test@jobsia.com', 'SOLICITANTE', false);
});

test.after(async () => {
  // Limpar os logs de auditoria dos usuários de teste
  await pool.query(
    `DELETE FROM "JobsIA_audit_logs" WHERE user_id IN ($1, $2, $3, $4, $5)`,
    [adminUser.id, operadorUser.id, solicitante1.id, solicitante2.id, inativoUser.id]
  );

  // Limpar usuários e profiles criados nos testes (ON DELETE CASCADE cuidará do resto)
  await pool.query(
    `DELETE FROM users WHERE email IN ($1, $2, $3, $4, $5, $6)`,
    [
      'admin-test@jobsia.com',
      'operador-test@jobsia.com',
      'solicitante1-test@jobsia.com',
      'solicitante2-test@jobsia.com',
      'inativo-test@jobsia.com',
      'novo.solicitante@jobsia.com'
    ]
  );

  // Fechar pool de conexão
  await pool.end();
});

// ===========================================================================
// 1. TESTES DE AUTENTICAÇÃO (401)
// ===========================================================================

test('Autenticação - Deve rejeitar requisição sem token na rota de checklists', async () => {
  const res = await request(app).get('/api/checklists');
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, 'Token ausente');
});

test('Autenticação - Deve rejeitar requisição com token inválido na rota de checklists', async () => {
  const res = await request(app)
    .get('/api/checklists')
    .set('Authorization', 'Bearer token_invalido_de_teste');
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, 'Token inválido');
});

test('Autenticação - Deve rejeitar requisição com token de usuário inativo', async () => {
  const res = await request(app)
    .get('/api/checklists')
    .set('Authorization', `Bearer ${inativoUser.token}`);
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, 'Usuário inativo');
});

test('Autenticação - Deve impedir login de usuário inativo na rota de login', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: inativoUser.email, password: 'password123' });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, 'Usuário inativo');
});

// ===========================================================================
// 2. TESTES DE AUTORIZAÇÃO POR PAPEL (403)
// ===========================================================================

test('Autorização - Deve impedir SOLICITANTE de criar normas', async () => {
  const res = await request(app)
    .post('/api/norms')
    .set('Authorization', `Bearer ${solicitante1.token}`)
    .send({ environment: 'Desenv', rule: 'Norma proibida' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.message, 'Acesso negado');
});

test('Autorização - Deve impedir OPERADOR de criar normas', async () => {
  const res = await request(app)
    .post('/api/norms')
    .set('Authorization', `Bearer ${operadorUser.token}`)
    .send({ environment: 'Desenv', rule: 'Norma proibida' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.message, 'Acesso negado');
});

test('Autorização - Deve impedir SOLICITANTE de visualizar usuários do sistema', async () => {
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${solicitante1.token}`);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.message, 'Acesso negado');
});

test('Autorização - Deve impedir OPERADOR de visualizar usuários do sistema', async () => {
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${operadorUser.token}`);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.message, 'Acesso negado');
});

test('Autorização - Deve permitir signup público e criar usuário SOLICITANTE', async () => {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Novo Solicitante', email: 'novo.solicitante@jobsia.com', password: 'password123' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.message, 'Conta criada com sucesso');
  assert.ok(res.body.user);
  assert.strictEqual(res.body.user.email, 'novo.solicitante@jobsia.com');
  assert.strictEqual(res.body.user.role, 'SOLICITANTE');
});

// ===========================================================================
// 3. PERMISSÕES DE ADMIN E OPERADOR (SUCESSO)
// ===========================================================================

test('Permissões - Deve permitir ADMIN de listar usuários', async () => {
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${adminUser.token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('Permissões - Deve permitir ADMIN de cadastrar novas normas', async () => {
  const res = await request(app)
    .post('/api/norms')
    .set('Authorization', `Bearer ${adminUser.token}`)
    .send({ environment: 'Homolog', rule: 'ADMIN_RULE_001' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.rule, 'ADMIN_RULE_001');

  // Limpar a norma criada
  await pool.query('DELETE FROM "JobsIA_validation_rules" WHERE id = $1', [res.body.id]);
});

test('Permissões - Deve permitir OPERADOR de ler normas (base de conhecimento)', async () => {
  const res = await request(app)
    .get('/api/norms')
    .set('Authorization', `Bearer ${operadorUser.token}`);
  assert.strictEqual(res.status, 200);
});

test('Permissões - Deve permitir SOLICITANTE de ler normas (base de conhecimento)', async () => {
  const res = await request(app)
    .get('/api/norms')
    .set('Authorization', `Bearer ${solicitante1.token}`);
  assert.strictEqual(res.status, 200);
});

// ===========================================================================
// 4. ISOLAMENTO DE DADOS (CHECKLISTS E JWT)
// ===========================================================================

test('Isolamento - Checklists e isolamento por papel', async (t) => {
  let checklistS1Id: string;

  // Inserir checklists no banco diretamente
  const res1 = await pool.query(
    `INSERT INTO "JobsIA_checklists" (type, data, status, user_id, user_name)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    ['java', '{}', 'Concluído', solicitante1.id, solicitante1.name]
  );
  checklistS1Id = res1.rows[0].id;

  const res2 = await pool.query(
    `INSERT INTO "JobsIA_checklists" (type, data, status, user_id, user_name)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    ['swadm', '{}', 'Concluído', solicitante2.id, solicitante2.name]
  );

  await t.test('SOLICITANTE deve ver apenas seus próprios checklists', async () => {
    const res = await request(app)
      .get('/api/checklists')
      .set('Authorization', `Bearer ${solicitante1.token}`);
    
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    
    // Deve ter apenas o checklist do solicitante 1
    const ids = res.body.map((c: any) => c.id);
    assert.ok(ids.includes(checklistS1Id));
    assert.ok(res.body.every((c: any) => c.user_id === solicitante1.id));
  });

  await t.test('SOLICITANTE deve ter tentativas de filtrar checklist de terceiros ignoradas/rejeitadas', async () => {
    const res = await request(app)
      .get(`/api/checklists?userId=${solicitante2.id}`)
      .set('Authorization', `Bearer ${solicitante1.token}`);
    
    assert.strictEqual(res.status, 200);
    
    // O filtro por query param deve ter sido ignorado, retornando apenas os dele
    assert.ok(res.body.every((c: any) => c.user_id === solicitante1.id));
  });

  await t.test('OPERADOR deve conseguir ver todos os checklists ou filtrar por usuário', async () => {
    const res = await request(app)
      .get('/api/checklists')
      .set('Authorization', `Bearer ${operadorUser.token}`);
    
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length >= 2);

    // Filtrando pelo solicitante 2
    const resFiltered = await request(app)
      .get(`/api/checklists?userId=${solicitante2.id}`)
      .set('Authorization', `Bearer ${operadorUser.token}`);
    
    assert.strictEqual(resFiltered.status, 200);
    assert.ok(resFiltered.body.every((c: any) => c.user_id === solicitante2.id));
  });

  await t.test('POST /checklists deve derivar user_id do JWT e ignorar payload do cliente', async () => {
    const res = await request(app)
      .post('/api/checklists')
      .set('Authorization', `Bearer ${solicitante1.token}`)
      .send({
        type: 'transhost',
        data: { test: true },
        status: 'Concluído',
        user_id: solicitante2.id // Tentativa de burlar enviando ID de outro solicitante
      });
    
    assert.strictEqual(res.status, 201);
    // O user_id retornado e salvo deve ser o do solicitante1 (logado no JWT)
    assert.strictEqual(res.body.user_id, solicitante1.id);
    assert.strictEqual(res.body.user_name, solicitante1.name);
  });

  // Limpar checklists criados nos testes
  await pool.query(
    `DELETE FROM "JobsIA_checklists" WHERE user_id IN ($1, $2)`,
    [solicitante1.id, solicitante2.id]
  );
});

// ===========================================================================
// 5. AUDITORIA DE AÇÕES ADMINISTRATIVAS
// ===========================================================================

test('Auditoria - Deve salvar registros de auditoria no banco ao criar/alterar configurações globais', async () => {
  // 1. Fazer ação administrativa
  const resNorm = await request(app)
    .post('/api/norms')
    .set('Authorization', `Bearer ${adminUser.token}`)
    .send({ environment: 'Prod', rule: 'AUDIT_RULE_999' });
  
  assert.strictEqual(resNorm.status, 201);
  const createdNormId = resNorm.body.id;

  // 2. Verificar se log correspondente foi salvo na tabela JobsIA_audit_logs
  const auditRes = await pool.query(
    `SELECT * FROM "JobsIA_audit_logs" WHERE user_id = $1 AND action = $2 ORDER BY created_at DESC LIMIT 1`,
    [adminUser.id, 'CREATE_NORM']
  );

  assert.strictEqual(auditRes.rows.length, 1);
  assert.strictEqual(auditRes.rows[0].details.id, createdNormId);
  assert.strictEqual(auditRes.rows[0].details.rule, 'AUDIT_RULE_999');

  // Limpar
  await pool.query('DELETE FROM "JobsIA_validation_rules" WHERE id = $1', [createdNormId]);
});
