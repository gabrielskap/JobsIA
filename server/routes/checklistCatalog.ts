import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db';
import { requireAuth, requireRole, logAudit, type AuthRequest } from '../middleware/auth';
import { aiCache } from './ai';
import { extractTextFromPdfBuffer, chunkDocumentText } from '../services/pdfExtractor';
import { generateEmbedding, cosineSimilarity, extractCatalogCandidatesFromText } from '../services/embeddingService';

const router = Router();
router.use(requireAuth);

type CatalogKind = 'GENERIC' | 'BRIDGE';

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function catalogKind(value: unknown): CatalogKind | undefined {
  const kind = stringValue(value).toUpperCase();
  return kind === 'GENERIC' || kind === 'BRIDGE' ? kind : undefined;
}

/**
 * Runtime consumers only see active entries. Administrators need the complete
 * list so that an inactive entry can be reviewed and reactivated safely.
 */
router.get('/admin', requireRole('ADMIN'), async (_req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query(
      [
        'SELECT id, kind, code, name, description, official_version, metadata, active, created_at',
        'FROM "JobsIA_checklist_catalog_items"',
        'ORDER BY kind ASC, active DESC, code ASC',
      ].join(' ')
    );
    res.json(rows);
  } catch (error: any) {
    if (error?.code === '42P01') {
      res.status(503).json({ message: 'O catálogo oficial ainda não foi migrado neste ambiente.' });
      return;
    }
    console.error('checklistCatalog.admin.get:', error);
    res.status(500).json({ message: 'Erro ao buscar o catálogo oficial para administração.' });
  }
});

router.get('/', async (req: AuthRequest, res) => {
  const requestedKind = req.query.kind;
  const kind = requestedKind === undefined ? undefined : catalogKind(requestedKind);
  if (requestedKind !== undefined && !kind) {
    res.status(400).json({ message: 'kind deve ser GENERIC ou BRIDGE.' });
    return;
  }

  try {
    const { rows } = await pool.query(
      [
        'SELECT id, kind, code, name, description, official_version, metadata, active, created_at',
        'FROM "JobsIA_checklist_catalog_items"',
        'WHERE active = true AND ($1::text IS NULL OR kind = $1)',
        'ORDER BY kind ASC, code ASC',
      ].join(' '),
      [kind || null]
    );
    res.json(rows);
  } catch (error: any) {
    if (error?.code === '42P01') {
      res.status(503).json({ message: 'O catálogo oficial ainda não foi migrado neste ambiente.' });
      return;
    }
    console.error('checklistCatalog.get:', error);
    res.status(500).json({ message: 'Erro ao buscar o catálogo oficial.' });
  }
});

router.post('/import', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (rawItems.length === 0) {
    res.status(400).json({ message: 'Informe ao menos um item do catálogo oficial.' });
    return;
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const items: Array<Record<string, unknown>> = [];
  rawItems.forEach((raw: unknown, index: number) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const kind = catalogKind(item.kind);
    const code = stringValue(item.code).toLocaleUpperCase('pt-BR');
    const name = stringValue(item.name);
    if (!kind) errors.push('items[' + index + '].kind deve ser GENERIC ou BRIDGE.');
    if (!code) errors.push('items[' + index + '].code é obrigatório.');
    if (!name) errors.push('items[' + index + '].name é obrigatório.');
    if (!kind || !code || !name) return;

    const key = kind + ':' + code;
    if (seen.has(key)) {
      errors.push('O item ' + key + ' foi informado mais de uma vez.');
      return;
    }
    seen.add(key);
    const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? item.metadata
      : {};
    items.push({
      kind,
      code,
      name,
      description: stringValue(item.description) || null,
      officialVersion: stringValue(item.official_version) || null,
      metadata,
      active: item.active !== false,
    });
  });

  if (errors.length > 0) {
    res.status(400).json({ message: 'Importação inválida.', errors });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        [
          'INSERT INTO "JobsIA_checklist_catalog_items"',
          '(kind, code, name, description, official_version, metadata, active)',
          'VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)',
          'ON CONFLICT (kind, code) DO UPDATE',
          'SET name = EXCLUDED.name, description = EXCLUDED.description,',
          'official_version = EXCLUDED.official_version, metadata = EXCLUDED.metadata, active = EXCLUDED.active',
        ].join(' '),
        [
          item.kind,
          item.code,
          item.name,
          item.description,
          item.officialVersion,
          JSON.stringify(item.metadata),
          item.active,
        ]
      );
    }
    await client.query('COMMIT');
    aiCache.clear();
    await logAudit(req.userId, 'IMPORT_CHECKLIST_CATALOG', { count: items.length }, req.ip);
    res.status(201).json({ imported: items.length });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === '42P01') {
      res.status(503).json({ message: 'A migração do catálogo ainda não foi aplicada neste ambiente.' });
      return;
    }
    console.error('checklistCatalog.import:', error);
    res.status(500).json({ message: 'Erro ao importar o catálogo oficial.' });
  } finally {
    client.release();
  }
});

