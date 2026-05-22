import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import jobsRouter from './routes/jobs';
import checklistsRouter from './routes/checklists';
import normsRouter from './routes/norms';
import dictionaryRouter from './routes/dictionary';
import systemPromptsRouter from './routes/systemPrompts';
import usersRouter from './routes/users';
import aiRouter from './routes/ai';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/checklists', checklistsRouter);
app.use('/api/norms', normsRouter);
app.use('/api/dictionary', dictionaryRouter);
app.use('/api/system-prompts', systemPromptsRouter);
app.use('/api/users', usersRouter);
app.use('/api/ai', aiRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
