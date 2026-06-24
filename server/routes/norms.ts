import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole, logAudit, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "JobsIA_norm_rules" ORDER BY created_at ASC');
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
      `INSERT INTO "JobsIA_norm_rules" (environment, rule) VALUES ($1, $2) RETURNING *`,
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
    const { rows } = await pool.query(
      `UPDATE "JobsIA_norm_rules" SET environment=$1, rule=$2 WHERE id=$3 RETURNING *`,
      [environment, rule, id]
    );
    if (rows.length === 0) { res.status(404).json({ message: 'Norma não encontrada' }); return; }
    await logAudit(req.userId, 'UPDATE_NORM', { id, environment, rule }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    console.error('norms.update:', err);
    res.status(500).json({ message: 'Erro ao atualizar norma' });
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    await pool.query('DELETE FROM "JobsIA_norm_rules" WHERE id = $1', [req.params.id]);
    await logAudit(req.userId, 'DELETE_NORM', { id: req.params.id }, req.ip);
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
        `INSERT INTO "JobsIA_norm_rules" (environment, rule) VALUES ($1, $2)`,
        [item.environment, item.rule]
      );
    }
    await logAudit(req.userId, 'SEED_NORMS', { count: items.length }, req.ip);
    res.json({ seeded: true });
  } catch (err) {
    console.error('norms.seed:', err);
    res.status(500).json({ message: 'Erro ao popular normas' });
  }
});

export default router;
