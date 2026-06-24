import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { validationEngine } from '../services/validationEngine';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    let query = 'SELECT * FROM "JobsIA_checklists" ORDER BY created_at DESC';
    const params: unknown[] = [];

    if (userRole === 'SOLICITANTE') {
      // Solicitante só acessa os próprios checklists
      query = 'SELECT * FROM "JobsIA_checklists" WHERE user_id = $1 ORDER BY created_at DESC';
      params.push(req.userId);
    } else {
      // ADMIN ou OPERADOR podem acessar checklists de outros usuários filtrando via query string
      const { userId } = req.query as { userId?: string };
      if (userId) {
        query = 'SELECT * FROM "JobsIA_checklists" WHERE user_id = $1 ORDER BY created_at DESC';
        params.push(userId);
      }
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('checklists.getAll:', err);
    res.status(500).json({ message: 'Erro ao buscar checklists' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  const { conversation_id, type, data, status, file_name } = req.body;
  const derivedUserId = req.userId;
  const derivedUserName = req.user?.name || '';

  try {
    const jobTypeId = Number(data?.__job_type_id || data?.__job_name?.match(/Tipo (\d+)/)?.[1]);
    let finalStatus = status || 'Concluído';
    let valRunId: string | undefined = undefined;

    if (jobTypeId) {
      const valResult = await validationEngine.validateChecklist(
        jobTypeId,
        data,
        req.userId,
        true
      );
      if (!valResult.passed) {
        finalStatus = 'Falha Validação';
      }
      valRunId = valResult.validationRunId;
    }

    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_checklists" (conversation_id, type, data, status, user_id, user_name, file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [conversation_id ?? null, type, JSON.stringify(data), finalStatus, derivedUserId, derivedUserName, file_name ?? null]
    );

    const savedChecklist = rows[0];

    if (valRunId) {
      await pool.query(
        `UPDATE "JobsIA_validation_runs" SET checklist_id = $1 WHERE id = $2`,
        [savedChecklist.id, valRunId]
      );
    }

    res.status(201).json(savedChecklist);
  } catch (err) {
    console.error('checklists.create:', err);
    res.status(500).json({ message: 'Erro ao criar checklist' });
  }
});

export default router;
