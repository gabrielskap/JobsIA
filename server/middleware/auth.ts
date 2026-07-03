import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    is_active: boolean;
  };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token ausente' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
    
    // Buscar usuário e seu status de atividade
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, COALESCE(p.is_active, true) as is_active
       FROM users u
       LEFT JOIN "JobsIA_profiles" p ON p.user_id = u.id
       WHERE u.id = $1`,
      [payload.sub]
    );
    
    const user = rows[0];
    if (!user) {
      res.status(401).json({ message: 'Usuário não encontrado' });
      return;
    }
    
    if (!user.is_active) {
      res.status(401).json({ message: 'Usuário inativo' });
      return;
    }
    
    req.userId = user.id;
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token inválido' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ message: 'Não autenticado' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Acesso negado' });
      return;
    }
    next();
  };
}

export function requireOwnership(table: string, idParam = 'id', userIdField = 'user_id') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.userId) {
      res.status(401).json({ message: 'Não autenticado' });
      return;
    }
    
    // ADMIN tem acesso irrestrito
    if (req.user.role === 'ADMIN') {
      next();
      return;
    }
    
    const resourceId = req.params[idParam];
    if (!resourceId) {
      res.status(400).json({ message: 'ID do recurso não informado' });
      return;
    }
    
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM "${table}" WHERE id = $1 AND "${userIdField}" = $2`,
        [resourceId, req.userId]
      );
      
      if (rows.length === 0) {
        res.status(403).json({ message: 'Acesso negado: você não é proprietário deste recurso' });
        return;
      }
      
      next();
    } catch (err) {
      console.error(`Erro ao verificar propriedade na tabela ${table}:`, err);
      res.status(500).json({ message: 'Erro interno de autorização' });
    }
  };
}

export async function logAudit(userId: string | undefined, action: string, details: any, ipAddress?: string) {
  try {
    await pool.query(
      `INSERT INTO "JobsIA_audit_logs" (user_id, action, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [userId || null, action, JSON.stringify(details), ipAddress || null]
    );
  } catch (err) {
    console.error('Falha ao registrar log de auditoria no banco:', err);
  }
}
