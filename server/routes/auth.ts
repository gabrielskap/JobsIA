import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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
    
    // Buscar perfil completo
    const profileRes = await pool.query(
      'SELECT * FROM "JobsIA_profiles" WHERE user_id = $1',
      [user.id]
    );
    const profile = profileRes.rows[0] ?? null;

    // Gerar tokens
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    const refreshToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 dias

    await pool.query(
      `INSERT INTO "JobsIA_refresh_tokens" (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, refreshToken, expiresAt]
    );

    res.json({
      token,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      profile
    });
  } catch (err) {
    console.error('auth/login:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ message: 'Refresh token é obrigatório' });
    return;
  }

  try {
    // Buscar token no banco
    const { rows: tokenRows } = await pool.query(
      'SELECT * FROM "JobsIA_refresh_tokens" WHERE token = $1',
      [refreshToken]
    );
    const tokenRecord = tokenRows[0];
    if (!tokenRecord) {
      res.status(401).json({ message: 'Refresh token inválido ou revogado' });
      return;
    }

    // Verificar expiração
    if (new Date(tokenRecord.expires_at) < new Date()) {
      await pool.query('DELETE FROM "JobsIA_refresh_tokens" WHERE id = $1', [tokenRecord.id]);
      res.status(401).json({ message: 'Refresh token expirado' });
      return;
    }

    // Verificar se usuário está ativo
    const { rows: userRows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, COALESCE(p.is_active, true) as is_active
       FROM users u
       LEFT JOIN "JobsIA_profiles" p ON p.user_id = u.id
       WHERE u.id = $1`,
      [tokenRecord.user_id]
    );
    const user = userRows[0];
    if (!user) {
      res.status(401).json({ message: 'Usuário não encontrado' });
      return;
    }
    if (!user.is_active) {
      res.status(401).json({ message: 'Usuário inativo' });
      return;
    }

    // Gerar novos tokens
    const newToken = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    const newRefreshToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 dias

    // Deletar o antigo e salvar o novo
    await pool.query('DELETE FROM "JobsIA_refresh_tokens" WHERE id = $1', [tokenRecord.id]);
    await pool.query(
      `INSERT INTO "JobsIA_refresh_tokens" (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, newRefreshToken, expiresAt]
    );

    res.json({
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (err) {
    console.error('auth/refresh:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ message: 'Refresh token é obrigatório' });
    return;
  }
  try {
    await pool.query('DELETE FROM "JobsIA_refresh_tokens" WHERE token = $1', [refreshToken]);
    res.status(200).json({ message: 'Logout realizado com sucesso' });
  } catch (err) {
    console.error('auth/logout:', err);
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
    const emailLower = email.toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [emailLower]);
    if (existing.rows.length > 0) {
      res.status(409).json({ message: 'Este email já está cadastrado' });
      return;
    }
    const password_hash = await bcrypt.hash(password, 12);
    
    await pool.query('BEGIN');
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'SOLICITANTE')
       RETURNING id, email, name, role`,
      [emailLower, password_hash, name]
    );
    const user = rows[0];
    await pool.query(
      `INSERT INTO "JobsIA_profiles" (user_id, name, email, is_active) VALUES ($1, $2, $3, true)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, user.name, user.email]
    );
    await pool.query('COMMIT');
    
    res.status(201).json({ message: 'Conta criada com sucesso', user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('auth/signup:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
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
