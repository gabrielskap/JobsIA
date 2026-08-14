import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';

type TestUser = {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERADOR' | 'SOLICITANTE';
  is_active: boolean;
};

const admin: TestUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin.unit@dataprev.gov.br',
  name: 'Admin Unitário',
  role: 'ADMIN',
  is_active: true,
};

const requester: TestUser = {
  id: '00000000-0000-4000-8000-000000000002',
  email: 'requester.unit@dataprev.gov.br',
  name: 'Solicitante Unitário',
  role: 'SOLICITANTE',
  is_active: true,
};

function tokenFor(user: TestUser): string {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: '5m' });
}

const originalQuery = pool.query.bind(pool);
const originalConnect = pool.connect.bind(pool);

function mockAuthAndQueries(
  user: TestUser,
  handler?: (sql: string, params: unknown[] | undefined) => Promise<{ rows: any[] }>,
) {
  (pool as any).query = async (query: unknown, params?: unknown[]) => {
    const sql = String(query);
    if (sql.includes('FROM users u')) return { rows: [user] };
    if (handler) return handler(sql, params);
    throw new Error(`Consulta inesperada no teste unitário: ${sql}`);
  };
}

test.afterEach(() => {
  (pool as any).query = originalQuery;
  (pool as any).connect = originalConnect;
});

test('Application v2 exige autenticação antes de validar o payload', async () => {
  const response = await request(app).post('/api/checklists/application').send({});
  assert.equal(response.status, 401);
  assert.equal(response.body.message, 'Token ausente');
});

test('Application v2 retorna 422 para payload autenticado inválido sem consultar domínio', async () => {
  mockAuthAndQueries(requester);
  const response = await request(app)
    .post('/api/checklists/application')
    .set('Authorization', `Bearer ${tokenFor(requester)}`)
    .send({ schema_version: 2, jobs: [] });

  assert.equal(response.status, 422);
  assert.equal(response.body.status, 'Falha Validação');
  assert.ok(Array.isArray(response.body.errors));
});

test('Application v2 respeita idempotência antes de reprocessar o checklist', async () => {
  const existing = { id: 'existing-checklist', request_id: 'application-unit-idempotent', user_id: requester.id };
  mockAuthAndQueries(requester, async (sql) => {
    if (sql.includes('FROM "JobsIA_checklists" WHERE request_id')) return { rows: [existing] };
    throw new Error(`Consulta inesperada após idempotência: ${sql}`);
  });

  const response = await request(app)
    .post('/api/checklists/application')
    .set('Authorization', `Bearer ${tokenFor(requester)}`)
    .send({
      request_id: 'application-unit-idempotent',
      schema_version: 2,
      application: {
        name: 'DIT.TRH.DIARIO',
        responsible_name: 'Responsável Operacional',
        server_mode: 'shared',
        shared_server: 'UXRJO001',
      },
      jobs: [{
        sequence: 1,
        job_type_id: 3,
        generic: 'GEN-UNIT',
        bridge: 'BRIDGE-UNIT',
        parameters: {},
        capador: { applicable: false },
      }],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.id, existing.id);
});

test('Catálogo rejeita filtro kind inválido antes de consultar o banco', async () => {
  mockAuthAndQueries(requester);
  const response = await request(app)
    .get('/api/checklist-catalog?kind=INVALID')
    .set('Authorization', `Bearer ${tokenFor(requester)}`);

  assert.equal(response.status, 400);
  assert.match(response.body.message, /GENERIC ou BRIDGE/);
});

test('Importação de catálogo exige ao menos um item', async () => {
  mockAuthAndQueries(admin);
  const response = await request(app)
    .post('/api/checklist-catalog/import')
    .set('Authorization', `Bearer ${tokenFor(admin)}`)
    .send({ items: [] });

  assert.equal(response.status, 400);
});

test('Importação de regras de Application rejeita regex inválida e código duplicado', async () => {
  mockAuthAndQueries(admin);
  const response = await request(app)
    .post('/api/checklist-catalog/application-rules/import')
    .set('Authorization', `Bearer ${tokenFor(admin)}`)
    .send({ items: [
      { code: 'APP-UNIT', validation_regex: '[', message: 'Inválida' },
      { code: 'APP-UNIT', validation_regex: '^OK$', message: 'Duplicada' },
    ] });

  assert.equal(response.status, 400);
  assert.ok(response.body.errors.some((error: string) => error.includes('inválida')));
  assert.ok(response.body.errors.some((error: string) => error.includes('mais de uma vez')));
});

test('Dicionário bloqueia criação por SOLICITANTE', async () => {
  mockAuthAndQueries(requester);
  const response = await request(app)
    .post('/api/dictionary')
    .set('Authorization', `Bearer ${tokenFor(requester)}`)
    .send({ term: 'Job', definition: 'Definição', category: 'Operação' });

  assert.equal(response.status, 403);
});

test('Dicionário valida campos obrigatórios antes de persistir', async () => {
  mockAuthAndQueries(admin);
  const response = await request(app)
    .post('/api/dictionary')
    .set('Authorization', `Bearer ${tokenFor(admin)}`)
    .send({ term: '   ', definition: 'Definição' });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /obrigatórios/);
});

test('Dicionário rejeita atualização vazia antes de consultar o termo', async () => {
  mockAuthAndQueries(admin);
  const response = await request(app)
    .put('/api/dictionary/00000000-0000-4000-8000-000000000097')
    .set('Authorization', `Bearer ${tokenFor(admin)}`)
    .send({ definition: '   ' });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /campo válido/);
});

test('Publicação inexistente encerra a transação antes de liberar a conexão', async () => {
  const calls: string[] = [];
  mockAuthAndQueries(admin);
  (pool as any).connect = async () => ({
    query: async (query: unknown) => {
      const sql = String(query);
      calls.push(sql);
      if (sql.includes('SELECT * FROM "JobsIA_dictionary_terms"')) return { rows: [] };
      return { rows: [] };
    },
    release: () => calls.push('RELEASE'),
  });

  const response = await request(app)
    .post('/api/dictionary/00000000-0000-4000-8000-000000000099/publish')
    .set('Authorization', `Bearer ${tokenFor(admin)}`);

  assert.equal(response.status, 404);
  assert.deepEqual(calls, ['BEGIN', 'SELECT * FROM "JobsIA_dictionary_terms" WHERE id = $1', 'ROLLBACK', 'RELEASE']);
});

test('Rollback sem versão anterior desfaz a transação aberta', async () => {
  const calls: string[] = [];
  mockAuthAndQueries(admin);
  (pool as any).connect = async () => ({
    query: async (query: unknown) => {
      const sql = String(query);
      calls.push(sql);
      if (sql.includes('SELECT * FROM "JobsIA_dictionary_terms"')) {
        return { rows: [{ id: 'current', previous_version_id: null }] };
      }
      return { rows: [] };
    },
    release: () => calls.push('RELEASE'),
  });

  const response = await request(app)
    .post('/api/dictionary/00000000-0000-4000-8000-000000000098/rollback')
    .set('Authorization', `Bearer ${tokenFor(admin)}`);

  assert.equal(response.status, 400);
  assert.deepEqual(calls, ['BEGIN', 'SELECT * FROM "JobsIA_dictionary_terms" WHERE id = $1', 'ROLLBACK', 'RELEASE']);
});
