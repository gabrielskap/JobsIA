import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole, logAudit, type AuthRequest } from '../middleware/auth';
import { aiCache } from '../routes/ai';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "JobsIA_norm_rules" WHERE active = true ORDER BY created_at ASC');
    res.json(rows);
  } catch (err) {
    console.error('norms.getAll:', err);
    res.status(500).json({ message: 'Erro ao buscar normas' });
  }
});

router.post('/', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { environment, rule } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_norm_rules" (environment, rule, status, version) VALUES ($1, $2, 'RASCUNHO', 1) RETURNING *`,
      [environment, rule]
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
  const { environment, rule } = req.body;
  try {
    // Ao atualizar, criamos uma nova versão como RASCUNHO apontando para a anterior
    const { rows: current } = await pool.query('SELECT * FROM "JobsIA_norm_rules" WHERE id = $1', [id]);
    if (current.length === 0) { res.status(404).json({ message: 'Norma não encontrada' }); return; }
    
    const nextVersion = current[0].version + 1;
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_norm_rules" (environment, rule, status, version, previous_version_id)
       VALUES ($1, $2, 'RASCUNHO', $3, $4) RETURNING *`,
      [environment || current[0].environment, rule || current[0].rule, nextVersion, id]
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
      `UPDATE "JobsIA_norm_rules" SET status = 'APROVADO' WHERE id = $1 RETURNING *`,
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

// Publicar norma (invalida a publicação da versão anterior)
router.post('/:id/publish', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: norm } = await client.query('SELECT * FROM "JobsIA_norm_rules" WHERE id = $1', [id]);
    if (norm.length === 0) { res.status(404).json({ message: 'Norma não encontrada' }); return; }

    // Desativar e tirar da publicação a versão anterior se houver
    if (norm[0].previous_version_id) {
      await client.query(
        `UPDATE "JobsIA_norm_rules" SET active = false, status = 'APROVADO' WHERE id = $1`,
        [norm[0].previous_version_id]
      );
    }

    const { rows } = await client.query(
      `UPDATE "JobsIA_norm_rules" SET status = 'PUBLICADO', active = true WHERE id = $1 RETURNING *`,
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
    const { rows: current } = await client.query('SELECT * FROM "JobsIA_norm_rules" WHERE id = $1', [id]);
    if (current.length === 0) { res.status(404).json({ message: 'Norma não encontrada' }); return; }
    
    const prevId = current[0].previous_version_id;
    if (!prevId) {
      res.status(400).json({ message: 'Não existe versão anterior para fazer rollback' });
      return;
    }

    // Desativar versão atual e reativar/publicar a anterior
    await client.query(`UPDATE "JobsIA_norm_rules" SET active = false, status = 'APROVADO' WHERE id = $1`, [id]);
    const { rows } = await client.query(
      `UPDATE "JobsIA_norm_rules" SET active = true, status = 'PUBLICADO' WHERE id = $1 RETURNING *`,
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
    await pool.query('DELETE FROM "JobsIA_norm_rules" WHERE id = $1', [req.params.id]);
    await logAudit(req.userId, 'DELETE_NORM', { id: req.params.id }, req.ip);
    
    if (aiCache) aiCache.clear();

    res.status(204).send();
  } catch (err) {
    console.error('norms.remove:', err);
    res.status(500).json({ message: 'Erro ao remover norma' });
  }
});

router.post('/seed', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) FROM "JobsIA_norm_rules"');
  if (Number(rows[0].count) > 0) { res.json({ seeded: false }); return; }
  const items: { environment: string; rule: string }[] = req.body.items ?? [];
  try {
    for (const item of items) {
      await pool.query(
        `INSERT INTO "JobsIA_norm_rules" (environment, rule, status, version) VALUES ($1, $2, 'PUBLICADO', 1)`,
        [item.environment, item.rule]
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
