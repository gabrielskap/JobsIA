import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole, logAudit, type AuthRequest } from '../middleware/auth';
import { aiCache } from '../routes/ai';

const router = Router();
router.use(requireAuth);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_APPLICABLE_JOB_TYPES = 100;

type JobApplicabilityValidation =
  | { valid: true; value: number[] | null }
  | { valid: false; message: string };

/**
 * The database uses NULL to mean that a rule applies to every job type. An
 * empty list would instead silently make a published rule apply to no jobs,
 * so the API requires the UI to send null for the "Todos" option.
 */
export function validateJobApplicability(value: unknown): JobApplicabilityValidation {
  if (value === null) {
    return { valid: true, value: null };
  }

  if (!Array.isArray(value)) {
    return {
      valid: false,
      message: '"aplicabilidade_job" deve ser uma lista de IDs de tipos de job ou null para todos os tipos.',
    };
  }

  if (value.length === 0) {
    return {
      valid: false,
      message: 'Informe ao menos um tipo de job ou use null para aplicar a regra a todos os tipos.',
    };
  }

  if (value.length > MAX_APPLICABLE_JOB_TYPES) {
    return {
      valid: false,
      message: `A aplicabilidade aceita no máximo ${MAX_APPLICABLE_JOB_TYPES} tipos de job.`,
    };
  }

  if (!value.every((jobTypeId) => Number.isSafeInteger(jobTypeId) && jobTypeId > 0)) {
    return {
      valid: false,
      message: 'Cada tipo de job deve ser um número inteiro positivo.',
    };
  }

  const jobTypeIds = value as number[];
  if (new Set(jobTypeIds).size !== jobTypeIds.length) {
    return {
      valid: false,
      message: 'A lista de tipos de job não pode conter IDs duplicados.',
    };
  }

  return { valid: true, value: [...jobTypeIds].sort((left, right) => left - right) };
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ambiente AS environment, texto_orientacao AS rule, created_at, status, version, previous_version_id, ativo AS active,
              secao, codigo, campo_alvo, tipo_regra, severidade, mensagem, expressao, aplicabilidade_job, casos_teste
       FROM "JobsIA_validation_rules" WHERE ativo = true ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('norms.getAll:', err);
    res.status(500).json({ message: 'Erro ao buscar normas' });
  }
});

// Helper para sanitizar o ambiente de acordo com a CHECK constraint do banco
function sanitizeEnvironment(env: string): string {
  if (!env) return 'Global';
  const clean = env.toLowerCase().trim();
  if (clean.includes('unix') || clean.includes('linux')) return 'Unix';
  if (clean.includes('win')) return 'Windows';
  if (clean.includes('mainframe')) return 'Mainframe';
  if (clean.includes('global') || clean.includes('geral')) return 'Global';
  if (clean.includes('homolog')) return 'Global';
  if (clean.includes('prod')) return 'Global';
  // Fallback seguro capitalizado
  return env.charAt(0).toUpperCase() + env.slice(1);
}

