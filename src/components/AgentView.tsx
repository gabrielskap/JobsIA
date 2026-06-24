import { useState, useRef, useEffect, ReactNode } from 'react';
import {
  Bot, User, Send, CheckCircle2, Copy, FileDown,
  Settings2, X, Save, MessageSquare, BookOpen, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { createChecklistPDF } from '../utils/pdfGenerator';
import { api } from '../lib/api';
import { systemPromptService } from '../services/systemPromptService';
import { checklistService } from '../services/checklistService';
import { jobService } from '../services/jobService';
import { buildCommand } from '../utils/commandBuilder';
import type { JobTypeWithParameters } from '../types/database';
import { dictionary, norms } from '../data/knowledgeBase';
import { useAuth } from '../contexts/AuthContext';

// ── SYSTEM PROMPT ────────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `Você é o Agente de IA de Jobs da DATAPREV (DIOT), especializado em automação de Jobs.
Sua missão: ajudar o usuário a configurar workloads através de conversa natural e inteligente.

## COMPORTAMENTO
1. Identifique o tipo de job desejado via conversa natural — sem menus numerados obrigatórios
2. Colete os parâmetros fazendo perguntas contextuais, uma de cada vez
3. Para parâmetros opcionais, informe que são opcionais e aceite "nenhum" para pular
4. Valide nomes de arquivo conforme a Norma N/PD/004/02 e avise sobre violações (mas permita continuar)
5. Quando tiver TODOS os parâmetros obrigatórios confirmados, chame a função generate_checklist
6. Após gerar o checklist, pergunte se o usuário precisa de mais alguma coisa

## NORMA N/PD/004/02 — NOMENCLATURA
- Prefixo obrigatório: 13 caracteres (T d SIS d SUB d 999)
- Máximo: 36 caracteres em LETRAS MAIÚSCULAS
- Unix/Linux: delimitador '.' (ponto) — ex: D.CNS.BOE.002.20251016
- Windows: delimitador '_' (underscore) — ex: D_SCO_ATU_005_BATIMENTO`;

const PROMPT_SUFFIX = `

## REGRAS CRÍTICAS
- Conduza a conversa de forma natural e empática
- NUNCA omita parâmetros obrigatórios
- Quando todos os dados estiverem coletados e confirmados, OBRIGATORIAMENTE chame generate_checklist
- Em collected_data, use exatamente os nomes dos parâmetros conforme definido no mapeamento de jobs abaixo`;

function buildPromptFromJobs(jobs: JobTypeWithParameters[]): string {
  if (jobs.length === 0) return BASE_SYSTEM_PROMPT + PROMPT_SUFFIX;

  const jobsSection = jobs.map(job => {
    const collectableParams = job.parameters.filter(
      p => p.parameter_type !== 'internal' && p.parameter_type !== 'generated'
    );
    const paramLines = collectableParams.length > 0
      ? collectableParams.map(p =>
          `  - "${p.name}" [${p.required ? 'OBRIGATÓRIO' : 'opcional'}] (${p.data_type}): ${p.description}${p.example_value ? ` (ex: ${p.example_value})` : ''}`
        ).join('\n')
      : '  (sem parâmetros para coletar)';

    return `### JOB TIPO ${job.id} — ${job.name}\nScript: ${job.script}\nDescrição: ${job.description}\nParâmetros:\n${paramLines}`;
  }).join('\n\n');

  return `${BASE_SYSTEM_PROMPT}\n\n## JOBS DISPONÍVEIS (${jobs.length} tipos)\n\n${jobsSection}${PROMPT_SUFFIX}`;
}

const DEFAULT_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + PROMPT_SUFFIX;

// ── FUNCTION DECLARATION ─────────────────────────────────────────────────────

const GENERATE_CHECKLIST_TOOL = {
  type: 'function' as const,
  function: {
    name: 'generate_checklist',
    description:
      'Gera o checklist PDF com os dados coletados. ' +
      'Chame APENAS quando tiver todos os parâmetros obrigatórios confirmados pelo usuário.',
    parameters: {
      type: 'object',
      properties: {
        job_type_id: {
          type: 'number',
          description: 'ID numérico do tipo de job (conforme mapeamento)',
        },
        job_name: {
          type: 'string',
          description: 'Nome descritivo do tipo de job',
        },
        collected_data: {
          type: 'object',
          description:
            'Dados coletados do usuário. Chaves = nomes exatos dos parâmetros conforme o mapeamento. Valores = dados fornecidos pelo usuário.',
        },
      },
      required: ['job_type_id', 'job_name', 'collected_data'],
    },
  },
};