router.get('/application-rules', async (_req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query(
      [
        'SELECT id, code, description, validation_regex, severity, message, suggestion_template, active, status, version, created_at',
        'FROM "JobsIA_application_validation_rules"',
        "WHERE active = true AND status = 'PUBLICADO'",
        'ORDER BY created_at ASC',
      ].join(' ')
    );
    res.json(rows);
  } catch (error: any) {
    if (error?.code === '42P01') {
      res.status(503).json({ message: 'As regras de Application ainda não foram migradas neste ambiente.' });
      return;
    }
    console.error('checklistCatalog.applicationRules.get:', error);
    res.status(500).json({ message: 'Erro ao buscar regras de Application.' });
  }
});

router.post('/application-rules/import', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const rawRules = Array.isArray(req.body?.items) ? req.body.items : [];
  if (rawRules.length === 0) {
    res.status(400).json({ message: 'Informe ao menos uma regra de Application.' });
    return;
  }

  const errors: string[] = [];
  const codes = new Set<string>();
  const rules: Array<Record<string, unknown>> = [];
  rawRules.forEach((raw: unknown, index: number) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const code = stringValue(item.code).toLocaleUpperCase('pt-BR');
    const expression = stringValue(item.validation_regex);
    const message = stringValue(item.message);
    const severity = stringValue(item.severity).toUpperCase() === 'AVISO' ? 'AVISO' : 'BLOQUEANTE';
    if (!code) errors.push('items[' + index + '].code é obrigatório.');
    if (!expression) errors.push('items[' + index + '].validation_regex é obrigatório.');
    if (!message) errors.push('items[' + index + '].message é obrigatório.');
    if (code && codes.has(code)) errors.push('A regra ' + code + ' foi informada mais de uma vez.');
    if (code) codes.add(code);
    if (expression) {
      try {
        new RegExp(expression);
      } catch {
        errors.push('items[' + index + '].validation_regex é inválida.');
      }
    }
    if (code && expression && message) {
      rules.push({
        code,
        description: stringValue(item.description),
        expression,
        severity,
        message,
        suggestionTemplate: stringValue(item.suggestion_template) || null,
      });
    }
  });

  if (errors.length > 0) {
    res.status(400).json({ message: 'Importação inválida.', errors });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const rule of rules) {
      await client.query(
        [
          'INSERT INTO "JobsIA_application_validation_rules"',
          '(code, description, validation_regex, severity, message, suggestion_template, active, status, version)',
          "VALUES ($1, $2, $3, $4, $5, $6, true, 'PUBLICADO', 1)",
          'ON CONFLICT (code) DO UPDATE',
          'SET description = EXCLUDED.description, validation_regex = EXCLUDED.validation_regex,',
          'severity = EXCLUDED.severity, message = EXCLUDED.message,',
          "suggestion_template = EXCLUDED.suggestion_template, active = true, status = 'PUBLICADO',",
          'version = "JobsIA_application_validation_rules".version + 1',
        ].join(' '),
        [
          rule.code,
          rule.description,
          rule.expression,
          rule.severity,
          rule.message,
          rule.suggestionTemplate,
        ]
      );
    }
    await client.query('COMMIT');
    aiCache.clear();
    await logAudit(req.userId, 'IMPORT_APPLICATION_VALIDATION_RULES', { count: rules.length }, req.ip);
    res.status(201).json({ imported: rules.length });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === '42P01') {
      res.status(503).json({ message: 'A migração de regras de Application ainda não foi aplicada neste ambiente.' });
      return;
    }
    console.error('checklistCatalog.applicationRules.import:', error);
    res.status(500).json({ message: 'Erro ao importar regras de Application.' });
  } finally {
    client.release();
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos no formato PDF são permitidos.'));
    }
  },
});

