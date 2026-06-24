import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { requireAuth, requireRole, logAudit, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.created_at,
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
router.post('/', async (req: AuthRequest, res) => {
  const { name, email, password, role, is_active, matricula } = req.body as {
    name: string;
    email: string;
    password?: string;
    role?: string;
    is_active?: boolean;
    matricula?: string;
  };
  
  if (!name || !email || !password) {
    res.status(400).json({ message: 'Nome, email e senha são obrigatórios' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
    return;
  }

  const roleValue = role || 'SOLICITANTE';
  if (!['ADMIN', 'OPERADOR', 'SOLICITANTE'].includes(roleValue)) {
    res.status(400).json({ message: 'Papel inválido' });
    return;
  }

  const client = await pool.connect();
  try {
    const emailLower = email.toLowerCase();
    
    // Check if email already exists
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [emailLower]);
    if (existing.rows.length > 0) {
      res.status(409).json({ message: 'Este email já está cadastrado' });
      client.release();
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const activeValue = is_active !== false;
    
    await client.query('BEGIN');
    
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at`,
      [emailLower, password_hash, name, roleValue]
    );
    const user = rows[0];
    
    await client.query(
      `INSERT INTO "JobsIA_profiles" (user_id, name, email, is_active, matricula) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, is_active = EXCLUDED.is_active, matricula = EXCLUDED.matricula`,
      [user.id, user.name, user.email, activeValue, matricula || null]
    );

    await client.query('COMMIT');
    client.release();
    
    // Auditoria
    await logAudit(req.userId, 'CREATE_USER', {
      target_id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: activeValue
    }, req.ip);

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      is_active: activeValue,
      matricula: matricula || null
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      console.error('Erro no rollback:', rbErr);
    }
    client.release();
    console.error('users.create:', err);
    res.status(500).json({ message: 'Erro interno ao criar usuário' });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { name, email, password, role, is_active, matricula } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    is_active?: boolean;
    matricula?: string;
  };

  const client = await pool.connect();
  try {
    // Verificar se usuário existe
    const { rows: usersFound } = await client.query('SELECT * FROM users WHERE id = $1', [id]);
    if (usersFound.length === 0) {
      res.status(404).json({ message: 'Usuário não encontrado' });
      client.release();
      return;
    }
    const currentUser = usersFound[0];

    let passwordHash = currentUser.password_hash;
    if (password) {
      if (password.length < 6) {
        res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
        client.release();
        return;
      }
      passwordHash = await bcrypt.hash(password, 12);
    }

    const emailLower = email ? email.toLowerCase() : currentUser.email;
    if (email && emailLower !== currentUser.email) {
      const existing = await client.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [emailLower, id]);
      if (existing.rows.length > 0) {
        res.status(409).json({ message: 'Este email já está cadastrado em outra conta' });
        client.release();
        return;
      }
    }

    const nameValue = name !== undefined ? name : currentUser.name;
    const roleValue = role || currentUser.role;
    if (role && !['ADMIN', 'OPERADOR', 'SOLICITANTE'].includes(roleValue)) {
      res.status(400).json({ message: 'Papel inválido' });
      client.release();
      return;
    }

    const activeValue = is_active !== undefined ? is_active : true;

    await client.query('BEGIN');

    const { rows: updatedUserRows } = await client.query(
      `UPDATE users
       SET email = $1, password_hash = $2, name = $3, role = $4
       WHERE id = $5
       RETURNING id, email, name, role, created_at`,
      [emailLower, passwordHash, nameValue, roleValue, id]
    );
    const updatedUser = updatedUserRows[0];

    await client.query(
      `INSERT INTO "JobsIA_profiles" (user_id, name, email, is_active, matricula)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
       SET name = EXCLUDED.name, email = EXCLUDED.email, is_active = EXCLUDED.is_active, matricula = COALESCE(EXCLUDED.matricula, "JobsIA_profiles".matricula)`,
      [id, nameValue, emailLower, activeValue, matricula || null]
    );

    // Se o usuário foi inativado, deletar seus refresh tokens imediatamente
    if (activeValue === false) {
      await client.query(
        'DELETE FROM "JobsIA_refresh_tokens" WHERE user_id = $1',
        [id]
      );
    }

    await client.query('COMMIT');
    client.release();

    // Auditoria
    await logAudit(req.userId, 'UPDATE_USER', {
      target_id: id,
      email: emailLower,
      role: roleValue,
      is_active: activeValue
    }, req.ip);

    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      created_at: updatedUser.created_at,
      is_active: activeValue,
      matricula: matricula || null
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      console.error('Erro no rollback:', rbErr);
    }
    client.release();
    console.error('users.update:', err);
    res.status(500).json({ message: 'Erro interno ao atualizar usuário' });
  }
});

export default router;
