import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole, logAudit, type AuthRequest } from '../middleware/auth';
import { aiCache } from './ai';

const router = Router();
router.use(requireAuth);

router.get('/active', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT content FROM "JobsIA_system_prompts"
       WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    res.json({ content: rows[0]?.content ?? null });
  } catch (err) {
    console.error('systemPrompts.getActive:', err);
    res.status(500).json({ message: 'Erro ao buscar prompt' });
  }
});

router.post('/', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { content } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE "JobsIA_system_prompts" SET is_active = false WHERE is_active = true`
    );
    await client.query(
      `INSERT INTO "JobsIA_system_prompts" (content, is_active) VALUES ($1, true)`,
      [content]
    );
    await client.query('COMMIT');
    // O prompt administrativo é uma sobreposição do contexto consolidado.
    // Limpar após o commit evita que a próxima conversa reutilize a versão anterior.
    aiCache.clear();
    const briefContent = content && content.length > 100 ? content.slice(0, 100) + '...' : content;
    await logAudit(req.userId, 'UPDATE_SYSTEM_PROMPT', { content: briefContent }, req.ip);
    res.status(201).json({ message: 'Prompt salvo' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('systemPrompts.save:', err);
    res.status(500).json({ message: 'Erro ao salvar prompt' });
  } finally {
    client.release();
  }
});

export default router;
