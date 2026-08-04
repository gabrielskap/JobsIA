import { useState, useRef, useEffect, ReactNode } from 'react';
import {
  Bot, User, Send, CheckCircle2, Copy, FileDown,
  Settings2, X, Save, MessageSquare, BookOpen, ChevronDown, ChevronUp, RefreshCw, History, Cpu
} from 'lucide-react';
import { downloadChecklistPDF } from '../utils/pdfGenerator';
import { api } from '../lib/api';
import { systemPromptService } from '../services/systemPromptService';
import { checklistService } from '../services/checklistService';
import { jobService } from '../services/jobService';
import { buildCommand } from '../utils/commandBuilder';
import type { JobTypeWithParameters } from '../types/database';
import { useAuth } from '../contexts/AuthContext';

const DEFAULT_SYSTEM_PROMPT = [
  'Diretrizes administrativas complementares para o Agente de IA de Jobs.',
  '',
  '- Use linguagem objetiva, cordial e adequada à operação.',
  '- Priorize o esclarecimento de dúvidas e a confirmação dos dados coletados.',
  '- Não adicione regras de nomenclatura, campos obrigatórios, genéricos, pontes ou validações fora das fontes publicadas no sistema.',
  '',
  'As regras obrigatórias, o catálogo de jobs, os parâmetros, o catálogo oficial de genéricos/pontes e as validações corporativas são aplicados pelo servidor e não podem ser substituídos por este texto.',
].join('\n');

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

const CATALOG_REFERENCE_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    name: { type: 'string' },
  },
  description: 'Referência publicada do catálogo, por código e/ou nome.',
};

const SCHEDULE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['one_time', 'datetime', 'recurrence'] },
    date: { type: 'string', description: 'Data YYYYMMDD ou YYYY-MM-DD para one_time.' },
    datetime: { type: 'string', description: 'Data e hora ISO ou YYYYMMDDTHHMM para datetime.' },
    recurrence: { type: 'string', description: 'Expressão de recorrência confirmada pelo usuário.' },
    time: { type: 'string', description: 'Horário HH:mm ou HH:mm:ss.' },
    timezone: { type: 'string', description: 'Fuso horário IANA; padrão America/Sao_Paulo.' },
  },
  required: ['kind'],
};

const CAPADOR_SCHEMA = {
  type: 'object',
  properties: {
    applicable: { type: 'boolean' },
    parameters: { type: 'object' },
    notes: { type: 'string' },
  },
  required: ['applicable'],
};

/**
 * Contrato v2 para checklists orientados a Application. O backend ainda
 * valida todos os dados; esta ferramenta apenas permite que a LIA envie uma
 * proposta estruturada depois de concluir a coleta conversacional.
 */
