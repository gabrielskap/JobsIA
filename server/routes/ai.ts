import express from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { pool } from '../db';

const router = express.Router();

// Cache em memória simples para o system prompt e dados consolidados
class PromptCache {
  private cache: Map<string, { value: any; expiresAt: number }> = new Map();

  get(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: any, ttlMs: number = 60000) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  clear() {
    this.cache.clear();
  }
}

export const aiCache = new PromptCache();

// Função para montar o system prompt dinamicamente unindo o prompt ativo, normas publicadas e dicionário publicado
async function buildConsolidatedPrompt(): Promise<{ prompt: string; promptVersion: string; normsVersion: string; dictVersion: string }> {
  // 1. Obter o system prompt ativo
  const { rows: promptRows } = await pool.query(
    `SELECT id, content, created_at FROM "JobsIA_system_prompts"
     WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
  );
  const basePromptObj = promptRows[0] || { id: 'default', content: 'Você é o Agente de IA de Jobs da DATAPREV (DIOT).' };
  const basePrompt = basePromptObj.content;
  const promptVersion = String(basePromptObj.id);

  // 2. Obter as normas publicadas e ativas
  const { rows: normsRows } = await pool.query(
    `SELECT id, environment, rule, version FROM "JobsIA_norm_rules"
     WHERE status = 'PUBLICADO' AND active = true ORDER BY created_at ASC`
  );
  const normsVersion = normsRows.map(n => `${n.id}:${n.version}`).join('|') || 'v1';

  // 3. Obter o dicionário publicado e ativo
  const { rows: dictRows } = await pool.query(
    `SELECT id, term, category, definition, version FROM "JobsIA_dictionary_terms"
     WHERE status = 'PUBLICADO' AND active = true ORDER BY created_at ASC`
  );
  const dictVersion = dictRows.map(d => `${d.id}:${d.version}`).join('|') || 'v1';

  const dictText = dictRows.map(d => `- ${d.term} (${d.category}): ${d.definition}`).join('\n');
  const normsText = normsRows.map(r => `- [${r.environment}] ${r.rule}`).join('\n');
  
  const consolidated = `${basePrompt}

## BASE DE CONHECIMENTO (DINÂMICA)

### Dicionário de Termos:
${dictText || '(Nenhum termo publicado)'}

### Regras de Nomenclatura (Normas):
${normsText || '(Nenhuma norma publicada)'}`;

  return {
    prompt: consolidated,
    promptVersion,
    normsVersion,
    dictVersion
  };
}

router.post('/chat', requireAuth, async (req: AuthRequest, res) => {
  const { messages, tools, conversation_id } = req.body as {
    messages: unknown[];
    tools?: unknown[];
    conversation_id?: string;
  };

  const apiKey = process.env.LIA_API_KEY;
  const apiUrl = process.env.LIA_API_URL;
  const model = process.env.LIA_API_MODEL || 'claude-sonnet';

  if (!apiKey || !apiUrl) {
    res.status(500).json({ error: 'LIA API não configurada no servidor' });
    return;
  }

  try {
    // Obter do cache ou montar novo
    let promptData = aiCache.get('consolidated_prompt');
    if (!promptData) {
      promptData = await buildConsolidatedPrompt();
      aiCache.set('consolidated_prompt', promptData, 300000); // 5 minutos de cache
    }

    const { prompt: systemPrompt, promptVersion, normsVersion, dictVersion } = promptData;

    const allMessages = [{ role: 'system', content: systemPrompt }, ...messages];

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

    // Registrar a execução na tabela de histórico
    try {
      await pool.query(
        `INSERT INTO "JobsIA_agent_executions" (conversation_id, user_id, prompt_version, norms_version, dictionary_version, model)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [conversation_id || null, req.userId || null, promptVersion, normsVersion, dictVersion, model]
      );
    } catch (e) {
      console.error('Falha ao gravar JobsIA_agent_executions:', e);
    }

    res.json(data);
  } catch (err) {
    console.error('LIA API error:', err);
    res.status(500).json({ error: 'Erro ao contatar a LIA API' });
  }
});

// Endpoint de contexto consolidado para visualização/auditoria
router.get('/context', requireAuth, async (_req, res) => {
  try {
    const data = await buildConsolidatedPrompt();
    res.json(data);
  } catch (err) {
    console.error('ai.context:', err);
    res.status(500).json({ message: 'Erro ao buscar contexto consolidado' });
  }
});

export default router;
