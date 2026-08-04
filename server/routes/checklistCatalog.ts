import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole, logAudit, type AuthRequest } from '../middleware/auth';
import { aiCache } from './ai';

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

export default router;
