import express from 'express';
import cors from 'cors';

if (!process.env.JWT_SECRET) {
  console.error("ERRO CRÍTICO DE INICIALIZAÇÃO: A variável de ambiente JWT_SECRET não está definida.");
  process.exit(1);
}

import authRouter from './routes/auth';
import jobsRouter from './routes/jobs';
import checklistsRouter from './routes/checklists';
import normsRouter from './routes/norms';
import dictionaryRouter from './routes/dictionary';
import systemPromptsRouter from './routes/systemPrompts';
import usersRouter from './routes/users';
import aiRouter from './routes/ai';
import validationRouter from './routes/validation';

const app = express();

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
app.use('/api/validate-checklist', validationRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

export { app };
