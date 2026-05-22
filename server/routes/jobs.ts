import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const { rows: types } = await pool.query(
      'SELECT * FROM "JobsIA_types" ORDER BY id ASC'
    );
    const { rows: params } = await pool.query(
      'SELECT * FROM "JobsIA_parameters" ORDER BY job_type_id ASC, order_index ASC'
    );
    const result = types.map((t: Record<string, unknown>) => ({
      ...t,
      parameters: params.filter((p: Record<string, unknown>) => p.job_type_id === t.id),
    }));
    res.json(result);
  } catch (err) {
    console.error('jobs.getAll:', err);
    res.status(500).json({ message: 'Erro ao buscar jobs' });
  }
});

router.post('/', async (req, res) => {
  const { job, parameters } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO "JobsIA_types" (id, name, script, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [job.id, job.name, job.script, job.description]
    );
    const createdJob = rows[0];
    let createdParams: unknown[] = [];
    if (parameters?.length > 0) {
      for (const p of parameters) {
        const { rows: pr } = await client.query(
          `INSERT INTO "JobsIA_parameters"
           (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [createdJob.id, p.flag ?? null, p.name, p.required, p.description,
           p.parameter_type, p.order_index, p.data_type, p.default_value ?? null,
           p.example_value ?? null, p.validation_regex ?? null, p.active ?? true]
        );
        createdParams.push(pr[0]);
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ ...createdJob, parameters: createdParams });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('jobs.create:', err);
    res.status(500).json({ message: 'Erro ao criar job' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { job, parameters } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM "JobsIA_parameters" WHERE job_type_id = $1', [id]);
    const { rows } = await client.query(
      `UPDATE "JobsIA_types" SET id=$1, name=$2, script=$3, description=$4
       WHERE id=$5 RETURNING *`,
      [job.id ?? id, job.name, job.script, job.description, id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Job não encontrado' });
      return;
    }
    const updatedJob = rows[0];
    let updatedParams: unknown[] = [];
    if (parameters?.length > 0) {
      for (const p of parameters) {
        const { rows: pr } = await client.query(
          `INSERT INTO "JobsIA_parameters"
           (job_type_id, flag, name, required, description, parameter_type, order_index, data_type, default_value, example_value, validation_regex, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [updatedJob.id, p.flag ?? null, p.name, p.required, p.description,
           p.parameter_type, p.order_index, p.data_type, p.default_value ?? null,
           p.example_value ?? null, p.validation_regex ?? null, p.active ?? true]
        );
        updatedParams.push(pr[0]);
      }
    }
    await client.query('COMMIT');
    res.json({ ...updatedJob, parameters: updatedParams });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('jobs.update:', err);
    res.status(500).json({ message: 'Erro ao atualizar job' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query('DELETE FROM "JobsIA_parameters" WHERE job_type_id = $1', [id]);
    await pool.query('DELETE FROM "JobsIA_types" WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('jobs.remove:', err);
    res.status(500).json({ message: 'Erro ao remover job' });
  }
});

router.post('/seed', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) FROM "JobsIA_types"');
    if (Number(rows[0].count) > 0) { res.json({ seeded: false }); return; }
    res.json({ seeded: true });
  } catch (err) {
    console.error('jobs.seed:', err);
    res.status(500).json({ message: 'Erro ao verificar seed' });
  }
});

export default router;
