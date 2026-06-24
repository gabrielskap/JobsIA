import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole, logAudit, type AuthRequest } from '../middleware/auth';
import { aiCache } from '../routes/ai';

const router = Router();
router.use(requireAuth);

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
       VALUES ($1, $2, 'RASCUNHO', 1, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *, ambiente AS environment, texto_orientacao AS rule`,
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
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_validation_rules" 
       (ambiente, texto_orientacao, status, version, previous_version_id, secao, codigo, campo_alvo, tipo_regra, severidade, mensagem, expressao, aplicabilidade_job, casos_teste)
       VALUES ($1, $2, 'RASCUNHO', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *, ambiente AS environment, texto_orientacao AS rule`,
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
    await logAudit(req.userId, 'UPDATE_NORM_DRAFT', { id, new_draft_id: rows[0].id, version: nextVersion }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    console.error('norms.update:', err);
    res.status(500).json({ message: 'Erro ao atualizar norma' });
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
        `UPDATE "JobsIA_validation_rules" SET active = false, status = 'APROVADO' WHERE id = $1`,
        [rule.previous_version_id]
      );
    }

    // Se existirem outras regras ativas com o mesmo código, desativá-las
    await client.query(
      `UPDATE "JobsIA_validation_rules" SET active = false, status = 'APROVADO' WHERE codigo = $1 AND id <> $2`,
      [rule.codigo, id]
    );

    const { rows } = await client.query(
      `UPDATE "JobsIA_validation_rules" SET status = 'PUBLICADO', active = true WHERE id = $1 RETURNING *, ambiente AS environment, texto_orientacao AS rule`,
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
    await client.query(`UPDATE "JobsIA_validation_rules" SET active = false, status = 'APROVADO' WHERE id = $1`, [id]);
    const { rows } = await client.query(
      `UPDATE "JobsIA_validation_rules" SET active = true, status = 'PUBLICADO' WHERE id = $1 RETURNING *, ambiente AS environment, texto_orientacao AS rule`,
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
