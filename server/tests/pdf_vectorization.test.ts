import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { pool } from '../db';
import { extractTextFromPdfBuffer, chunkDocumentText } from '../services/pdfExtractor';
import { generateEmbedding, cosineSimilarity, extractCatalogCandidatesFromText } from '../services/embeddingService';
import { jsPDF } from 'jspdf';

let adminUserId: string;
let adminToken: string;
let operatorUserId: string;
let operatorToken: string;

test.before(async () => {
  // Limpar tabelas de testes
  await pool.query('DELETE FROM "JobsIA_catalog_documents" WHERE filename LIKE $1', ['teste_vetorizacao%']);
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', ['admin_pdf@dataprev.gov.br', 'operator_pdf@dataprev.gov.br']);

  // Criar ADMIN
  const resAdmin = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['admin_pdf@dataprev.gov.br', 'dummy_hash', 'Admin PDF', 'ADMIN']
  );
  adminUserId = resAdmin.rows[0].id;
  adminToken = jwt.sign({ sub: adminUserId }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  // Criar OPERADOR
  const resOperator = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['operator_pdf@dataprev.gov.br', 'dummy_hash', 'Operador PDF', 'OPERADOR']
  );
  operatorUserId = resOperator.rows[0].id;
  operatorToken = jwt.sign({ sub: operatorUserId }, process.env.JWT_SECRET!, { expiresIn: '1h' });
});

test.after(async () => {
  await pool.query('DELETE FROM "JobsIA_catalog_documents" WHERE filename LIKE $1', ['teste_vetorizacao%']);
  await pool.query('DELETE FROM users WHERE email IN ($1, $2)', ['admin_pdf@dataprev.gov.br', 'operator_pdf@dataprev.gov.br']);
});

test('Unitário - Chunking de texto e detecção de candidatos', () => {
  const sampleText = `
    DOCUMENTO TÉCNICO DE ESPECIFICAÇÃO DE JOBS E PONTES DIOT

    [GENERICO] GENERIC-EXP-001: Job Genérico de Exportação de Dados
    Este job realiza o dump e compressão de tabelas do Oracle.

    [PONTE] PONTE-CD-001: Ponte Connect Direct Transmissão
    Esta ponte efetua o envio seguro de lotes para a rede bancária.
  `;

  const chunks = chunkDocumentText(sampleText, 2, 200, 30);
  assert.ok(chunks.length > 0, 'Deve gerar pelo menos 1 chunk');
  assert.ok(chunks[0].chunkIndex === 1);
  assert.ok(chunks[0].tokenCount > 0);

  const candidates = extractCatalogCandidatesFromText(sampleText);
  assert.strictEqual(candidates.length, 2, 'Deve identificar 2 candidatos a catálogo');
  assert.strictEqual(candidates[0].kind, 'GENERIC');
  assert.strictEqual(candidates[0].code, 'GENERIC-EXP-001');
  assert.strictEqual(candidates[1].kind, 'BRIDGE');
  assert.strictEqual(candidates[1].code, 'PONTE-CD-001');
});

test('Unitário - Geração de Embeddings e Similaridade de Cosseno', async () => {
  const text1 = 'Transferência de arquivos mainframe via Connect Direct';
  const text2 = 'Transmissão e envio de arquivos para servidor via Connect Direct';
  const text3 = 'Receita de bolo de chocolate com morango';

  const emb1 = await generateEmbedding(text1);
  const emb2 = await generateEmbedding(text2);
  const emb3 = await generateEmbedding(text3);

  assert.ok(Array.isArray(emb1) && emb1.length > 0);
  assert.ok(Array.isArray(emb2) && emb2.length > 0);

  const simRelacionados = cosineSimilarity(emb1, emb2);
  const simDiferentes = cosineSimilarity(emb1, emb3);

  assert.ok(simRelacionados > simDiferentes, 'Textos com tema comum devem ter maior similaridade de cosseno');
});

test('Integração - Upload, Vetorização, Busca Semântica e Contexto na IA', async () => {
  // 1. Gerar um PDF sintético em memória com jsPDF
  const doc = new jsPDF();
  doc.text('CATALOGO DE GENERICOS E PONTES DIOT', 10, 10);
  doc.text('[GENERICO] GENERIC-TESTE-PDF-01: Extracao Automatica de Dados Cadastrais', 10, 20);
  doc.text('Descricao: Executa extracao noturna de cadastros e gera arquivo compactado gzip.', 10, 30);
  doc.text('[PONTE] PONTE-TESTE-PDF-01: Ponte de Comunicacao Mensageria MQ', 10, 40);
  doc.text('Descricao: Envia mensagens assincronas para o barramento corporativo.', 10, 50);
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

  // 2. Extração via serviço pdfExtractor
  const extracted = await extractTextFromPdfBuffer(pdfBuffer);
  assert.ok(extracted.text.includes('GENERIC-TESTE-PDF-01'));
  assert.ok(extracted.total_pages >= 1);

  // 3. Upload via rota com usuário OPERADOR deve retornar 403
  const opUploadRes = await request(app)
    .post('/api/checklist-catalog/upload-pdf')
    .set('Authorization', `Bearer ${operatorToken}`)
    .attach('file', pdfBuffer, 'teste_vetorizacao_op.pdf');
  assert.strictEqual(opUploadRes.status, 403);

  // 4. Upload via rota com usuário ADMIN deve criar documento e vetorizar
  const adminUploadRes = await request(app)
    .post('/api/checklist-catalog/upload-pdf')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', pdfBuffer, 'teste_vetorizacao_admin.pdf');

  assert.strictEqual(adminUploadRes.status, 201);
  assert.ok(adminUploadRes.body.document);
  assert.ok(adminUploadRes.body.document.chunks_count >= 1);
  const docId = adminUploadRes.body.document.id;

  // 5. Listar documentos importados (OPERADOR pode consultar)
  const listDocsRes = await request(app)
    .get('/api/checklist-catalog/documents')
    .set('Authorization', `Bearer ${operatorToken}`);
  assert.strictEqual(listDocsRes.status, 200);
  assert.ok(listDocsRes.body.some((d: any) => d.id === docId));

  // 6. Consultar chunks do documento
  const chunksRes = await request(app)
    .get(`/api/checklist-catalog/documents/${docId}/chunks`)
    .set('Authorization', `Bearer ${operatorToken}`);
  assert.strictEqual(chunksRes.status, 200);
  assert.ok(chunksRes.body.length >= 1);
  assert.ok(chunksRes.body[0].chunk_text.includes('GENERIC-TESTE-PDF-01'));

  // 7. Busca semântica por similaridade de cosseno
  const searchRes = await request(app)
    .post('/api/checklist-catalog/search-semantic')
    .set('Authorization', `Bearer ${operatorToken}`)
    .send({ query: 'extracao de dados cadastrais compactado gzip', limit: 5 });

  assert.strictEqual(searchRes.status, 200);
  assert.ok(searchRes.body.results.length >= 1);
  assert.ok(searchRes.body.results[0].chunk_text.includes('GENERIC-TESTE-PDF-01'));

  // 8. Verificar que o contexto consolidado da IA inclui os trechos do PDF
  const aiContextRes = await request(app)
    .get('/api/ai/context')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(aiContextRes.status, 200);
  assert.ok(aiContextRes.body.prompt.includes('teste_vetorizacao_admin.pdf'));
  assert.ok(aiContextRes.body.prompt.includes('GENERIC-TESTE-PDF-01'));

  // 9. Exclusão do documento por ADMIN
  const delRes = await request(app)
    .delete(`/api/checklist-catalog/documents/${docId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(delRes.status, 200);
});
