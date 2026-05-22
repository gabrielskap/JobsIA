import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.created_at,
             p.matricula, p.avatar_url, p.is_active
      FROM users u
      LEFT JOIN "JobsIA_profiles" p ON p.user_id = u.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('users.getAll:', err);
    res.status(500).json({ message: 'Erro ao buscar usuários' });
  }
});

export default router;
