import express from 'express';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

router.post('/chat', requireAuth, async (req, res) => {
  const { messages, tools, system } = req.body as {
    messages: unknown[];
    tools?: unknown[];
    system?: string;
  };

  const apiKey = process.env.LIA_API_KEY;
  const apiUrl = process.env.LIA_API_URL;
  const model = process.env.LIA_API_MODEL || 'claude-sonnet';

  if (!apiKey || !apiUrl) {
    res.status(500).json({ error: 'LIA API não configurada no servidor' });
    return;
  }

  try {
    const allMessages = system
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const payload: Record<string, unknown> = { model, messages: allMessages };
    if (tools && tools.length > 0) payload.tools = tools;

    const apiPath = process.env.LIA_API_PATH || '/api/v1/chat/completions';
    const response = await fetch(`${apiUrl}${apiPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      res.status(response.status).json({ error });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('LIA API error:', err);
    res.status(500).json({ error: 'Erro ao contatar a LIA API' });
  }
});

export default router;
