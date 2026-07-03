import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { validationEngine } from '../services/validationEngine';

const router = Router();

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { job_type_id, data, checklist_id } = req.body;

  if (job_type_id === undefined || job_type_id === null) {
    res.status(400).json({ message: 'O campo job_type_id é obrigatório.' });
    return;
  }

  if (!data || typeof data !== 'object') {
    res.status(400).json({ message: 'O campo data é obrigatório e deve ser um objeto.' });
    return;
  }

  try {
    const result = await validationEngine.validateChecklist(
      Number(job_type_id),
      data,
      req.userId,
      true, // Salvar o run e os resultados
      checklist_id
    );

    res.json(result);
  } catch (err) {
    console.error('validateChecklist.route:', err);
    res.status(500).json({ message: 'Erro ao executar a validação.' });
  }
});

export default router;
