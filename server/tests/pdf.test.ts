import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { pdfService, TEMPLATE_VERSION, SCHEMA_VERSION } from '../services/pdfService';

// Integration tests are deliberately opt-in. They must never use DATABASE_URL,
// which may point at a shared development environment.
const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const hasIntegrationDatabase = Boolean(testDatabaseUrl);
let app: Express | undefined;
let pool: Pool | undefined;

const runId = `${process.pid}-${Date.now()}`;
const testUserEmail = `pdf-tester-${runId}@dataprev.gov.br`;
const otherUserEmail = `pdf-other-${runId}@dataprev.gov.br`;
const testUserName = `PDF Tester ${runId}`;
let testUserId: string | undefined;
let testUserToken: string | undefined;
let testChecklistId: string | undefined;

test.before(async () => {
  if (!testDatabaseUrl) return;

  process.env.DATABASE_URL = testDatabaseUrl;
  ({ app } = await import('../app'));
  ({ pool } = await import('../db'));

  const userResult = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [testUserEmail, 'dummy_hash', testUserName, 'ADMIN'],
  );
  testUserId = userResult.rows[0].id;
  testUserToken = jwt.sign({ sub: testUserId }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });

  const checklistResult = await pool.query(
    `INSERT INTO "JobsIA_checklists" (type, status, user_id, user_name, file_name, data, command)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      'tipo_3',
      'Concluído',
      testUserId,
      testUserName,
      'T.DIT.OPR.003',
      JSON.stringify({
        rqs_rdm: 'RQS-12345',
        gestor: 'Gestor Teste',
        solicitante: 'Solicitante Teste',
        desenvolvedor: 'Desenvolvedor Teste',
        matricula: '123456',
        area: 'DIOT',
        contato: 'ramal-999',
        application: 'DIT.TRH.DIARIO',
        periodicidade: 'Diário',
        tipo_execucao: 'Batch',
        sistema: 'Sistemas Logísticos',
        rotina: 'Gera Relatório',
        objetivo: 'Objetivo de teste operacional',
        quantidade_jobs: 1,
        __command: 'sh /u/bin/J.DIT.OPR.003.SH -a DIT.TRH.DIARIO',
      }),
      'sh /u/bin/J.DIT.OPR.003.SH -a DIT.TRH.DIARIO',
    ],
  );
  testChecklistId = checklistResult.rows[0].id;
});

test.after(async () => {
  if (!pool) return;

  if (testChecklistId) {
    await pool.query('DELETE FROM "JobsIA_validation_runs" WHERE checklist_id = $1', [testChecklistId]);
    await pool.query('DELETE FROM "JobsIA_checklists" WHERE id = $1', [testChecklistId]);
  }
  if (testUserId) {
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  }
});

test('PDF Service - direct Buffer generation', () => {
  const buffer = pdfService.generateChecklistPDF({
    status: 'Concluído',
    user_name: 'PDF Tester',
    rqs_rdm: 'RQS-12345',
    gestor: 'Gestor Teste',
    solicitante: 'Solicitante Teste',
    desenvolvedor: 'Desenvolvedor Teste',
    matricula: '123456',
    area: 'DIOT',
    contato: 'ramal-999',
    application: 'DIT.TRH.DIARIO',
    periodicidade: 'Diário',
    tipo_execucao: 'Batch',
    sistema: 'Sistemas Logísticos',
    rotina: 'Gera Relatório',
    objetivo: 'Objetivo de teste operacional',
    quantidade_jobs: 1,
    command: 'sh /u/bin/J.DIT.OPR.003.SH -a DIT.TRH.DIARIO',
    errors: [],
    warnings: [],
  });

  assert.ok(buffer instanceof Buffer);
  assert.ok(buffer.length > 1_000, 'The generated PDF must have a reasonable size.');
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('PDF Service - document version metadata', () => {
  const buffer = pdfService.generateChecklistPDF({
    status: 'Concluído',
    user_name: 'PDF Tester',
    gestor: 'Mínimo',
    command: 'cmd',
  });
  const pdfString = buffer.toString('binary');

  assert.ok(pdfString.includes(TEMPLATE_VERSION) || pdfString.includes(SCHEMA_VERSION));
});

test('PDF Service - creates extra pages for overflowing validation content', () => {
  const errors = Array.from({ length: 25 }, (_, index) => ({
    ruleCode: `ERR-CODE-${index}`,
    field: 'nome_campo',
    message: `Erro longo e detalhado de simulação para testar quebra de página número ${index}.`,
  }));
  const buffer = pdfService.generateChecklistPDF({
    status: 'Falha Validação',
    user_name: 'PDF Tester',
    rqs_rdm: 'RQS-12345',
    application: 'DIT.TRH.DIARIO',
    command: 'sh /u/bin/J.DIT.OPR.003.SH -a DIT.TRH.DIARIO',
    errors,
    warnings: [],
  });
  const pageMatches = buffer.toString('binary').match(/\/Type\s*\/Page\b/g);

  assert.ok(buffer.length > 5_000);
  assert.ok(pageMatches && pageMatches.length >= 2, 'The PDF must contain two or more pages.');
});

test('PDF Service - renders CAPADOR parameters', () => {
  const buffer = pdfService.generateChecklistPDF({
    status: 'Concluído',
    user_name: 'CAPADOR Tester',
    servidor_origem: 'UXRJO001',
    servidor_destino: 'UXRSP002',
    diretorio_origem: '/u/data/origem',
    diretorio_destino: '/u/data/destino',
    capacidade_armazenamento: '500MB',
    permissoes_usuario: 'swadm:operacao',
    operacao: 'GET',
    temporalidade: '30 dias',
  });

  assert.ok(buffer instanceof Buffer);
  assert.ok(buffer.length > 1_000);
});

test('Endpoint PDF - authenticated download', { skip: !hasIntegrationDatabase }, async () => {
  assert.ok(app && testChecklistId && testUserToken);
  const response = await request(app)
    .get(`/api/checklists/${testChecklistId}/pdf`)
    .set('Authorization', `Bearer ${testUserToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/pdf');
  assert.ok(response.headers['content-disposition'].includes('.pdf'));
  assert.ok(response.body.length > 1_000);
});

test('Endpoint PDF - blocks foreign requester', { skip: !hasIntegrationDatabase }, async () => {
  assert.ok(pool && app && testChecklistId);
  const userResult = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [otherUserEmail, 'dummy_hash', 'Outro Solicitante', 'SOLICITANTE'],
  );
  const otherUserId = userResult.rows[0].id as string;
  const otherToken = jwt.sign({ sub: otherUserId }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });

  try {
    const response = await request(app)
      .get(`/api/checklists/${testChecklistId}/pdf`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(response.status, 403);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [otherUserId]);
  }
});
