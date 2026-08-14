import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole, logAudit, type AuthRequest } from '../middleware/auth';
import { aiCache } from '../routes/ai';

const router = Router();
router.use(requireAuth);

function requiredText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM "JobsIA_dictionary_terms" WHERE active = true ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('dictionary.getAll:', err);
    res.status(500).json({ message: 'Erro ao buscar termos' });
  }
});

router.post('/', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const term = requiredText(req.body?.term);
  const definition = requiredText(req.body?.definition);
  const category = requiredText(req.body?.category);
  if (!term || !definition || !category) {
    res.status(400).json({ message: 'term, definition e category são obrigatórios.' });
    return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_dictionary_terms" (term, definition, category, status, version) 
       VALUES ($1, $2, $3, 'PUBLICADO', 1) RETURNING *`,
      [term, definition, category]
    );
    await logAudit(req.userId, 'CREATE_DICT_TERM', { id: rows[0].id, term, definition, category }, req.ip);
    if (aiCache) aiCache.clear();
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('dictionary.create:', err);
    res.status(500).json({ message: 'Erro ao criar termo' });
  }
});

router.put('/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const term = req.body?.term === undefined ? undefined : requiredText(req.body.term);
  const definition = req.body?.definition === undefined ? undefined : requiredText(req.body.definition);
  const category = req.body?.category === undefined ? undefined : requiredText(req.body.category);
  const hasInvalidField =
    (req.body?.term !== undefined && !term)
    || (req.body?.definition !== undefined && !definition)
    || (req.body?.category !== undefined && !category);
  if (hasInvalidField || (term === undefined && definition === undefined && category === undefined)) {
    res.status(400).json({ message: 'Informe ao menos um campo válido para atualização.' });
    return;
  }
  try {
    const { rows: current } = await pool.query('SELECT * FROM "JobsIA_dictionary_terms" WHERE id = $1', [id]);
    if (current.length === 0) { res.status(404).json({ message: 'Termo não encontrado' }); return; }

    const nextVersion = current[0].version + 1;
    if (current[0].active) {
      await pool.query('UPDATE "JobsIA_dictionary_terms" SET active = false WHERE id = $1', [id]);
    }
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_dictionary_terms" (term, definition, category, status, version, previous_version_id, active)
       VALUES ($1, $2, $3, 'PUBLICADO', $4, $5, true) RETURNING *`,
      [term || current[0].term, definition || current[0].definition, category || current[0].category, nextVersion, id]
    );
    await logAudit(req.userId, 'UPDATE_DICT_TERM', { id, new_id: rows[0].id, version: nextVersion }, req.ip);
    if (aiCache) aiCache.clear();
    res.json(rows[0]);
  } catch (err) {
    console.error('dictionary.update:', err);
    res.status(500).json({ message: 'Erro ao atualizar termo' });
  }
});

// Aprovar termo
router.post('/:id/approve', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE "JobsIA_dictionary_terms" SET status = 'APROVADO' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (rows.length === 0) { res.status(404).json({ message: 'Termo não encontrado' }); return; }
    await logAudit(req.userId, 'APPROVE_DICT_TERM', { id }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    console.error('dictionary.approve:', err);
    res.status(500).json({ message: 'Erro ao aprovar termo' });
  }
});

// Publicar termo (invalida versão anterior)
router.post('/:id/publish', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: term } = await client.query('SELECT * FROM "JobsIA_dictionary_terms" WHERE id = $1', [id]);
    if (term.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Termo não encontrado' });
      return;
    }

    if (term[0].previous_version_id) {
      await client.query(
        `UPDATE "JobsIA_dictionary_terms" SET active = false, status = 'APROVADO' WHERE id = $1`,
        [term[0].previous_version_id]
      );
    }

    const { rows } = await client.query(
      `UPDATE "JobsIA_dictionary_terms" SET status = 'PUBLICADO', active = true WHERE id = $1 RETURNING *`,
      [id]
    );
    await client.query('COMMIT');
    
    if (aiCache) aiCache.clear();

    await logAudit(req.userId, 'PUBLISH_DICT_TERM', { id }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('dictionary.publish:', err);
    res.status(500).json({ message: 'Erro ao publicar termo' });
  } finally {
    client.release();
  }
});

// Rollback do termo
router.post('/:id/rollback', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: current } = await client.query('SELECT * FROM "JobsIA_dictionary_terms" WHERE id = $1', [id]);
    if (current.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Termo não encontrado' });
      return;
    }

    const prevId = current[0].previous_version_id;
    if (!prevId) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Não existe versão anterior para fazer rollback' });
      return;
    }

    await client.query(`UPDATE "JobsIA_dictionary_terms" SET active = false, status = 'APROVADO' WHERE id = $1`, [id]);
    const { rows } = await client.query(
      `UPDATE "JobsIA_dictionary_terms" SET active = true, status = 'PUBLICADO' WHERE id = $1 RETURNING *`,
      [prevId]
    );
    await client.query('COMMIT');
    
    if (aiCache) aiCache.clear();

    await logAudit(req.userId, 'ROLLBACK_DICT_TERM', { id, restored_id: prevId }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('dictionary.rollback:', err);
    res.status(500).json({ message: 'Erro no rollback do termo' });
  } finally {
    client.release();
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    await pool.query('DELETE FROM "JobsIA_dictionary_terms" WHERE id = $1', [req.params.id]);
    await logAudit(req.userId, 'DELETE_DICT_TERM', { id: req.params.id }, req.ip);
    
    if (aiCache) aiCache.clear();

    res.status(204).send();
  } catch (err) {
    console.error('dictionary.remove:', err);
    res.status(500).json({ message: 'Erro ao remover termo' });
  }
});

router.post('/seed', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) FROM "JobsIA_dictionary_terms"');
  if (Number(rows[0].count) > 0) { res.json({ seeded: false }); return; }
  const items: { term: string; definition: string; category: string }[] = req.body.items ?? [];
  try {
    for (const item of items) {
      await pool.query(
        `INSERT INTO "JobsIA_dictionary_terms" (term, definition, category, status, version) 
         VALUES ($1, $2, $3, 'PUBLICADO', 1)`,
        [item.term, item.definition, item.category]
      );
    }
    await logAudit(req.userId, 'SEED_DICT_TERMS', { count: items.length }, req.ip);
    
    if (aiCache) aiCache.clear();

    res.json({ seeded: true });
  } catch (err) {
    console.error('dictionary.seed:', err);
    res.status(500).json({ message: 'Erro ao popular dicionário' });
  }
});

export default router;
