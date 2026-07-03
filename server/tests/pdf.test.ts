import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';
import { pdfService, TEMPLATE_VERSION, SCHEMA_VERSION } from '../services/pdfService';

let testUserId: string;
let testUserToken: string;
let testChecklistId: string;
const testJobTypeId = 777;

test.before(async () => {
  // Limpar tabelas
  await pool.query('DELETE FROM "JobsIA_validation_runs"');
  await pool.query('DELETE FROM "JobsIA_checklists"');
  await pool.query('DELETE FROM "JobsIA_parameters" WHERE job_type_id = $1', [testJobTypeId]);
  await pool.query('DELETE FROM "JobsIA_types" WHERE id = $1', [testJobTypeId]);
  await pool.query('DELETE FROM users WHERE email = $1', ['pdf_tester@dataprev.gov.br']);

  // Criar usuário
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['pdf_tester@dataprev.gov.br', 'dummy_hash', 'PDF Tester', 'ADMIN']
  );
  testUserId = userRes.rows[0].id;
  testUserToken = jwt.sign({ sub: testUserId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  // Criar checklist de teste no banco
  const checklistRes = await pool.query(
    `INSERT INTO "JobsIA_checklists" (type, status, user_id, user_name, file_name, data, command)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      'tipo_3',
      'Concluído',
      testUserId,
      'PDF Tester',
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
        __command: 'sh /u/bin/J.DIT.OPR.003.SH -a DIT.TRH.DIARIO'
      }),
      'sh /u/bin/J.DIT.OPR.003.SH -a DIT.TRH.DIARIO'
    ]
  );
  testChecklistId = checklistRes.rows[0].id;
});

test.after(async () => {
  // Limpar tabelas
  await pool.query('DELETE FROM "JobsIA_checklists"');
  await pool.query('DELETE FROM users WHERE email = $1', ['pdf_tester@dataprev.gov.br']);
});

test('PDF Service - Geração direta de Buffer PDF', () => {
  const payload = {
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
    warnings: []
  };

  const buffer = pdfService.generateChecklistPDF(payload);
  assert.ok(buffer instanceof Buffer);
  assert.ok(buffer.length > 1000, 'O PDF gerado deve possuir tamanho razoável.');
  
  // Cabeçalho mágico do PDF
  const pdfString = buffer.toString('binary');
  assert.match(pdfString, /^%PDF-/, 'Deve iniciar com o cabeçalho PDF');
});

test('PDF Service - Geração de 1 página', () => {
  const payload = {
    status: 'Concluído',
    user_name: 'PDF Tester',
    rqs_rdm: 'RQS-12345',
    gestor: 'Mínimo',
    command: 'cmd',
    errors: [],
    warnings: []
  };

  const buffer = pdfService.generateChecklistPDF(payload);
  const pdfString = buffer.toString('binary');
  
  // Verifica se o PDF contém metadados de versão
  assert.ok(pdfString.includes(TEMPLATE_VERSION) || pdfString.includes(SCHEMA_VERSION));
});

test('PDF Service - Geração de 2 ou mais páginas por overflow de conteúdo', () => {
  // Criando lista massiva de erros/avisos para forçar quebra de páginas
  const errors = Array.from({ length: 25 }, (_, i) => ({
    ruleCode: `ERR-CODE-${i}`,
    field: 'nome_campo',
    message: `Erro longo e detalhado de simulação para testar quebra de página número ${i}. Este texto deve ser envolto e quebrado corretamente nas páginas seguintes.`
  }));

  const payload = {
    status: 'Falha Validação',
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
    errors,
    warnings: []
  };

  const buffer = pdfService.generateChecklistPDF(payload);
  const pdfString = buffer.toString('binary');

  assert.ok(buffer.length > 5000, 'PDF com overflow deve ser consideravelmente maior');
  // Em jsPDF, múltiplos objetos /Page indicam quebra de página
  const pageMatches = pdfString.match(/\/Type\s*\/Page\b/g);
  assert.ok(pageMatches && pageMatches.length >= 2, 'O PDF deve possuir 2 ou mais páginas.');
});

test('Endpoint PDF - Download via rota GET com JWT', async () => {
  const res = await request(app)
    .get(`/api/checklists/${testChecklistId}/pdf`)
    .set('Authorization', `Bearer ${testUserToken}`);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['content-type'], 'application/pdf');
  assert.ok(res.headers['content-disposition'].includes('.pdf'));
  assert.ok(res.body.length > 1000);
});

test('Endpoint PDF - Bloquear download para Solicitantes alheios', async () => {
  // Criar outro usuário Solicitante
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['outro_solicitante@dataprev.gov.br', 'dummy_hash', 'Outro Solicitante', 'SOLICITANTE']
  );
  const outroId = userRes.rows[0].id;
  const outroToken = jwt.sign({ sub: outroId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  try {
    const res = await request(app)
      .get(`/api/checklists/${testChecklistId}/pdf`)
      .set('Authorization', `Bearer ${outroToken}`);

    assert.strictEqual(res.status, 403, 'Solicitante não deve acessar PDF de terceiros');
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [outroId]);
  }
});
