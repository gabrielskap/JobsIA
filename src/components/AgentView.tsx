import { useState, useRef, useEffect, ReactNode } from 'react';
import { Bot, User, Send, CheckCircle2, AlertCircle, Copy, FileDown, Settings2, X, Save, MessageSquare } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { GoogleGenAI } from "@google/genai";

const DEFAULT_SYSTEM_PROMPT = `Você é o Jobs IA (Hudson Virtual), um Agente de IA especializado em automação e preenchimento de checklists de Jobs da DIOT, com foco em Transhost.
Sua missão é guiar o usuário de forma técnica, precisa e amigável na criação de workloads para Unix, Windows e Mainframe.
Siga as normas N/PD/004/02 rigorosamente. Seja conciso e use termos técnicos da Dataprev.`;

type Message = {
  id: string;
  role: 'agent' | 'user';
  text: string | ReactNode;
  isError?: boolean;
};

type TranshostData = {
  fileName?: string;
  environment?: 'Unix/Linux' | 'Windows';
  operation?: 'GET' | 'PUT';
  fileType?: 'arq' | 'meta';
};

type SwadmData = {
  shellName?: string;
  params?: string;
  executor?: string;
};

type JavaData = {
  directory?: string;
  programName?: string;
  params?: string;
};

export function AgentView() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'agent',
      text: 'Olá! Sou o Hudson Virtual, seu Agente de IA para automação de Jobs.\n\nO que você deseja configurar hoje?\n1. Transferência de Arquivos (Transhost - Jobs 3 e 10)\n2. Execução de Job SWADM (Job Tipo 1)\n3. Execução de Programa JAVA (Job Tipo 9)'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [step, setStep] = useState<number>(0);
  const [flow, setFlow] = useState<'transhost' | 'swadm' | 'java' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Settings for System Prompt
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(() => {
    const saved = localStorage.getItem('hudson_system_prompt');
    return saved || DEFAULT_SYSTEM_PROMPT;
  });

  const [transhostData, setTranshostData] = useState<TranshostData>({});
  const [swadmData, setSwadmData] = useState<SwadmData>({});
  const [javaData, setJavaData] = useState<JavaData>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (role: 'agent' | 'user', text: string | ReactNode, isError = false) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role, text, isError }]);
  };

  const handleSavePrompt = () => {
    localStorage.setItem('hudson_system_prompt', systemPrompt);
    setIsSettingsOpen(false);
    addMessage('agent', (
      <div className="flex items-center gap-2 text-blue-700 font-medium bg-blue-50 py-1 px-2 rounded-md border border-blue-100 text-xs">
        <CheckCircle2 className="w-3 h-3" />
        Comportamento atualizado! Minhas instruções foram redefinidas.
      </div>
    ));
  };

  const callGemini = async (input: string) => {
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: input,
        config: {
          systemInstruction: systemPrompt,
        }
      });
      
      const text = response.text || "Desculpe, não consegui processar sua solicitação.";
      addMessage('agent', text);
    } catch (error) {
      console.error(error);
      addMessage('agent', "Ocorreu um erro ao consultar minha base de conhecimento de IA.", true);
    } finally {
      setIsLoading(false);
    }
  };

  const validateFileName = (name: string, env?: 'Unix/Linux' | 'Windows') => {
    if (name.length > 36) return 'O nome do arquivo excede 36 caracteres (Norma N/PD/004/02).';
    if (env === 'Unix/Linux' && !name.includes('.')) return 'Arquivos Unix/Linux devem usar "." (ponto) como delimitador.';
    if (env === 'Windows' && !name.includes('_')) return 'Arquivos Windows devem usar "_" (underscore) como delimitador.';
    return null;
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;

    const userInput = inputValue.trim();
    addMessage('user', userInput);
    setInputValue('');

    setTimeout(() => {
      processInput(userInput);
    }, 400);
  };

  const processInput = (input: string) => {
    // Step 0: Choose Flow
    if (step === 0) {
      if (input === '1') {
        setFlow('transhost');
        setStep(1);
        addMessage('agent', 'Iniciando fluxo de Transferência (Transhost). Qual é o nome do arquivo de origem?');
      } else if (input === '2') {
        setFlow('swadm');
        setStep(1);
        addMessage('agent', 'Iniciando fluxo SWADM. Qual é o nome do Shell SWAdm? (Ex: MeuJobSW)');
      } else if (input === '3') {
        setFlow('java');
        setStep(1);
        addMessage('agent', 'Iniciando fluxo de Programa JAVA. Qual é o diretório de residência do programa? (Ex: /usr/local/app)');
      } else {
        // Use IA for non-standard inputs
        callGemini(input);
      }
      return;
    }

    // Flow: Transhost (Jobs 3 e 10)
    if (flow === 'transhost') {
      switch (step) {
        case 1:
          const nameError = validateFileName(input);
          if (nameError && input.length > 36) {
            addMessage('agent', nameError, true);
            addMessage('agent', 'Por favor, informe um nome de arquivo válido:');
          } else {
            setTranshostData(prev => ({ ...prev, fileName: input }));
            addMessage('agent', `Arquivo "${input}" registrado. Qual é o ambiente de origem? (Digite "Unix" ou "Windows")`);
            setStep(2);
          }
          break;
        case 2:
          const envInput = input.toLowerCase();
          let env: 'Unix/Linux' | 'Windows' | null = null;
          if (envInput.includes('unix') || envInput.includes('linux')) env = 'Unix/Linux';
          else if (envInput.includes('windows')) env = 'Windows';

          if (!env) {
            addMessage('agent', 'Ambiente não reconhecido. Por favor, digite "Unix" ou "Windows".', true);
          } else {
            const envError = validateFileName(transhostData.fileName!, env);
            if (envError) {
              addMessage('agent', `Aviso de Norma: ${envError}`, true);
              addMessage('agent', 'Vamos prosseguir, mas recomendo revisar a nomenclatura depois. Qual é o sentido da operação? (Digite "GET" ou "PUT")');
            } else {
              addMessage('agent', `Ambiente ${env} confirmado. Qual é o sentido da operação? (Digite "GET" ou "PUT")`);
            }
            setTranshostData(prev => ({ ...prev, environment: env! }));
            setStep(3);
          }
          break;
        case 3:
          const opInput = input.toUpperCase();
          if (opInput !== 'GET' && opInput !== 'PUT') {
            addMessage('agent', 'Operação inválida. Por favor, digite "GET" ou "PUT".', true);
          } else {
            setTranshostData(prev => ({ ...prev, operation: opInput }));
            addMessage('agent', `Operação ${opInput} registrada. Qual o tipo de arquivo? (Digite "arq" ou "meta")`);
            setStep(4);
          }
          break;
        case 4:
          const typeInput = input.toLowerCase();
          if (typeInput !== 'arq' && typeInput !== 'meta') {
            addMessage('agent', 'Tipo inválido. Por favor, digite "arq" ou "meta".', true);
          } else {
            const finalData = { ...transhostData, fileType: typeInput as 'arq' | 'meta' };
            setTranshostData(finalData);
            generateTranshostResult(finalData);
            setStep(5);
          }
          break;
        default:
          addMessage('agent', 'O checklist já foi gerado. Se desejar criar outro, recarregue a página.');
          break;
      }
    }

    // Flow: SWADM (Job 1)
    if (flow === 'swadm') {
      switch (step) {
        case 1:
          setSwadmData(prev => ({ ...prev, shellName: input }));
          addMessage('agent', `Shell "${input}" registrado. Quais são os parâmetros do Shell? (Ex: FASE1|PARAM_A)`);
          setStep(2);
          break;
        case 2:
          setSwadmData(prev => ({ ...prev, params: input }));
          addMessage('agent', `Parâmetros registrados. Qual é a matrícula do executor?`);
          setStep(3);
          break;
        case 3:
          const finalData = { ...swadmData, executor: input };
          setSwadmData(finalData);
          generateSwadmResult(finalData);
          setStep(4);
          break;
        default:
          addMessage('agent', 'O checklist já foi gerado. Se desejar criar outro, recarregue a página.');
          break;
      }
    }

    // Flow: JAVA (Job 9)
    if (flow === 'java') {
      switch (step) {
        case 1:
          setJavaData(prev => ({ ...prev, directory: input }));
          addMessage('agent', `Diretório "${input}" registrado. Qual é o nome do programa JAVA (.jar)?`);
          setStep(2);
          break;
        case 2:
          if (!input.endsWith('.jar')) {
            addMessage('agent', 'Aviso: O nome do programa geralmente termina com .jar. Registrando mesmo assim.', true);
          }
          setJavaData(prev => ({ ...prev, programName: input }));
          addMessage('agent', `Programa "${input}" registrado. Quais são os parâmetros do programa? (Digite "nenhum" se não houver)`);
          setStep(3);
          break;
        case 3:
          const params = input.toLowerCase() === 'nenhum' ? '' : input;
          const finalData = { ...javaData, params };
          setJavaData(finalData);
          generateJavaResult(finalData);
          setStep(4);
          break;
        default:
          addMessage('agent', 'O checklist já foi gerado. Se desejar criar outro, recarregue a página.');
          break;
      }
    }
  };

  const handleDownloadTranshostPDF = (finalData: TranshostData) => {
    const doc = new jsPDF();
    const { fileName, operation, fileType, environment } = finalData;
    const listName = `${fileName}.SH.FASE.1.${operation}`;
    
    const job3Command = `/usr/local/bin/P.GEN.LST.010.SH -f${fileName} -A${listName} -t${fileType} -TTL`;
    const job10Command = `/usr/local/bin/P.GEN.THS.010.SH -a${listName}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('DATAPREV - Checklist de Execucao de Jobs', 20, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Gerado automaticamente pelo Agente de IA (Hudson Virtual)', 20, 28);
    doc.setDrawColor(200);
    doc.line(20, 32, 190, 32);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('1. DADOS GERAIS DA SOLICITACAO (TRANSHOST)', 20, 45);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Arquivo de Origem: ${fileName}`, 25, 55);
    doc.text(`Ambiente: ${environment}`, 25, 62);
    doc.text(`Sentido da Operacao: ${operation}`, 25, 69);
    doc.text(`Tipo de Arquivo: ${fileType}`, 25, 76);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2. ESPECIFICACAO DOS JOBS (WORKLOAD)', 20, 95);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Job 1 (Tipo 3) - Geracao de LISTA TRANS_HOSTS', 25, 105);
    doc.setFont('courier', 'normal');
    doc.setTextColor(0, 100, 0);
    doc.text(job3Command, 25, 112, { maxWidth: 160 });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text('Job 2 (Tipo 10) - Transferencia de Arquivos (GET/PUT)', 25, 130);
    doc.setFont('courier', 'normal');
    doc.setTextColor(0, 0, 150);
    doc.text(job10Command, 25, 137, { maxWidth: 160 });

    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150);
    doc.text(`Data de geracao: ${new Date().toLocaleString('pt-BR')}`, 20, 280);
    doc.save(`Checklist_Transhost_${fileName}.pdf`);
  };

  const handleDownloadSwadmPDF = (finalData: SwadmData) => {
    const doc = new jsPDF();
    const { shellName, params, executor } = finalData;
    const command = `/mainframe/sys/swadm/bridge/scripts/startJobs.bridge "${shellName}" "${params}" "${executor}"`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('DATAPREV - Checklist de Execucao de Jobs', 20, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Gerado automaticamente pelo Agente de IA (Hudson Virtual)', 20, 28);
    doc.setDrawColor(200);
    doc.line(20, 32, 190, 32);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('1. DADOS GERAIS DA SOLICITACAO (SWADM)', 20, 45);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nome do Shell: ${shellName}`, 25, 55);
    doc.text(`Parametros: ${params}`, 25, 62);
    doc.text(`Executor (Matricula): ${executor}`, 25, 69);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2. ESPECIFICACAO DO JOB (WORKLOAD)', 20, 95);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Job Tipo 1 - Execucao de JOBS TIPO SWADM', 25, 105);
    doc.setFont('courier', 'normal');
    doc.setTextColor(0, 100, 0);
    doc.text(command, 25, 112, { maxWidth: 160 });

    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150);
    doc.text(`Data de geracao: ${new Date().toLocaleString('pt-BR')}`, 20, 280);
    doc.save(`Checklist_SWADM_${shellName}.pdf`);
  };

  const handleDownloadJavaPDF = (finalData: JavaData) => {
    const doc = new jsPDF();
    const { directory, programName, params } = finalData;
    const paramString = params ? ` -P"${params}"` : '';
    const command = `/usr/local/bin/P.GEN.JVM.010.SH -d${directory} -p${programName}${paramString}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('DATAPREV - Checklist de Execucao de Jobs', 20, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Gerado automaticamente pelo Agente de IA (Hudson Virtual)', 20, 28);
    doc.setDrawColor(200);
    doc.line(20, 32, 190, 32);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('1. DADOS GERAIS DA SOLICITACAO (JAVA)', 20, 45);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Diretorio: ${directory}`, 25, 55);
    doc.text(`Programa: ${programName}`, 25, 62);
    doc.text(`Parametros: ${params || 'Nenhum'}`, 25, 69);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2. ESPECIFICACAO DO JOB (WORKLOAD)', 20, 95);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Job Tipo 9 - Execucao de PROGRAMAS JAVA', 25, 105);
    doc.setFont('courier', 'normal');
    doc.setTextColor(0, 100, 0);
    doc.text(command, 25, 112, { maxWidth: 160 });

    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150);
    doc.text(`Data de geracao: ${new Date().toLocaleString('pt-BR')}`, 20, 280);
    doc.save(`Checklist_JAVA_${programName}.pdf`);
  };

  const generateTranshostResult = (finalData: TranshostData) => {
    const { fileName, operation, fileType } = finalData;
    const listName = `${fileName}.SH.FASE.1.${operation}`;
    const job3Command = `/usr/local/bin/P.GEN.LST.010.SH -f${fileName} -A${listName} -t${fileType} -TTL`;
    const job10Command = `/usr/local/bin/P.GEN.THS.010.SH -a${listName}`;

    const resultNode = (
      <div className="mt-4 space-y-4 w-full">
        <div className="flex items-center gap-2 text-emerald-700 font-semibold">
          <CheckCircle2 className="w-5 h-5" />
          <span>Checklist Transhost gerado com sucesso!</span>
        </div>
        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-slate-300 relative group">
          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => navigator.clipboard.writeText(`${job3Command}\n${job10Command}`)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div className="mb-2">
            <span className="text-slate-500"># Job 1 (Tipo 3)</span>
            <div className="text-emerald-400 mt-1 break-all">{job3Command}</div>
          </div>
          <div className="mt-4">
            <span className="text-slate-500"># Job 2 (Tipo 10)</span>
            <div className="text-blue-400 mt-1 break-all">{job10Command}</div>
          </div>
        </div>
        <button onClick={() => handleDownloadTranshostPDF(finalData)} className="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-medium transition-colors shadow-sm">
          <FileDown className="w-5 h-5" /> Baixar PDF do Checklist
        </button>
      </div>
    );
    addMessage('agent', resultNode);
  };

  const generateSwadmResult = (finalData: SwadmData) => {
    const command = `/mainframe/sys/swadm/bridge/scripts/startJobs.bridge "${finalData.shellName}" "${finalData.params}" "${finalData.executor}"`;

    const resultNode = (
      <div className="mt-4 space-y-4 w-full">
        <div className="flex items-center gap-2 text-emerald-700 font-semibold">
          <CheckCircle2 className="w-5 h-5" />
          <span>Checklist SWADM gerado com sucesso!</span>
        </div>
        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-slate-300 relative group">
          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => navigator.clipboard.writeText(command)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div>
            <span className="text-slate-500"># Job Tipo 1 (SWADM)</span>
            <div className="text-emerald-400 mt-1 break-all">{command}</div>
          </div>
        </div>
        <button onClick={() => handleDownloadSwadmPDF(finalData)} className="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-medium transition-colors shadow-sm">
          <FileDown className="w-5 h-5" /> Baixar PDF do Checklist
        </button>
      </div>
    );
    addMessage('agent', resultNode);
  };

  const generateJavaResult = (finalData: JavaData) => {
    const paramString = finalData.params ? ` -P"${finalData.params}"` : '';
    const command = `/usr/local/bin/P.GEN.JVM.010.SH -d${finalData.directory} -p${finalData.programName}${paramString}`;

    const resultNode = (
      <div className="mt-4 space-y-4 w-full">
        <div className="flex items-center gap-2 text-emerald-700 font-semibold">
          <CheckCircle2 className="w-5 h-5" />
          <span>Checklist JAVA gerado com sucesso!</span>
        </div>
        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-slate-300 relative group">
          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => navigator.clipboard.writeText(command)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div>
            <span className="text-slate-500"># Job Tipo 9 (JAVA)</span>
            <div className="text-emerald-400 mt-1 break-all">{command}</div>
          </div>
        </div>
        <button onClick={() => handleDownloadJavaPDF(finalData)} className="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-medium transition-colors shadow-sm">
          <FileDown className="w-5 h-5" /> Baixar PDF do Checklist
        </button>
      </div>
    );
    addMessage('agent', resultNode);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500 relative">
      {/* Settings Side Panel */}
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
              <button onClick={() => setIsSettingsOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare className="w-3 h-3" /> Instuções de IA (Prompt)
                </h4>
                <p className="text-xs text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100 italic">
                  Defina o "vibe", tom de voz e regras específicas que o Hudson Virtual deve seguir ao interagir fora dos fluxos fixos.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Instruções para o agente..."
                  className="w-full h-[calc(100vh-22rem)] p-3 text-sm text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none font-medium leading-relaxed"
                />
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

      <div className="bg-slate-50 border-b border-slate-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-full">
            <Bot className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Agente de IA (Hudson Virtual)</h2>
            <p className="text-xs text-slate-500">Assistente de preenchimento de Jobs</p>
          </div>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 hover:bg-slate-200 text-slate-500 rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
          title="Configurar Comportamento"
        >
          <Settings2 className="w-5 h-5" />
          <span className="hidden md:inline">Instruções</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'agent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
              {msg.role === 'agent' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className={`rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : msg.isError ? 'bg-red-50 text-red-800 border border-red-100 rounded-tl-sm' : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-sm'}`}>
              {msg.isError && <AlertCircle className="w-4 h-4 inline-block mr-2 mb-0.5" />}
              {typeof msg.text === 'string' ? <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p> : msg.text}
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

      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isLoading ? "Hudson está pensando..." : (flow === 'transhost' && step >= 5) || (flow === 'swadm' && step >= 4) || (flow === 'java' && step >= 4) ? "Checklist concluído." : "Digite sua resposta..."}
            disabled={isLoading || (flow === 'transhost' && step >= 5) || (flow === 'swadm' && step >= 4) || (flow === 'java' && step >= 4)}
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading || (flow === 'transhost' && step >= 5) || (flow === 'swadm' && step >= 4) || (flow === 'java' && step >= 4)}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:hover:bg-blue-600 flex items-center gap-2 font-medium"
          >
            <span>{isLoading ? '...' : 'Enviar'}</span>
            {!isLoading && <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