router.post('/', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { environment, rule, secao, codigo, campo_alvo, tipo_regra, severidade, mensagem, expressao, aplicabilidade_job, casos_teste } = req.body;
  const mappedEnv = sanitizeEnvironment(environment);
  try {
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_validation_rules" 
       (ambiente, texto_orientacao, status, version, secao, codigo, campo_alvo, tipo_regra, severidade, mensagem, expressao, aplicabilidade_job, casos_teste) 
       VALUES ($1, $2, 'PUBLICADO', 1, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *, ambiente AS environment, texto_orientacao AS rule`,
      [
        mappedEnv,
        rule || mensagem || '',
        secao || '5.1',
        codigo || `RULE-${Date.now()}`,
        campo_alvo || 'file_name',
        tipo_regra || 'regex',
        severidade || 'BLOQUEANTE',
        mensagem || rule || '',
        expressao || '',
        aplicabilidade_job || null,
        casos_teste ? JSON.stringify(casos_teste) : null
      ]
    );
    await logAudit(req.userId, 'CREATE_NORM', { id: rows[0].id, environment, rule }, req.ip);
    if (aiCache) aiCache.clear();
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('norms.create:', err);
    res.status(500).json({ message: 'Erro ao criar norma' });
  }
});

router.put('/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { environment, rule, secao, codigo, campo_alvo, tipo_regra, severidade, mensagem, expressao, aplicabilidade_job, casos_teste } = req.body;
  try {
    const { rows: current } = await pool.query('SELECT * FROM "JobsIA_validation_rules" WHERE id = $1', [id]);
    if (current.length === 0) { res.status(404).json({ message: 'Norma não encontrada' }); return; }
    
    const nextVersion = current[0].version + 1;
    const mappedEnv = environment ? sanitizeEnvironment(environment) : current[0].ambiente;
    if (current[0].ativo) {
      await pool.query('UPDATE "JobsIA_validation_rules" SET ativo = false WHERE id = $1', [id]);
    }
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_validation_rules" 
       (ambiente, texto_orientacao, status, version, previous_version_id, secao, codigo, campo_alvo, tipo_regra, severidade, mensagem, expressao, aplicabilidade_job, casos_teste, ativo)
       VALUES ($1, $2, 'PUBLICADO', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true) RETURNING *, ambiente AS environment, texto_orientacao AS rule`,
      [
        mappedEnv,
        rule || current[0].texto_orientacao,
        nextVersion,
        id,
        secao || current[0].secao,
        codigo || current[0].codigo,
        campo_alvo || current[0].campo_alvo,
        tipo_regra || current[0].tipo_regra,
        severidade || current[0].severidade,
        mensagem || current[0].mensagem,
        expressao !== undefined ? expressao : current[0].expressao,
        aplicabilidade_job !== undefined ? aplicabilidade_job : current[0].aplicabilidade_job,
        casos_teste !== undefined ? (casos_teste ? JSON.stringify(casos_teste) : null) : (current[0].casos_teste ? JSON.stringify(current[0].casos_teste) : null)
      ]
    );
    await logAudit(req.userId, 'UPDATE_NORM', { id, new_id: rows[0].id, version: nextVersion }, req.ip);
    if (aiCache) aiCache.clear();
    res.json(rows[0]);
  } catch (err) {
    console.error('norms.update:', err);
    res.status(500).json({ message: 'Erro ao atualizar norma' });
  }
});

/**
 * Updates the job-type scope of a currently published rule in place. This is
 * deliberately narrower than the versioned PUT above: it accepts only the
 * scope field, validates it against the catalog, and records the before/after
 * values in the administrative audit log.
 */
