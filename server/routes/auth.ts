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
      `SELECT u.id, u.email, u.name, u.password_hash, u.role, COALESCE(p.is_active, true) as is_active
       FROM users u
       LEFT JOIN "JobsIA_profiles" p ON p.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ message: 'Email ou senha inválidos' });
      return;
    }
    if (!user.is_active) {
      res.status(401).json({ message: 'Usuário inativo' });
      return;
    }
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('auth/login:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.post('/signup', async (req, res) => {
  res.status(403).json({ message: 'Cadastro público desabilitado. Entre em contato com o administrador.' });
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
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
