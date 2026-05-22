import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM "JobsIA_dictionary_terms" ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('dictionary.getAll:', err);
    res.status(500).json({ message: 'Erro ao buscar termos' });
  }
});

router.post('/', async (req, res) => {
  const { term, definition, category } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_dictionary_terms" (term, definition, category) VALUES ($1, $2, $3) RETURNING *`,
      [term, definition, category]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('dictionary.create:', err);
    res.status(500).json({ message: 'Erro ao criar termo' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { term, definition, category } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE "JobsIA_dictionary_terms" SET term=$1, definition=$2, category=$3 WHERE id=$4 RETURNING *`,
      [term, definition, category, id]
    );
    if (rows.length === 0) { res.status(404).json({ message: 'Termo não encontrado' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error('dictionary.update:', err);
    res.status(500).json({ message: 'Erro ao atualizar termo' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM "JobsIA_dictionary_terms" WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error('dictionary.remove:', err);
    res.status(500).json({ message: 'Erro ao remover termo' });
  }
});

router.post('/seed', async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) FROM "JobsIA_dictionary_terms"');
  if (Number(rows[0].count) > 0) { res.json({ seeded: false }); return; }
  const items: { term: string; definition: string; category: string }[] = req.body.items ?? [];
  try {
    for (const item of items) {
      await pool.query(
        `INSERT INTO "JobsIA_dictionary_terms" (term, definition, category) VALUES ($1, $2, $3)`,
        [item.term, item.definition, item.category]
      );
    }
    res.json({ seeded: true });
  } catch (err) {
    console.error('dictionary.seed:', err);
    res.status(500).json({ message: 'Erro ao popular dicionário' });
  }
});

export default router;
