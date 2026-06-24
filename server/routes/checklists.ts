import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { userId } = req.query as { userId?: string };
  try {
    let query = 'SELECT * FROM "JobsIA_checklists" ORDER BY created_at DESC';
    const params: unknown[] = [];
    if (userId) {
      query = 'SELECT * FROM "JobsIA_checklists" WHERE user_id = $1 ORDER BY created_at DESC';
      params.push(userId);
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('checklists.getAll:', err);
    res.status(500).json({ message: 'Erro ao buscar checklists' });
  }
});

router.post('/', async (req, res) => {
  const { conversation_id, type, data, status, user_id, file_name } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_checklists" (conversation_id, type, data, status, user_id, file_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [conversation_id ?? null, type, JSON.stringify(data), status, user_id ?? null, file_name ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('checklists.create:', err);
    res.status(500).json({ message: 'Erro ao criar checklist' });
  }
});

export default router;
