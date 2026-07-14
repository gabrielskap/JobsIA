import React from 'react';
import { HelpCircle, BookOpen, Cpu, Settings, CheckCircle2, AlertCircle, Info, Play, Brain } from 'lucide-react';

export function HelpView() {
  return (
    <div className="w-full space-y-8 animate-fadeIn pb-12">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 rounded-3xl p-8 text-white shadow-xl shadow-blue-900/20 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 opacity-10">
          <HelpCircle className="w-96 h-96" />
        </div>
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold uppercase tracking-wider text-blue-100">
            <Info className="w-3.5 h-3.5" /> Manual do Sistema
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Como funciona o Cérebro do JobsIA?
          </h2>
          <p className="text-blue-100/90 max-w-3xl text-lg leading-relaxed">
            Entenda como as diretrizes de IA, regras de validação e termos do dicionário de dados se unem para orientar as respostas e decisões do agente automatizado.
          </p>
        </div>
      </div>

      {/* Passo a Passo de Acesso e Configuração */}
      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Play className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Passo a Passo de Acesso e Configuração</h3>
            <p className="text-sm text-slate-500">Siga as etapas abaixo para ajustar as regras e comportamentos do agente</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2">
          {/* Coluna 1: Comportamento */}
          <div className="space-y-4 border border-slate-100 rounded-xl p-6 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-xs font-bold bg-blue-600 text-white rounded-lg">ETAPA A</span>
              <h4 className="font-bold text-slate-800 text-base">Configurando as Instruções de IA (Comportamento)</h4>
            </div>
            <ol className="space-y-3.5 text-sm text-slate-600">
              <li className="flex gap-2">
                <span className="font-bold text-blue-600 shrink-0">1.</span>
                <span>No menu lateral esquerdo, clique em <strong>Agente IA (Chat)</strong> para abrir o painel principal.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-600 shrink-0">2.</span>
                <span>Na tela do chat, clique na aba <strong>"Instruções de IA (Prompt)"</strong> acima do painel de mensagens.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-600 shrink-0">3.</span>
                <span>Edite o texto do prompt conforme as orientações de condução, regras críticas e formato de perguntas desejados.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-600 shrink-0">4.</span>
                <span>Clique no botão azul <strong>Salvar Prompt</strong> na parte inferior do painel para aplicar a alteração instantaneamente.</span>
              </li>
            </ol>
          </div>

          {/* Coluna 2: Base de Conhecimento */}
          <div className="space-y-4 border border-slate-100 rounded-xl p-6 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-xs font-bold bg-emerald-600 text-white rounded-lg">ETAPA B</span>
              <h4 className="font-bold text-slate-800 text-base">Configurando a Base de Conhecimento Dinâmica</h4>
            </div>
            <ol className="space-y-3.5 text-sm text-slate-600">
              <li className="flex gap-2">
                <span className="font-bold text-emerald-600 shrink-0">1.</span>
                <span>Navegue até os menus <strong>Dicionário de Dados</strong> ou <strong>Norma N/PD/004/02</strong> no painel lateral.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-emerald-600 shrink-0">2.</span>
                <span>Insira novos termos/regras ou edite as existentes nos formulários fornecidos.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-emerald-600 shrink-0">3.</span>
                <span>Os novos itens salvos começarão em estado de <em>Rascunho</em> e não serão enviados à IA ainda.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-emerald-600 shrink-0">4.</span>
                <span>Para ativá-los no cérebro da IA, você deve obrigatoriamente clicar no botão <strong>Publicar</strong> na interface.</span>
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Grid de Seções e Componentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card: Configurar Comportamento */}
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">
                1. Configuração de Comportamento
              </h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                Define a espinha dorsal de atuação da IA. Contém instruções de como abordar o usuário, fluxo de perguntas e regras gerais de condução da conversa.
              </p>
            </div>
            <ul className="space-y-3.5 text-sm text-slate-600 pt-4">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Salvo e editado no menu principal do Agente.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Indica qual o fluxo correto para chamar a geração de checklist.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Card: Base de Conhecimento */}
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">
                2. Base de Conhecimento Dinâmica
              </h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                Composta pelo <strong>Dicionário de Dados</strong> e pelas <strong>Regras de Nomenclatura (Normas)</strong> que foram criadas, ativadas e publicadas.
              </p>
            </div>
            <ul className="space-y-3.5 text-sm text-slate-600 pt-4">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Fornece termos técnicos e definições específicas da Dataprev.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Ensina à IA os padrões de validação das normas de nomenclatura.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modelos de Linguagem e Qualidade */}
      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Brain className="w-5.5 h-5.5" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Modelos de Inteligência Artificial</h3>
            <p className="text-sm text-slate-500">Seleção e impacto no comportamento do agente</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2 text-sm text-slate-600">
          <div className="border border-slate-100 rounded-xl p-6 bg-slate-50/50 space-y-2">
            <h4 className="font-bold text-slate-800">Modelos Oficiais Dataprev</h4>
            <p className="leading-relaxed">
              O sistema utiliza exclusivamente os modelos de linguagem disponibilizados e homologados pela <strong>Dataprev</strong> (via LIA - Linguagem e Inteligência Artificial), garantindo conformidade, segurança de dados e soberania tecnológica da empresa.
            </p>
          </div>

          <div className="border border-slate-100 rounded-xl p-6 bg-slate-50/50 space-y-2">
            <h4 className="font-bold text-slate-800">Impacto na Qualidade</h4>
            <p className="leading-relaxed">
              Diferentes modelos de linguagem possuem diferentes capacidades de raciocínio, lógica estruturada e processamento textual. A escolha do modelo ativo pode influenciar diretamente na precisão da identificação do Job e no fluxo de perguntas.
            </p>
          </div>

          <div className="border border-slate-100 rounded-xl p-6 bg-slate-50/50 space-y-2">
            <h4 className="font-bold text-slate-800">Interação e Fluidez</h4>
            <p className="leading-relaxed">
              Modelos mais robustos conseguem lidar melhor com ambiguidade de termos e desvios de conversa, enquanto modelos menores tendem a ser mais rápidos, porém necessitam de respostas mais explícitas para entender corretamente as intenções do usuário.
            </p>
          </div>
        </div>
      </div>

      {/* Fluxo de Consolidação */}
      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Cpu className="w-5.5 h-5.5" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Consolidação do Prompt em Tempo Real</h3>
            <p className="text-sm text-slate-500">Como os dados são unidos antes de serem enviados para a IA</p>
          </div>
        </div>

        <div className="relative p-6 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
          <div className="space-y-6 relative z-10">
            {/* Bloco 1 */}
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-sm">
                1
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-700">Leitura do Prompt Base (Comportamento)</h4>
                <p className="text-sm text-slate-600">
                  O sistema busca no banco a instrução de IA ativa e a define como o início da mensagem de sistema.
                </p>
              </div>
            </div>

            {/* Linha conectora */}
            <div className="ml-4 pl-4 border-l border-dashed border-slate-300 space-y-6">
              {/* Bloco 2 */}
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0 text-sm">
                  2
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-slate-700">Anexo do Conhecimento Ativo</h4>
                  <p className="text-sm text-slate-600">
                    Todas as normas de nomenclatura e termos de dicionário marcados como <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">PUBLICADO</span> e ativos são injetados dinamicamente no final do prompt.
                  </p>
                </div>
              </div>

              {/* Bloco 3 */}
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-sm">
                  3
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-slate-700">Montagem Final do Prompt Consolidador</h4>
                  <p className="text-sm text-slate-600">
                    A IA recebe a junção de ambas as partes como instruções de sistema (<code className="bg-slate-200 px-1 py-0.5 rounded text-xs">system_prompt</code>), garantindo que ela se comporte conforme esperado e possua todo o conhecimento atualizado.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerta de Publicação */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4 text-amber-900">
        <AlertCircle className="w-6 h-6 shrink-0 text-amber-600 mt-0.5" />
        <div className="space-y-1 text-sm">
          <h4 className="font-bold text-base">Importante sobre Atualizações</h4>
          <p className="text-amber-800/90 leading-relaxed text-sm">
            Alterações salvas em <strong>Configurar Comportamento</strong> entram em vigor imediatamente na próxima mensagem iniciada.
            Para que novas regras de nomenclatura ou termos de dicionário façam efeito na conversa, lembre-se de clicar em <strong>Publicar</strong> no respectivo painel de edição.
          </p>
        </div>
      </div>
    </div>
  );
}