/**
 * Upload e vetorização de documento PDF no Catálogo.
 */
router.post('/upload-pdf', requireRole('ADMIN'), upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ message: 'Nenhum arquivo PDF foi enviado.' });
    return;
  }

  const filename = req.file.originalname;
  const fileSize = req.file.size;

  try {
    // 1. Extração do texto e metadados do PDF
    const { text, total_pages, info } = await extractTextFromPdfBuffer(req.file.buffer);

    if (!text || text.trim().length === 0) {
      res.status(422).json({ message: 'Não foi possível extrair texto legível do arquivo PDF informado.' });
      return;
    }

    // 2. Divisão em chunks semânticos com overlap
    const rawChunks = chunkDocumentText(text, total_pages);
    if (rawChunks.length === 0) {
      res.status(422).json({ message: 'O conteúdo do PDF não produziu trechos válidos para vetorização.' });
      return;
    }

    // 3. Geração de embeddings vetoriais para os chunks
    const chunkEmbeddings = await Promise.all(
      rawChunks.map(async (chunk) => {
        const embedding = await generateEmbedding(chunk.text);
        return {
          ...chunk,
          embedding,
        };
      })
    );

    // 4. Detecção de candidatos a itens do catálogo (Genéricos e Pontes)
    const detectedCandidates = extractCatalogCandidatesFromText(text);

    // 5. Persistência transacional do documento e chunks no PostgreSQL
    const client = await pool.connect();
    let documentId: string;

    try {
      await client.query('BEGIN');

      const docSummary = text.slice(0, 300).replace(/\s+/g, ' ').trim() + (text.length > 300 ? '...' : '');
      const docRes = await client.query(
        `INSERT INTO "JobsIA_catalog_documents"
         (filename, file_size, total_pages, extracted_text, summary, status, metadata, created_by)
         VALUES ($1, $2, $3, $4, $5, 'VETORIZADO', $6::jsonb, $7)
         RETURNING id, filename, file_size, total_pages, summary, status, created_at`,
        [
          filename,
          fileSize,
          total_pages,
          text,
          docSummary,
          JSON.stringify({ info, chunks_count: chunkEmbeddings.length, detected_candidates: detectedCandidates.length }),
          req.userId || null,
        ]
      );
      documentId = docRes.rows[0].id;

      for (const chunk of chunkEmbeddings) {
        await client.query(
          `INSERT INTO "JobsIA_catalog_chunks"
           (document_id, chunk_index, page_number, chunk_text, embedding, token_count)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
          [
            documentId,
            chunk.chunkIndex,
            chunk.pageNumber,
            chunk.text,
            JSON.stringify(chunk.embedding),
            chunk.tokenCount,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    aiCache.clear();
    await logAudit(req.userId, 'UPLOAD_CATALOG_PDF', { filename, documentId, chunksCount: chunkEmbeddings.length }, req.ip);

    res.status(201).json({
      message: 'PDF importado e vetorizado com sucesso.',
      document: {
        id: documentId,
        filename,
        file_size: fileSize,
        total_pages,
        chunks_count: chunkEmbeddings.length,
        summary: text.slice(0, 300),
      },
      detected_candidates: detectedCandidates,
    });
  } catch (error: any) {
    if (error?.code === '42P01') {
      res.status(503).json({ message: 'A migração de documentos do catálogo ainda não foi aplicada neste ambiente.' });
      return;
    }
    console.error('checklistCatalog.uploadPdf:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Erro ao processar e vetorizar o PDF.' });
  }
});

/**
 * Listagem dos documentos PDF importados no catálogo.
 */
router.get('/documents', async (_req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.filename, d.file_size, d.total_pages, d.summary, d.status, d.metadata, d.created_at,
              COUNT(c.id)::int AS chunks_count
       FROM "JobsIA_catalog_documents" d
       LEFT JOIN "JobsIA_catalog_chunks" c ON c.document_id = d.id
       GROUP BY d.id
       ORDER BY d.created_at DESC`
    );
    res.json(rows);
  } catch (error: any) {
    if (error?.code === '42P01') {
      res.status(503).json({ message: 'A tabela de documentos do catálogo ainda não foi migrada.' });
      return;
    }
    console.error('checklistCatalog.getDocuments:', error);
    res.status(500).json({ message: 'Erro ao listar documentos do catálogo.' });
  }
});