const GENERATE_APPLICATION_CHECKLIST_TOOL = {
  type: 'function' as const,
  function: {
    name: 'generate_application_checklist',
    description:
      'Finaliza um checklist de Application com um ou mais jobs. Chame somente depois de coletar e confirmar todos os dados obrigatórios, inclusive responsável operacional, genérico, ponte, servidores, agendamento e CAPADOR aplicável.',
    parameters: {
      type: 'object',
      properties: {
        application: {
          type: 'object',
          description: 'Dados compartilhados da Application no Workload.',
          properties: {
            name: { type: 'string', description: 'Nome da Application no Workload, não o nome do job, script ou arquivo.' },
            responsible_name: { type: 'string', description: 'Responsável operacional pela execução.' },
            requester_name: { type: 'string', description: 'Solicitante, quando diferente do usuário autenticado.' },
            area: { type: 'string' },
            contact: { type: 'string' },
            server_mode: { type: 'string', enum: ['shared', 'per_job', 'not_required'] },
            shared_server: { type: 'string' },
            schedule: SCHEDULE_SCHEMA,
          },
          required: ['name', 'responsible_name', 'server_mode'],
        },
        jobs: {
          type: 'array',
          description: 'Jobs da Application, na ordem de execução.',
          items: {
            type: 'object',
            properties: {
              sequence: { type: 'number' },
              job_type_id: { type: 'number' },
              generic: CATALOG_REFERENCE_SCHEMA,
              bridge: CATALOG_REFERENCE_SCHEMA,
              server: { type: 'string' },
              schedule: SCHEDULE_SCHEMA,
              parameters: { type: 'object' },
              capador: CAPADOR_SCHEMA,
            },
            required: ['sequence', 'job_type_id', 'generic', 'bridge', 'parameters'],
          },
        },
      },
      required: ['application', 'jobs'],
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

type ApplicationChecklistArgs = {
  request_id?: string;
  schema_version?: number;
  application: {
    name: string;
    responsible_name: string;
    requester_name?: string;
    area?: string;
    contact?: string;
    server_mode: 'shared' | 'per_job' | 'not_required';
    shared_server?: string;
    schedule?: Record<string, unknown>;
  };
  jobs: Array<{
    sequence: number;
    job_type_id: number;
    generic: string | { code?: string; name?: string };
    bridge: string | { code?: string; name?: string };
    server?: string;
    schedule?: Record<string, unknown>;
    parameters: Record<string, string | string[] | number | boolean | undefined>;
    capador?: {
      applicable: boolean;
      parameters?: Record<string, string | string[] | number | boolean | undefined>;
      notes?: string;
    };
  }>;
};

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string; name?: string };

type LIAResponse = {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
  conversation_id?: string;
};

// ── UTILS ────────────────────────────────────────────────────────────────────

const formatMessageText = (text: string): ReactNode => {
  // Limpar traços repetidos
  let cleanText = text.replace(/---/g, '');

  const lines = cleanText.split('\n');
  const elements: ReactNode[] = [];

  let currentTableRows: string[][] = [];
  let inTable = false;

  const renderCellText = (cellText: string) => {
    const trimmed = cellText.trim();
    if (!trimmed.includes('**')) return trimmed;
    const parts = trimmed.split('**');
    return parts.map((part, index) => {
      if (index % 2 !== 0) {
        return <strong key={index} className="font-bold">{part}</strong>;
      }
      return <span key={index}>{part}</span>;
    });
  };

  const flushTable = (key: string | number) => {
    if (currentTableRows.length === 0) return;

    // Uma linha separadora de markdown só contém caracteres como |, -, :, e espaços
    const isSeparator = (row: string[]) => {
      return row.every(cell => cell.trim() === '' || /^:?-+:?$/.test(cell.trim()));
    };

    // Filtrar linhas separadoras
    const validRows = currentTableRows.filter(row => !isSeparator(row));

    if (validRows.length === 0) {
      currentTableRows = [];
      return;
    }

    const headerRow = validRows[0];
    const bodyRows = validRows.slice(1);

    elements.push(
      <div key={`table-${key}`} className="my-3 overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {headerRow.map((cell, idx) => (
                <th key={idx} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                  {renderCellText(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {bodyRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-slate-50/50 transition-colors">
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-4 py-2.5 text-slate-700 font-medium whitespace-normal">
                    {renderCellText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    currentTableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableLine = line.includes('|');

    if (isTableLine) {
      inTable = true;
      let cells = line.split('|');
      // Remover primeiro e último se vazios (típico do markdown)
      if (cells[0].trim() === '') cells.shift();
      if (cells[cells.length - 1]?.trim() === '') cells.pop();

      // Filtrar células vazias extras caso venha algo como ||-|-|
      cells = cells.map(c => c.trim());
      currentTableRows.push(cells);
    } else {
      if (inTable) {
        flushTable(i);
        inTable = false;
      }

      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('###')) {
        const title = trimmedLine.replace(/^###\s*/, '');
        elements.push(
          <h3 key={`h3-${i}`} className="text-sm font-bold mt-4 mb-2 flex items-center gap-2">
            {renderCellText(title)}
          </h3>
        );
      } else if (trimmedLine.startsWith('##')) {
        const title = trimmedLine.replace(/^##\s*/, '');
        elements.push(
          <h2 key={`h2-${i}`} className="text-base font-bold mt-5 mb-3 flex items-center gap-2">
            {renderCellText(title)}
          </h2>
        );
      } else if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
        const item = trimmedLine.replace(/^[•\-*]\s*/, '');
        elements.push(
          <div key={`li-${i}`} className="flex items-start gap-2 my-1 pl-2">
            <span className="text-blue-500 mt-1.5 select-none text-[8px]">•</span>
            <span className="flex-1">{renderCellText(item)}</span>
          </div>
        );
      } else if (trimmedLine === '') {
        elements.push(<div key={`br-${i}`} className="h-2" />);
      } else {
        elements.push(
          <p key={`p-${i}`} className="my-1.5 leading-relaxed">
            {renderCellText(line)}
          </p>
        );
      }
    }
  }

  if (inTable) {
    flushTable('end');
  }

  return <div className="space-y-1">{elements}</div>;
};

// ── COMPONENT ────────────────────────────────────────────────────────────────

export function AgentView() {
  const { profile, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'agent',
      text: 'Olá! Sou o Hudson, Agente de IA de Jobs da DATAPREV.\n\nComo posso te ajudar?',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [allJobs, setAllJobs] = useState<JobTypeWithParameters[]>([]);
  const [isKnowledgeExpanded, setIsKnowledgeExpanded] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationsList, setConversationsList] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('lia_selected_model') || 'claude-sonnet';
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = async () => {
    try {
      const list = await api.get<any[]>('/ai/conversations');
      setConversationsList(list);
    } catch (err) {
      console.error('Erro ao buscar conversas:', err);
    }
  };

  const loadConversation = async (convId: string) => {
    try {
      setIsLoading(true);
      const msgs = await api.get<any[]>(`/ai/conversations/${convId}/messages`);
      setCurrentConversationId(convId);

      const chatMsgs: ChatMessage[] = msgs.map((m: any) => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.text,
      }));
      setChatHistory(chatMsgs);

      const uiMsgs: Message[] = msgs.map((m: any) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        isError: m.is_error,
      }));

      if (uiMsgs.length === 0) {
        setMessages([
          {
            id: '1',
            role: 'agent',
            text: 'Conversa vazia. Como posso te ajudar?',
          },
        ]);
      } else {
        setMessages(uiMsgs);
      }
      setIsHistoryOpen(false);
    } catch (err) {
      console.error('Erro ao carregar conversa:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    async function init() {
      const [savedPrompt, loadedJobs] = await Promise.all([
        systemPromptService.getActive(),
        jobService.getAll(),
      ]);
      if (loadedJobs.length > 0) {
        setAllJobs(loadedJobs);
        if (!savedPrompt) setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
      }
      if (savedPrompt) setSystemPrompt(savedPrompt);
      fetchConversations();

      // Buscar modelos disponíveis da LIA API
      try {
        const response = await api.get<{ data: { id: string; name?: string }[] }>('/ai/models');
        if (response && response.data) {
          setModels(response.data.map((m: any) => ({ id: m.id, name: m.name || m.id })));
        }
      } catch (err) {
        console.error('Erro ao buscar modelos:', err);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (profile?.selected_model) {
      setSelectedModel(profile.selected_model);
      localStorage.setItem('lia_selected_model', profile.selected_model);
    }
  }, [profile]);

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



  // ── HANDLE FUNCTION CALL ──────────────────────────────────────────────────

  const handleGenerateChecklist = async (
    args: {
      job_type_id: number;
      job_name: string;
      collected_data: Record<string, string>;
    },
    convId?: string | null
  ): Promise<{ success: boolean; status?: string; checklistId?: string; message?: string; errors?: any[]; warnings?: any[] }> => {
    const { job_type_id, job_name, collected_data } = args;
    const job = allJobs.find(j => j.id === job_type_id);

    if (!job) {
      const errMsg = `Não encontrei o Job Tipo ${job_type_id} na base de dados. Verifique se o job está cadastrado em /jobs.`;
      addMessage('agent', errMsg, true);
      return { success: false, message: errMsg };
    }

    // Gerar request_id (idempotency key) único
    const requestId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let savedChecklist = null;
    try {
      savedChecklist = await checklistService.create({
        request_id: requestId,
        job_type_id,
        collected_data,
        conversation_id: convId || currentConversationId || null,
      });
    } catch (err) {
      console.error('Erro na chamada do checklistService.create:', err);
    }

    // Verificar retorno do checklistService.create para não exibir sucesso se persistência falhar
    if (!savedChecklist) {
      const errMsg = 'Erro na persistência do checklist: A gravação falhou no servidor.';
      addMessage('agent', errMsg, true);
      return { success: false, message: errMsg };
    }

    const isSuccess = savedChecklist.status === 'Concluído';
    const hasErrors = savedChecklist.errors && savedChecklist.errors.length > 0;
    const hasWarnings = savedChecklist.warnings && savedChecklist.warnings.length > 0;
    const command = savedChecklist.command || '';

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
              {savedChecklist.errors?.map((err: any, i: number) => (
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
              {savedChecklist.warnings?.map((warn: any, i: number) => (
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
                downloadChecklistPDF(
                  savedChecklist.id,
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
    return { success: isSuccess, status: savedChecklist.status, checklistId: savedChecklist.id, errors: savedChecklist.errors, warnings: savedChecklist.warnings };
  };

  // ── LIA API CALL ─────────────────────────────────────────────────────────────

  const handleGenerateApplicationChecklist = async (
    args: ApplicationChecklistArgs,
    convId?: string | null
  ): Promise<{ success: boolean; status?: string; checklistId?: string; message?: string; errors?: any[]; warnings?: any[] }> => {
    const requestId = args.request_id?.trim() || (
      crypto.randomUUID
        ? crypto.randomUUID()
        : 'application-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9)
    );
    const applicationName = args.application?.name || 'Application';

    let savedChecklist = null;
    try {
      savedChecklist = await checklistService.createApplication({
        ...args,
        request_id: requestId,
        schema_version: 2,
        conversation_id: convId || currentConversationId || null,
      });
    } catch (err) {
      console.error('Erro na chamada do checklistService.createApplication:', err);
    }

    if (!savedChecklist) {
      const errMsg = 'Ainda não foi possível finalizar o checklist da Application. Revise os dados obrigatórios informados para Application, responsável, servidores, genéricos, pontes e agendamento.';
      addMessage('agent', errMsg, true);
      return { success: false, message: errMsg };
    }

    const isSuccess = savedChecklist.status === 'Concluído';
    const errors = savedChecklist.errors || [];
    const warnings = savedChecklist.warnings || [];
    const jobCount = args.jobs?.length || 0;

    const resultNode = (
      <div className="mt-2 space-y-4 w-full">
        {isSuccess ? (
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm bg-emerald-50 p-3 rounded-lg border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Checklist da Application {applicationName} gerado com sucesso para {jobCount} {jobCount === 1 ? 'job' : 'jobs'}.</span>
          </div>
        ) : (
          <div className="space-y-2 bg-red-50 p-4 rounded-xl border border-red-200 text-red-900 text-sm">
            <div className="flex items-center gap-2 font-bold text-red-700">
              <X className="w-4 h-4 shrink-0" />
              <span>Checklist da Application ainda possui pendências</span>
            </div>
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-1">
              {errors.map((err: any, i: number) => (
                <div key={i} className="text-xs bg-red-100/50 p-2 rounded border border-red-200">
                  <span className="font-semibold text-red-800">[{err.ruleCode || 'PENDÊNCIA'}] {err.field || 'Checklist'}:</span> {err.message || String(err)}
                </div>
              ))}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="space-y-1 bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-900 text-xs">
            {warnings.map((warn: any, i: number) => (
              <div key={i}><span className="font-semibold">[{warn.ruleCode || 'AVISO'}]</span> {warn.message || String(warn)}</div>
            ))}
          </div>
        )}

        {isSuccess && savedChecklist.id && (
          <button
            onClick={() =>
              downloadChecklistPDF(
                savedChecklist.id,
                'Checklist_' + applicationName.replace(/\s+/g, '_') + '.pdf'
              )
            }
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-xl font-medium transition-colors shadow-sm text-sm shadow-emerald-600/20 active:scale-95"
          >
            <FileDown className="w-4 h-4" /> Baixar PDF do Checklist
          </button>
        )}
      </div>
    );

    addMessage('agent', resultNode, !isSuccess);
    return {
      success: isSuccess,
      status: savedChecklist.status,
      checklistId: savedChecklist.id,
      errors,
      warnings,
    };
  };

  const callLIA = async (input: string, history: ChatMessage[]) => {
    setIsLoading(true);
    let updatedHistory: ChatMessage[] = history;

    try {
      const newUserMsg: ChatMessage = { role: 'user', content: input };
      const messages: ChatMessage[] = [...history, newUserMsg];

      const response = await api.post<LIAResponse>('/ai/chat', {
        messages,
        tools: [GENERATE_APPLICATION_CHECKLIST_TOOL],
        conversation_id: currentConversationId || undefined,
        model: selectedModel || undefined,
      });

      if (response.conversation_id) {
        setCurrentConversationId(response.conversation_id);
        // Atualizar lista em background sem travar
        fetchConversations();
      }

      const assistantMsg = response.choices[0].message;
      const assistantEntry: ChatMessage = {
        role: 'assistant',
        content: assistantMsg.content,
        tool_calls: assistantMsg.tool_calls,
      };
      updatedHistory = [...messages, assistantEntry];

      if (assistantMsg.tool_calls?.length) {
        for (const toolCall of assistantMsg.tool_calls) {
          if (
            toolCall.function.name === 'generate_checklist' ||
            toolCall.function.name === 'generate_application_checklist'
          ) {
            let success = false;
            let toolFeedback = "";
            try {
              const args = JSON.parse(toolCall.function.arguments);
              if (!args || typeof args !== 'object') {
                throw new Error("Formato inválido de argumentos para a função generate_checklist. Esperado 'job_type_id' e 'collected_data'.");
              }

              const result = toolCall.function.name === 'generate_application_checklist'
                ? await handleGenerateApplicationChecklist(args as ApplicationChecklistArgs, response.conversation_id || currentConversationId)
                : await handleGenerateChecklist(args, response.conversation_id || currentConversationId);
              if (result && result.success) {
                success = true;
                toolFeedback = `Checklist criado com sucesso. Status: ${result.status}. ID: ${result.checklistId}`;
              } else {
                success = false;
                const errorDetails = result?.errors?.map((e: any) => `- Campo "${e.field}": ${e.message} (Regra: ${e.ruleCode})`).join('\n') || '';
                const warningDetails = result?.warnings?.map((w: any) => `- ${w.message || String(w)}`).join('\n') || '';
                toolFeedback = `Falha na validação do checklist. Status: ${result?.status || 'Falha Validação'}.\nErros de validação:\n${errorDetails}\nAvisos e sugestões publicados:\n${warningDetails}\nPor favor, informe ao usuário sobre estes erros de validação e continue a conversa fazendo as perguntas necessárias para que ele corrija os valores inválidos. NÃO exiba mensagem de sucesso.`;
              }
            } catch (err: any) {
              console.error("Falha ao processar tool call:", err);
              addMessage('agent', `Falha ao processar proposta da IA: ${err.message || String(err)}`, true);
              toolFeedback = `Erro ao executar a função: ${err.message || String(err)}. Por favor, corrija os argumentos e tente novamente.`;
            }

            const toolResultMsg: ChatMessage = {
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: JSON.stringify({ success, message: toolFeedback }),
            };
            updatedHistory.push(toolResultMsg);

            const followUp = await api.post<LIAResponse>('/ai/chat', {
              messages: updatedHistory,
              conversation_id: response.conversation_id || currentConversationId || undefined,
              model: selectedModel || undefined,
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
    setCurrentConversationId(null);
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
          <div className="relative w-full max-w-[320px] sm:w-80 bg-white shadow-2xl h-full border-l border-slate-200 animate-in slide-in-from-right duration-300 flex flex-col">
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
                  <Cpu className="w-3 h-3 text-blue-600" /> Modelo de Linguagem (LIA)
                </h4>
                <p className="text-xs text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100 italic">
                  Selecione o modelo a ser utilizado para as respostas do agente.
                </p>
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedModel(val);
                      localStorage.setItem('lia_selected_model', val);
                      api.post('/ai/preferences', { selectedModel: val }).catch(err => {
                        console.error('Erro ao salvar preferência no banco:', err);
                      });
                    }}
                    className="w-full p-3 text-sm text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none pr-10 font-medium"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                    {models.length === 0 && (
                      <option value={selectedModel}>{selectedModel}</option>
                    )}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-500">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare className="w-3 h-3" /> Instruções de IA (Prompt)
                </h4>
                <p className="text-xs text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100 italic">
                  Defina diretrizes complementares de tom e operação. Regras obrigatórias, catálogo e validações corporativas são aplicados pelo servidor.
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
                onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 font-medium py-2 transition-colors"
              >
                Resetar para padrão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Panel */}
      {isHistoryOpen && (
        <div className="absolute inset-0 z-20 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsHistoryOpen(false)}
          />
          <div className="relative w-full max-w-[320px] sm:w-80 bg-white shadow-2xl h-full border-l border-slate-200 animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800 font-bold">
                <History className="w-5 h-5 text-blue-600" />
                Histórico de Chats
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {conversationsList.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center mt-8">Nenhuma conversa encontrada</p>
              ) : (
                conversationsList.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className={`w-full text-left p-3 rounded-xl border text-sm transition-all hover:bg-slate-50 flex flex-col gap-1 ${currentConversationId === c.id
                      ? 'border-blue-500 bg-blue-50/50 text-blue-900'
                      : 'border-slate-100 text-slate-700 bg-white'
                      }`}
                  >
                    <span className="font-semibold truncate">
                      Conversa ({c.flow_type || 'Geral'})
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(c.created_at).toLocaleString('pt-BR')}
                    </span>
                  </button>
                ))
              )}
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
            <h2 className="font-semibold text-slate-800">DATAPREV</h2>
            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <Cpu className="w-3 h-3" />
              {models.find(m => m.id === selectedModel)?.name || selectedModel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchConversations();
              setIsHistoryOpen(true);
            }}
            className="p-2 hover:bg-slate-200 text-slate-500 rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
            title="Histórico de conversas"
          >
            <History className="w-5 h-5" />
            <span className="hidden md:inline">Histórico</span>
          </button>
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
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'agent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                }`}
            >
              {msg.role === 'agent' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div
              className={`rounded-2xl px-4 py-3 ${msg.role === 'user'
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
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
