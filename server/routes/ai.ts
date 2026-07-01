import express from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { pool } from '../db';
import fs from 'fs';
import path from 'path';

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
  
  let basePrompt = '';
  let promptVersion = 'default';
  
  if (promptRows.length > 0) {
    basePrompt = promptRows[0].content;
    promptVersion = String(promptRows[0].id);
  } else {
    // Buscar dinamicamente os tipos de job e parâmetros no banco
    const { rows: types } = await pool.query(
      'SELECT * FROM "JobsIA_types" ORDER BY id ASC'
    );
    const { rows: params } = await pool.query(
      'SELECT * FROM "JobsIA_parameters" WHERE active = true ORDER BY job_type_id ASC, order_index ASC'
    );

    const BASE_SYSTEM_PROMPT = `Você é o Agente de IA de Jobs da DATAPREV (DIOT), especializado em automação de Jobs.
Sua missão: ajudar o usuário a configurar workloads através de conversa natural e inteligente.

## COMPORTAMENTO
1. Identifique o tipo de job desejado via conversa natural — sem menus numerados obrigatórios.
2. Colete TODOS os parâmetros obrigatórios fazendo perguntas contextuais, uma de cada vez.
3. Para parâmetros opcionais, informe que são opcionais e aceite "nenhum" para pular.
4. Valide nomes de arquivo conforme a Norma N/PD/004/02 e avise sobre violações (mas permita continuar).
5. NUNCA chame a função generate_checklist se faltar qualquer parâmetro obrigatório do job (como Application, Operação, Servidor de Origem, Servidor de Destino, etc.). Se houver parâmetros obrigatórios pendentes, continue perguntando por eles um a um até obter tudo.
6. Quando tiver TODOS os parâmetros obrigatórios confirmados e fornecidos, chame a função generate_checklist.
7. Após gerar o checklist, pergunte se o usuário precisa de mais alguma coisa.

## NORMA N/PD/004/02 — NOMENCLATURA
- Prefixo obrigatório: 13 caracteres (T d SIS d SUB d 999)
- Máximo: 36 caracteres em LETRAS MAIÚSCULAS
- Unix/Linux: delimitador '.' (ponto) — ex: D.CNS.BOE.002.20251016
- Windows: delimitador '_' (underscore) — ex: D_SCO_ATU_005_BATIMENTO`;

    const PROMPT_SUFFIX = `

## REGRAS CRÍTICAS
- Conduza a conversa de forma natural e empática.
- NUNCA omita ou pule parâmetros obrigatórios do tipo de job. Pergunte por cada um deles antes de chamar generate_checklist.
- Apenas proponha ou execute a chamada de generate_checklist quando TODOS os dados obrigatórios estiverem devidamente coletados e confirmados.
- Em collected_data, use exatamente os nomes dos parâmetros conforme definido no mapeamento de jobs abaixo.`;

    const jobsSection = types.map((job: any) => {
      const collectableParams = params.filter(
        (p: any) => p.job_type_id === job.id && p.parameter_type !== 'internal' && p.parameter_type !== 'generated'
      );
      const paramLines = collectableParams.length > 0
        ? collectableParams.map((p: any) =>
            `  - "${p.name}" [${p.required ? 'OBRIGATÓRIO' : 'opcional'}] (${p.data_type}): ${p.description}${p.example_value ? ` (ex: ${p.example_value})` : ''}`
          ).join('\n')
        : '  (sem parâmetros para coletar)';

      return `### JOB TIPO ${job.id} — ${job.name}\nScript: ${job.script}\nDescrição: ${job.description}\nParâmetros:\n${paramLines}`;
    }).join('\n\n');

    basePrompt = `${BASE_SYSTEM_PROMPT}\n\n## JOBS DISPONÍVEIS (${types.length} tipos)\n\n${jobsSection}${PROMPT_SUFFIX}`;
  }

  // 2. Obter as normas publicadas e ativas
  const { rows: normsRows } = await pool.query(
    `SELECT id, ambiente, texto_orientacao, version FROM "JobsIA_validation_rules"
     WHERE status = 'PUBLICADO' AND ativo = true ORDER BY created_at ASC`
  );
  const normsVersion = normsRows.map(n => `${n.id}:${n.version}`).join('|') || 'v1';

  // 3. Obter o dicionário publicado e ativo
  const { rows: dictRows } = await pool.query(
    `SELECT id, term, category, definition, version FROM "JobsIA_dictionary_terms"
     WHERE status = 'PUBLICADO' AND active = true ORDER BY created_at ASC`
  );
  const dictVersion = dictRows.map(d => `${d.id}:${d.version}`).join('|') || 'v1';

  const dictText = dictRows.map(d => `- ${d.term} (${d.category}): ${d.definition}`).join('\n');
  const normsText = normsRows.map(r => `- [${r.ambiente}] ${r.texto_orientacao}`).join('\n');
  
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
    messages: any[];
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
    // Obter ou criar a conversa vinculada ao usuário
    let activeConversationId = conversation_id;
    if (!activeConversationId) {
      const convRes = await pool.query(
        `INSERT INTO "JobsIA_conversations" (flow_type, user_id)
         VALUES ($1, $2) RETURNING id`,
        ['transhost', req.userId]
      );
      activeConversationId = convRes.rows[0].id;
    }

    // Persistir a mensagem do usuário se for do tipo 'user'
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const textToSave = lastMsg.content || lastMsg.text || '';
      await pool.query(
        `INSERT INTO "JobsIA_messages" (conversation_id, role, text)
         VALUES ($1, $2, $3)`,
        [activeConversationId, 'user', textToSave]
      );
    }

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

    // Escrita de debug_payload removida para evitar que watchers de arquivos reiniciem o servidor/chat.

    console.log("ENVIANDO PAYLOAD PARA LIA API:", JSON.stringify(payload, null, 2));

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

    // Persistir a resposta da LIA API como 'agent'
    const assistantChoice = data.choices?.[0]?.message;
    if (assistantChoice && assistantChoice.content) {
      await pool.query(
        `INSERT INTO "JobsIA_messages" (conversation_id, role, text)
         VALUES ($1, $2, $3)`,
        [activeConversationId, 'agent', assistantChoice.content]
      );
    }

    // Registrar a execução na tabela de histórico
    try {
      await pool.query(
        `INSERT INTO "JobsIA_agent_executions" (conversation_id, user_id, prompt_version, norms_version, dictionary_version, model)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [activeConversationId || null, req.userId || null, promptVersion, normsVersion, dictVersion, model]
      );
    } catch (e) {
      console.error('Falha ao gravar JobsIA_agent_executions:', e);
    }

    res.json({ ...data, conversation_id: activeConversationId });
  } catch (err) {
    console.error('LIA API error:', err);
    res.status(500).json({ error: 'Erro ao contatar a LIA API' });
  }
});

// Rotas de conversas
router.get('/conversations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "JobsIA_conversations" WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('ai.conversations.list:', err);
    res.status(500).json({ message: 'Erro ao buscar conversas' });
  }
});

router.post('/conversations', requireAuth, async (req: AuthRequest, res) => {
  const { flow_type } = req.body as { flow_type?: string };
  try {
    const { rows } = await pool.query(
      `INSERT INTO "JobsIA_conversations" (flow_type, user_id)
       VALUES ($1, $2) RETURNING *`,
      [flow_type || 'transhost', req.userId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('ai.conversations.create:', err);
    res.status(500).json({ message: 'Erro ao criar conversa' });
  }
});

router.get('/conversations/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    // Verificar se a conversa pertence ao usuário
    const { rows: convRows } = await pool.query(
      `SELECT user_id FROM "JobsIA_conversations" WHERE id = $1`,
      [id]
    );
    if (convRows.length === 0) {
      res.status(404).json({ message: 'Conversa não encontrada' });
      return;
    }
    if (convRows[0].user_id !== req.userId) {
      res.status(403).json({ message: 'Acesso negado' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT * FROM "JobsIA_messages" WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('ai.conversations.messages:', err);
    res.status(500).json({ message: 'Erro ao buscar mensagens' });
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