/**
 * Listagem dos chunks vetorizados de um documento específico.
 */
router.get('/documents/:id/chunks', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, document_id, chunk_index, page_number, chunk_text, token_count, created_at
       FROM "JobsIA_catalog_chunks"
       WHERE document_id = $1
       ORDER BY chunk_index ASC`,
      [id]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('checklistCatalog.getDocumentChunks:', error);
    res.status(500).json({ message: 'Erro ao buscar trechos vetorizados do documento.' });
  }
});

/**
 * Exclusão de documento PDF e seus chunks vetorizados.
 */
router.delete('/documents/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM "JobsIA_catalog_documents" WHERE id = $1 RETURNING id, filename', [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Documento não encontrado.' });
      return;
    }
    aiCache.clear();
    await logAudit(req.userId, 'DELETE_CATALOG_DOCUMENT', { id, filename: result.rows[0].filename }, req.ip);
    res.json({ message: 'Documento e vetores excluídos com sucesso.', id });
  } catch (error: any) {
    console.error('checklistCatalog.deleteDocument:', error);
    res.status(500).json({ message: 'Erro ao excluir documento do catálogo.' });
  }
});

/**
 * Busca semântica nos chunks vetorizados do catálogo.
 */
router.post('/search-semantic', async (req: AuthRequest, res) => {
  const query = stringValue(req.body?.query);
  const limit = Math.min(Math.max(1, Number(req.body?.limit) || 5), 20);

  if (!query) {
    res.status(400).json({ message: 'Informe o termo de consulta para busca semântica.' });
    return;
  }

  try {
    const queryEmbedding = await generateEmbedding(query);

    const { rows: chunks } = await pool.query(
      `SELECT c.id, c.document_id, c.chunk_index, c.page_number, c.chunk_text, c.embedding,
              d.filename
       FROM "JobsIA_catalog_chunks" c
       JOIN "JobsIA_catalog_documents" d ON d.id = c.document_id
       ORDER BY c.created_at DESC
       LIMIT 200`
    );

    const scored = chunks.map((chunk) => {
      let embeddingArr: number[] = [];
      if (Array.isArray(chunk.embedding)) {
        embeddingArr = chunk.embedding;
      } else if (typeof chunk.embedding === 'string') {
        try { embeddingArr = JSON.parse(chunk.embedding); } catch { embeddingArr = []; }
      }
      const score = cosineSimilarity(queryEmbedding, embeddingArr);
      return {
        id: chunk.id,
        document_id: chunk.document_id,
        filename: chunk.filename,
        page_number: chunk.page_number,
        chunk_index: chunk.chunk_index,
        chunk_text: chunk.chunk_text,
        similarity: Number(score.toFixed(4)),
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    const topResults = scored.slice(0, limit);

    res.json({ query, results: topResults });
  } catch (error: any) {
    console.error('checklistCatalog.searchSemantic:', error);
    res.status(500).json({ message: 'Erro ao executar busca semântica no catálogo.' });
  }
});

export default router;