// ── TYPES ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: 'agent' | 'user';
  text: string | ReactNode;
  isError?: boolean;
};

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type LIAResponse = {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
};

// ── UTILS ────────────────────────────────────────────────────────────────────

const formatMessageText = (text: string) => {
  let processedText = text.replace(/---/g, '');
  processedText = processedText.replace(/^-\s/gm, '• ');

  if (!processedText.includes('**')) return processedText;
  
  const parts = processedText.split('**');
  return parts.map((part, index) => {
    if (index % 2 !== 0) {
      return <strong key={index} className="font-bold">{part}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
};

// ── COMPONENT ────────────────────────────────────────────────────────────────

export function AgentView() {
  const { profile, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'agent',
      text: 'Olá! Sou o Agente de IA de Jobs da DATAPREV.\n\nPosso te ajudar a configurar qualquer tipo de workload. É só me dizer o que você precisa!',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [allJobs, setAllJobs] = useState<JobTypeWithParameters[]>([]);
  const [isKnowledgeExpanded, setIsKnowledgeExpanded] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function init() {
      const [savedPrompt, loadedJobs] = await Promise.all([
        systemPromptService.getActive(),
        jobService.getAll(),
      ]);
      if (loadedJobs.length > 0) {
        setAllJobs(loadedJobs);
        if (!savedPrompt) setSystemPrompt(buildPromptFromJobs(loadedJobs));
      }
      if (savedPrompt) setSystemPrompt(savedPrompt);
    }
    init();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (role: 'agent' | 'user', text: string | ReactNode, isError = false) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role, text, isError }]);
  };

  const handleSavePrompt = async () => {
    await systemPromptService.save(systemPrompt);
    setIsSettingsOpen(false);
    addMessage('agent', (
      <div className="flex items-center gap-2 text-blue-700 font-medium bg-blue-50 py-1 px-2 rounded-md border border-blue-100 text-xs">
        <CheckCircle2 className="w-3 h-3" />
        Instruções atualizadas com sucesso!
      </div>
    ));
  };

  const buildKnowledgeContext = () => {
    const dictText = dictionary.map(d => `- ${d.term} (${d.category}): ${d.definition}`).join('\n');
    const normsText = norms.rules.map(r => `- [${r.environment}] ${r.rule}`).join('\n');
    return `\n\n## BASE DE CONHECIMENTO\n\n### Dicionário:\n${dictText}\n\n### Normas (${norms.title}):\n${normsText}`;
  };

  // ── HANDLE FUNCTION CALL ──────────────────────────────────────────────────

  const handleGenerateChecklist = async (args: {
    job_type_id: number;
    job_name: string;
    collected_data: Record<string, string>;
  }) => {
    const { job_type_id, job_name, collected_data } = args;
    const job = allJobs.find(j => j.id === job_type_id);

    if (!job) {
      addMessage(
        'agent',
        `Não encontrei o Job Tipo ${job_type_id} na base de dados. Verifique se o job está cadastrado em /jobs.`,
        true
      );
      return;
    }

    const command = buildCommand(job.script, job.parameters, collected_data);

    const checklistType = job.script
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || `tipo_${job_type_id}`;
    const fileName = Object.values(collected_data)[0] || job_name;

    // Chamar backend para validar o checklist antes de salvar ou gerar PDF
    let validationResult;
    try {
      validationResult = await api.post<{
        passed: boolean;
        errors: Array<{ ruleCode: string; field: string; message: string; severity: string }>;
        warnings: Array<{ ruleCode: string; field: string; message: string; severity: string }>;
      }>('/validate-checklist', {
        job_type_id,
        data: {
          ...collected_data,
          file_name: fileName,
        },
      });
    } catch (err) {
      console.error('Erro ao validar checklist:', err);
    }

    const hasErrors = validationResult && validationResult.errors && validationResult.errors.length > 0;
    const hasWarnings = validationResult && validationResult.warnings && validationResult.warnings.length > 0;
    const isSuccess = !hasErrors;

    await checklistService.create({
      type: checklistType,
      data: {
        ...collected_data,
        __command: command,
        __job_name: job_name,
        __job_type_id: job_type_id,
      } as Record<string, unknown>,
      status: isSuccess ? 'Concluído' : 'Falha Validação',
      file_name: fileName,
      user_id: profile?.id,
    });

    const fields = Object.entries(collected_data)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ label: k, value: v }));

    const resultNode = (
      <div className="mt-2 space-y-4 w-full">
        {isSuccess ? (
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm bg-emerald-50 p-3 rounded-lg border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Checklist {job_name} (Tipo {job_type_id}) gerado com sucesso!</span>
          </div>
        ) : (
          <div className="space-y-2 bg-red-50 p-4 rounded-xl border border-red-200 text-red-900 text-sm">
            <div className="flex items-center gap-2 font-bold text-red-700">
              <X className="w-4 h-4 shrink-0" />
              <span>Falha na Validação de Conformidade (Norma N/PD/004/02)</span>
            </div>
            <p className="text-xs text-red-600 font-medium">O checklist foi salvo com status de "Falha Validação". A geração do PDF e comandos foi bloqueada.</p>
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-1">
              {validationResult?.errors.map((err, i) => (
                <div key={i} className="text-xs bg-red-100/50 p-2 rounded border border-red-200">
                  <span className="font-semibold text-red-800">[{err.ruleCode}] {err.field}:</span> {err.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasWarnings && (
          <div className="space-y-2 bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-900 text-sm">
            <div className="flex items-center gap-2 font-bold text-amber-700">
              <Settings2 className="w-4 h-4 shrink-0" />
              <span>Avisos de Validação (Revisão Recomendada)</span>
            </div>
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-1">
              {validationResult?.warnings.map((warn, i) => (
                <div key={i} className="text-xs bg-amber-100/50 p-2 rounded border border-amber-200">
                  <span className="font-semibold text-amber-800">[{warn.ruleCode}] {warn.field}:</span> {warn.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {isSuccess && (
          <>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-slate-300 relative group">
              <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => navigator.clipboard.writeText(command)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <span className="text-slate-500 text-xs">
                # Job Tipo {job_type_id} — {job_name}
              </span>
              <div className="text-emerald-400 mt-1 break-all">{command}</div>
            </div>
            <button
              onClick={() =>
                createChecklistPDF(
                  `${job_name.toUpperCase()} - TIPO ${job_type_id}`,
                  fields,
                  [{ label: `Job Tipo ${job_type_id} - ${job_name}`, command }],
                  `Checklist_Tipo${job_type_id}_${job_name.replace(/\s+/g, '_')}.pdf`
                )
              }
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-xl font-medium transition-colors shadow-sm text-sm shadow-emerald-600/20 active:scale-95"
            >
              <FileDown className="w-4 h-4" /> Baixar PDF do Checklist
            </button>
          </>
        )}
      </div>
    );

    addMessage('agent', resultNode);
  };

  // ── LIA API CALL ─────────────────────────────────────────────────────────────

  const callLIA = async (input: string, history: ChatMessage[]) => {
    setIsLoading(true);
    let updatedHistory: ChatMessage[] = history;

    try {
      const newUserMsg: ChatMessage = { role: 'user', content: input };
      const messages: ChatMessage[] = [...history, newUserMsg];
      const fullSystemPrompt = systemPrompt + buildKnowledgeContext();

      const response = await api.post<LIAResponse>('/ai/chat', {
        messages,
        tools: [GENERATE_CHECKLIST_TOOL],
        system: fullSystemPrompt,
      });

      const assistantMsg = response.choices[0].message;
      const assistantEntry: ChatMessage = {
        role: 'assistant',
        content: assistantMsg.content,
        tool_calls: assistantMsg.tool_calls,
      };
      updatedHistory = [...messages, assistantEntry];

      if (assistantMsg.tool_calls?.length) {
        for (const toolCall of assistantMsg.tool_calls) {
          if (toolCall.function.name === 'generate_checklist') {
            const args = JSON.parse(toolCall.function.arguments) as {
              job_type_id: number;
              job_name: string;
              collected_data: Record<string, string>;
            };
            await handleGenerateChecklist(args);

            const toolResultMsg: ChatMessage = {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success: true, message: 'Checklist gerado e disponível para download.' }),
            };
            updatedHistory.push(toolResultMsg);

            const followUp = await api.post<LIAResponse>('/ai/chat', {
              messages: updatedHistory,
              system: fullSystemPrompt,
            });

            const followUpText = followUp.choices[0].message.content;
            if (followUpText) {
              addMessage('agent', followUpText);
              updatedHistory.push({ role: 'assistant', content: followUpText });
            }
          }
        }
      } else if (assistantMsg.content) {
        addMessage('agent', assistantMsg.content);
      } else {
        addMessage('agent', 'Desculpe, não consegui processar sua solicitação. Pode tentar novamente?', true);
      }
    } catch (error) {
      console.error(error);
      addMessage('agent', 'Ocorreu um erro ao consultar a IA. Verifique o console para detalhes.', true);
    } finally {
      setIsLoading(false);
      setChatHistory(updatedHistory);
    }
  };

  // ── HANDLERS ─────────────────────────────────────────────────────────────────

  const handleRestart = () => {
    setChatHistory([]);
    setMessages([{
      id: Date.now().toString(),
      role: 'agent',
      text: 'Nova conversa iniciada! O que você precisa configurar hoje?',
    }]);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    const userInput = inputValue.trim();
    addMessage('user', userInput);
    setInputValue('');

    const lower = userInput.toLowerCase();
    if (['novo', 'nova', 'reiniciar', 'recomeçar', 'começar', 'inicio', 'início', 'menu'].includes(lower)) {
      setTimeout(handleRestart, 300);
      return;
    }

    const currentHistory = chatHistory;
    setTimeout(() => callLIA(userInput, currentHistory), 400);
  };

  // ── RENDER ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500 relative">
      {/* Settings Panel */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-20 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsSettingsOpen(false)}
          />
          <div className="relative w-80 bg-white shadow-2xl h-full border-l border-slate-200 animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800 font-bold">
                <Settings2 className="w-5 h-5 text-blue-600" />
                Configurar Comportamento
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare className="w-3 h-3" /> Instruções de IA (Prompt)
                </h4>
                <p className="text-xs text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100 italic">
                  Defina o tom de voz e regras que o agente deve seguir ao interagir.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="Instruções para o agente..."
                  className="w-full h-40 p-3 text-sm text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none font-medium leading-relaxed"
                />
              </div>


              <div className="space-y-2">
                <button
                  onClick={() => setIsKnowledgeExpanded(v => !v)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-3 h-3" /> Base de Conhecimento Ativa
                  </span>
                  {isKnowledgeExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <p className="text-xs text-slate-500 bg-emerald-50 p-3 rounded-lg border border-emerald-100 italic">
                  Estes dados são injetados automaticamente no contexto do agente.
                </p>

                {isKnowledgeExpanded && (
                  <div className="space-y-3">
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                        Dicionário
                        <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          {dictionary.length}
                        </span>
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {dictionary.map(d => (
                          <div key={d.term} className="text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">{d.term}</span>
                            <span className="text-slate-400 ml-1 text-[10px]">({d.category})</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                        Normas
                        <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          {norms.rules.length}
                        </span>
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {norms.rules.map((r, i) => (
                          <div key={i} className="text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">[{r.environment}]</span>{' '}
                            <span className="text-slate-500">
                              {r.rule.substring(0, 55)}{r.rule.length > 55 ? '…' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                        Jobs Cadastrados
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          {allJobs.length}
                        </span>
                      </p>
                      <div className="space-y-1">
                        {allJobs.map(j => (
                          <div key={j.id} className="text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">Tipo {j.id}:</span>{' '}
                            <span className="text-slate-500">{j.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100">
              <button
                onClick={handleSavePrompt}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
              >
                <Save className="w-5 h-5" />
                Salvar Instruções
              </button>
              <button
                onClick={() => setSystemPrompt(allJobs.length > 0 ? buildPromptFromJobs(allJobs) : DEFAULT_SYSTEM_PROMPT)}
                className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 font-medium py-2 transition-colors"
              >
                Resetar para padrão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-full">
            <Bot className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Agente de IA de Jobs</h2>
            <p className="text-xs text-slate-500">DATAPREV — Automação de Workloads</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-all"
            title="Nova conversa"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-slate-200 text-slate-500 rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
            title="Configurar Comportamento"
          >
            <Settings2 className="w-5 h-5" />
            <span className="hidden md:inline">Instruções</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
          >
            <div
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                msg.role === 'agent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {msg.role === 'agent' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div
              className={`rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : msg.isError
                  ? 'bg-red-50 text-red-800 border border-red-100 rounded-tl-sm'
                  : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-sm'
              }`}
            >
              {typeof msg.text === 'string' ? (
                <div className="whitespace-pre-wrap leading-relaxed">{formatMessageText(msg.text)}</div>
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 animate-pulse">
            <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-300" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-slate-50 border border-slate-100 rounded-tl-sm space-y-2">
              <div className="h-2 w-24 bg-slate-200 rounded-full" />
              <div className="h-2 w-32 bg-slate-200 rounded-full" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={isLoading ? 'Agente está pensando...' : 'Digite sua mensagem...'}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:hover:bg-blue-600 flex items-center gap-2 font-medium"
          >
            <span>{isLoading ? '...' : 'Enviar'}</span>
            {!isLoading && <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">
          Digite <span className="font-semibold text-slate-500">novo</span> para reiniciar a conversa
        </p>
      </div>
    </div>
  );
}