router.put('/:id/applicability', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ message: 'ID da norma inválido.' });
    return;
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ message: 'Informe somente "aplicabilidade_job" no corpo da requisição.' });
    return;
  }

  const bodyKeys = Object.keys(req.body);
  if (bodyKeys.length !== 1 || bodyKeys[0] !== 'aplicabilidade_job') {
    res.status(400).json({ message: 'Este endpoint permite atualizar somente "aplicabilidade_job".' });
    return;
  }

  const applicability = validateJobApplicability(req.body.aplicabilidade_job);
  if (!applicability.valid) {
    res.status(400).json({ message: applicability.message });
    return;
  }

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const { rows: current } = await client.query(
      `SELECT id, codigo, aplicabilidade_job, ativo, status
       FROM "JobsIA_validation_rules"
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (current.length === 0) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      res.status(404).json({ message: 'Norma não encontrada.' });
      return;
    }

    const rule = current[0];
    if (!rule.ativo || rule.status !== 'PUBLICADO') {
      await client.query('ROLLBACK');
      transactionOpen = false;
      res.status(409).json({
        message: 'A aplicabilidade pode ser alterada diretamente apenas em uma norma ativa e publicada.',
      });
      return;
    }

    if (applicability.value !== null) {
      const { rows: knownJobTypes } = await client.query<{ id: number }>(
        'SELECT id FROM "JobsIA_types" WHERE id = ANY($1::integer[])',
        [applicability.value]
      );
      const knownIds = new Set(knownJobTypes.map((jobType) => jobType.id));
      const unknownIds = applicability.value.filter((jobTypeId) => !knownIds.has(jobTypeId));
      if (unknownIds.length > 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        res.status(400).json({
          message: `Tipos de job inexistentes: ${unknownIds.join(', ')}.`,
        });
        return;
      }
    }

    const { rows } = await client.query(
      `UPDATE "JobsIA_validation_rules"
       SET aplicabilidade_job = $1
       WHERE id = $2
       RETURNING *, ambiente AS environment, texto_orientacao AS rule, ativo AS active`,
      [applicability.value, id]
    );

    await client.query('COMMIT');
    transactionOpen = false;

    // The validation query reads from the database per request, while this
    // cache supplies the Agent's consolidated knowledge prompt.
    aiCache.clear();
    await logAudit(req.userId, 'UPDATE_NORM_APPLICABILITY', {
      id,
      code: rule.codigo,
      previous_aplicabilidade_job: rule.aplicabilidade_job,
      aplicabilidade_job: applicability.value,
    }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    if (transactionOpen) {
      await client.query('ROLLBACK');
    }
    console.error('norms.updateApplicability:', err);
    res.status(500).json({ message: 'Erro ao atualizar a aplicabilidade da norma.' });
  } finally {
    client.release();
  }
});

// Aprovar norma
router.post('/:id/approve', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE "JobsIA_validation_rules" SET status = 'APROVADO' WHERE id = $1 RETURNING *, ambiente AS environment, texto_orientacao AS rule`,
      [id]
    );
    if (rows.length === 0) { res.status(404).json({ message: 'Norma não encontrada' }); return; }
    await logAudit(req.userId, 'APPROVE_NORM', { id }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    console.error('norms.approve:', err);
    res.status(500).json({ message: 'Erro ao aprovar norma' });
  }
});

// Publicar norma com validação
router.post('/:id/publish', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: norm } = await client.query('SELECT * FROM "JobsIA_validation_rules" WHERE id = $1', [id]);
    if (norm.length === 0) { res.status(404).json({ message: 'Norma não encontrada' }); return; }

    const rule = norm[0];

    // 1. Validação de Regex se aplicável
    if (rule.tipo_regra === 'regex' && rule.expressao) {
      try {
        new RegExp(rule.expressao);
      } catch (regexErr: any) {
        res.status(400).json({ message: `Erro de sintaxe no Regex: ${regexErr.message}` });
        await client.query('ROLLBACK');
        return;
      }
    }

    // 2. Validação dos Casos de Teste
    if (rule.casos_teste) {
      const tests = typeof rule.casos_teste === 'string' ? JSON.parse(rule.casos_teste) : rule.casos_teste;
      if (Array.isArray(tests)) {
        for (const testCase of tests) {
          const { input, expectedPassed } = testCase;
          let passed = true;
          if (rule.tipo_regra === 'regex' && rule.expressao) {
            const rx = new RegExp(rule.expressao);
            passed = rx.test(input);
          }
          if (passed !== expectedPassed) {
            res.status(400).json({
              message: `Caso de teste falhou para o input "${input}". Esperado passou=${expectedPassed}, obtido=${passed}`
            });
            await client.query('ROLLBACK');
            return;
          }
        }
      }
    }

    // Desativar e tirar da publicação a versão anterior se houver
    if (rule.previous_version_id) {
      await client.query(
        `UPDATE "JobsIA_validation_rules" SET ativo = false, status = 'APROVADO' WHERE id = $1`,
        [rule.previous_version_id]
      );
    }

    // Se existirem outras regras ativas com o mesmo código, desativá-las
    await client.query(
      `UPDATE "JobsIA_validation_rules" SET ativo = false, status = 'APROVADO' WHERE codigo = $1 AND id <> $2`,
      [rule.codigo, id]
    );

    const { rows } = await client.query(
      `UPDATE "JobsIA_validation_rules" SET status = 'PUBLICADO', ativo = true WHERE id = $1 RETURNING *, ambiente AS environment, texto_orientacao AS rule`,
      [id]
    );
    await client.query('COMMIT');
    
    // Invalidar cache do backend
    if (aiCache) aiCache.clear();
    
    await logAudit(req.userId, 'PUBLISH_NORM', { id }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('norms.publish:', err);
    res.status(500).json({ message: 'Erro ao publicar norma' });
  } finally {
    client.release();
  }
});

