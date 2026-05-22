import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    res.status(400).json({ message: 'Email e senha são obrigatórios' });
    return;
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ message: 'Email ou senha inválidos' });
      return;
    }
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('auth/login:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };
  if (!name || !email || !password) {
    res.status(400).json({ message: 'Nome, email e senha são obrigatórios' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
    return;
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ message: 'Este email já está cadastrado' });
      return;
    }
    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [email.toLowerCase(), password_hash, name]
    );
    const user = rows[0];
    await pool.query(
      `INSERT INTO "JobsIA_profiles" (user_id, name, email) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [user.id, user.name, user.email]
    );
    res.status(201).json({ message: 'Conta criada com sucesso' });
  } catch (err) {
    console.error('auth/signup:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (!rows[0]) { res.status(404).json({ message: 'Usuário não encontrado' }); return; }
    const profile = await pool.query(
      'SELECT * FROM "JobsIA_profiles" WHERE user_id = $1',
      [req.userId]
    );
    res.json({ user: rows[0], profile: profile.rows[0] ?? null });
  } catch (err) {
    console.error('auth/me:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

export default router;
