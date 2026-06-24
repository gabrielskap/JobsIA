import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();

// Endpoint de agregação de auditoria / KPIs detalhados
router.get('/aggregations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    
    // SOLICITANTE não tem acesso a consolidados administrativos
    if (userRole === 'SOLICITANTE') {
      res.status(403).json({ message: 'Acesso negado' });
      return;
    }

    // 1. Falhas por regra
    const { rows: ruleFailures } = await pool.query(`
      SELECT rule_code, count(*) as count, max(mensagem) as message
      FROM "JobsIA_validation_results"
      WHERE passou = false
      GROUP BY rule_code
      ORDER BY count DESC
    `);

    // 2. Assuntos recorrentes (classificações de interação)
    const { rows: recurrentTopics } = await pool.query(`
      SELECT assunto, count(*) as count
      FROM "JobsIA_interaction_classifications"
      GROUP BY assunto
      ORDER BY count DESC
    `);

    // 3. Campos mais corrigidos (estimados através de feedbacks com correcao_operador)
    const { rows: commonCorrections } = await pool.query(`
      SELECT correcao_operador, count(*) as count
      FROM "JobsIA_user_feedback"
      WHERE correcao_operador IS NOT NULL AND correcao_operador <> ''
      GROUP BY correcao_operador
      ORDER BY count DESC
    `);

    // 4. Média de satisfação
    const { rows: feedbackAvg } = await pool.query(`
      SELECT round(avg(rating)::numeric, 1) as avg_rating, count(*) as count
      FROM "JobsIA_user_feedback"
    `);

    // 5. Histórico de auditoria administrativa geral
    const { rows: auditHistory } = await pool.query(`
      SELECT a.id, a.action, a.details, a.ip_address, a.created_at, u.name as user_name
      FROM "JobsIA_audit_logs" a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 50
    `);

    res.json({
      ruleFailures,
      recurrentTopics,
      commonCorrections,
      feedback: feedbackAvg[0] || { avg_rating: 0, count: 0 },
      auditHistory,
    });
  } catch (err) {
    console.error('interactions.aggregations:', err);
    res.status(500).json({ message: 'Erro ao processar agregação de auditoria' });
  }
});

// Endpoint para registrar feedback (acessível a qualquer papel, mas com restrições de propriedade para SOLICITANTE)
router.post('/feedback', requireAuth, async (req: AuthRequest, res) => {
  const { checklist_id, conversation_id, rating, comentario, correcao_operador } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ message: 'Rating obrigatório de 1 a 5 estrelas' });
    return;
  }

  try {
    // Se for SOLICITANTE, verificar se ele é dono do checklist ou da conversa
    if (req.user?.role === 'SOLICITANTE') {
      if (checklist_id) {
        const { rows } = await pool.query('SELECT user_id FROM "JobsIA_checklists" WHERE id = $1', [checklist_id]);
        if (rows.length === 0 || rows[0].user_id !== req.userId) {
          res.status(403).json({ message: 'Acesso negado: recurso pertence a outro usuário' });
          return;
        }
      } else if (conversation_id) {
        const { rows } = await pool.query('SELECT user_id FROM "JobsIA_conversations" WHERE id = $1', [conversation_id]);
        if (rows.length === 0 || rows[0].user_id !== req.userId) {
          res.status(403).json({ message: 'Acesso negado: recurso pertence a outro usuário' });
          return;
        }
      }
    }

    const { rows } = await pool.query(`
      INSERT INTO "JobsIA_user_feedback" (checklist_id, conversation_id, user_id, rating, comentario, correcao_operador)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [checklist_id || null, conversation_id || null, req.userId, rating, comentario || null, correcao_operador || null]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('interactions.feedback:', err);
    res.status(500).json({ message: 'Erro ao registrar feedback' });
  }
});

export default router;
