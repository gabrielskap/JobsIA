import { Router } from 'express';
import bcrypt from 'bcryptjs';
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

router.post('/', async (req, res) => {
  const { name, email, password } = req.body as { name: string; email: string; password?: string };
  if (!name || !email || !password) {
    res.status(400).json({ message: 'Nome, email e senha são obrigatórios' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
    return;
  }

  try {
    const emailLower = email.toLowerCase();
    
    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [emailLower]);
    if (existing.rows.length > 0) {
      res.status(409).json({ message: 'Este email já está cadastrado' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    
    await pool.query('BEGIN');
    
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [emailLower, password_hash, name]
    );
    const user = rows[0];
    
    await pool.query(
      `INSERT INTO "JobsIA_profiles" (user_id, name, email) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [user.id, user.name, user.email]
    );

    await pool.query('COMMIT');
    
    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('users.create:', err);
    res.status(500).json({ message: 'Erro interno ao criar usuário' });
  }
});

export default router;