// Rollback para versão anterior
router.post('/:id/rollback', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: current } = await client.query('SELECT * FROM "JobsIA_validation_rules" WHERE id = $1', [id]);
    if (current.length === 0) { res.status(404).json({ message: 'Norma não encontrada' }); return; }
    
    const prevId = current[0].previous_version_id;
    if (!prevId) {
      res.status(400).json({ message: 'Não existe versão anterior para fazer rollback' });
      await client.query('ROLLBACK');
      return;
    }

    // Desativar versão atual e reativar/publicar a anterior
    await client.query(`UPDATE "JobsIA_validation_rules" SET ativo = false, status = 'APROVADO' WHERE id = $1`, [id]);
    const { rows } = await client.query(
      `UPDATE "JobsIA_validation_rules" SET ativo = true, status = 'PUBLICADO' WHERE id = $1 RETURNING *, ambiente AS environment, texto_orientacao AS rule`,
      [prevId]
    );

    await client.query('COMMIT');
    
    if (aiCache) aiCache.clear();

    await logAudit(req.userId, 'ROLLBACK_NORM', { id, restored_id: prevId }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('norms.rollback:', err);
    res.status(500).json({ message: 'Erro no rollback da norma' });
  } finally {
    client.release();
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    await pool.query('DELETE FROM "JobsIA_validation_rules" WHERE id = $1', [req.params.id]);
    await logAudit(req.userId, 'DELETE_NORM', { id: req.params.id }, req.ip);
    
    if (aiCache) aiCache.clear();

    res.status(204).send();
  } catch (err) {
    console.error('norms.remove:', err);
    res.status(500).json({ message: 'Erro ao remover norma' });
  }
});

router.post('/seed', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) FROM "JobsIA_validation_rules"');
  if (Number(rows[0].count) > 0) { res.json({ seeded: false }); return; }
  const items: { environment: string; rule: string }[] = req.body.items ?? [];
  try {
    for (const item of items) {
      await pool.query(
        `INSERT INTO "JobsIA_validation_rules" 
         (ambiente, texto_orientacao, status, version, secao, codigo, campo_alvo, tipo_regra, severidade, mensagem, expressao) 
         VALUES ($1, $2, 'PUBLICADO', 1, '5.1', $3, 'file_name', 'regex', 'BLOQUEANTE', $2, $4)`,
        [
          item.environment,
          item.rule,
          `RULE-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          item.environment === 'Windows' ? '^[BDFJLPTWX]_[A-Z]{3}_[A-Z]{3}_[0-9]{3}' : '^[BDFJLPTWX]\\.[A-Z]{3}\\.[A-Z]{3}\\.[0-9]{3}'
        ]
      );
    }
    await logAudit(req.userId, 'SEED_NORMS', { count: items.length }, req.ip);
    
    if (aiCache) aiCache.clear();

    res.json({ seeded: true });
  } catch (err) {
    console.error('norms.seed:', err);
    res.status(500).json({ message: 'Erro ao popular normas' });
  }
});

export default router;
