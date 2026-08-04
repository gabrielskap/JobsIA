import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  FileCode,
  HelpCircle,
  Info,
  MessageSquare,
  Play,
  Server,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';

const setupOrder = [
  {
    step: '1',
    title: 'Mapeie os jobs',
    description: 'Cadastre scripts e parâmetros antes de configurar a aplicabilidade das regras.',
    to: '/jobs',
    label: 'Mapeamento de Jobs',
    icon: Server,
    color: 'border-purple-100 bg-purple-50 text-purple-700 hover:border-purple-300',
  },
  {
    step: '2',
    title: 'Atualize o catálogo oficial',
    description: 'Mantenha os genéricos e as pontes aprovados pela DIOT.',
    to: '/catalogo-oficial',
    label: 'Catálogo Oficial',
    icon: Database,
    color: 'border-cyan-100 bg-cyan-50 text-cyan-800 hover:border-cyan-300',
  },
  {
    step: '3',
    title: 'Defina as regras',
    description: 'Registre a orientação por ambiente e delimite sua aplicação por tipo de job.',
    to: '/normas',
    label: 'Regras de Nomenclatura',
    icon: FileCode,
    color: 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-300',
  },
  {
    step: '4',
    title: 'Mantenha o dicionário',
    description: 'Explique siglas e termos que fazem parte do vocabulário da operação.',
    to: '/dicionario',
    label: 'Dicionário de Dados',
    icon: BookOpen,
    color: 'border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-300',
  },
  {
    step: '5',
    title: 'Ajuste as instruções',
    description: 'Defina o tom e a orientação complementar do Agente IA.',
    to: '/agente',
    label: 'Agente IA',
    icon: Settings,
    color: 'border-indigo-100 bg-indigo-50 text-indigo-700 hover:border-indigo-300',
  },
] as const;

function SectionHeader({
  icon: Icon,
  step,
  title,
  description,
  iconClass,
}: {
  icon: typeof HelpCircle;
  step: string;
  title: string;
  description: string;
  iconClass: string;
}) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{step}</p>
        <h3 className="mt-1 text-xl font-bold text-slate-800 sm:text-2xl">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-slate-600">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
        {number}
      </span>
      <span>{children}</span>
    </li>
  );
}

export function HelpView() {
  return (
    <div className="w-full space-y-8 pb-12 animate-fadeIn">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-indigo-700 to-slate-900 p-7 text-white shadow-xl shadow-blue-950/20 sm:p-9">
        <div className="absolute -bottom-20 -right-16 opacity-10">
          <HelpCircle className="h-80 w-80" />
        </div>
        <div className="relative max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-100 backdrop-blur-sm">
            <Info className="h-3.5 w-3.5" /> Guia de configuração
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Central de Ajuda do JobsIA</h2>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-blue-100/90 sm:text-lg">
            Configure o catálogo de jobs, as regras de nomenclatura, o dicionário de dados e as diretrizes complementares do agente com base nos recursos disponíveis nesta versão do sistema.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1 text-sm leading-relaxed">
            <h3 className="font-bold">Permissões e publicação</h3>
            <p className="text-amber-900/85">
              Criar, editar ou excluir tipos de job, regras, termos e itens do catálogo exige perfil <strong>Administrador</strong>. Regras e termos só entram no contexto da IA quando estão <strong>PUBLICADOS</strong> e ativos. Nesta versão da interface, aprovação, publicação e reversão são conduzidas pelo fluxo administrativo responsável; salvar um item não o ativa automaticamente no agente.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="ordem-configuracao" className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Play className="h-4 w-4 fill-current" />
          </div>
          <div>
            <h3 id="ordem-configuracao" className="text-xl font-bold text-slate-800">Ordem recomendada de configuração</h3>
            <p className="text-sm text-slate-500">Comece pelo catálogo operacional; em seguida, delimite validações e vocabulário.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {setupOrder.map(({ step, title, description, to, label, icon: Icon, color }) => (
            <Link
              key={to}
              to={to}
              className={`group rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${color}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-lg bg-white/80 px-2 py-1 text-xs font-extrabold shadow-sm">ETAPA {step}</span>
                <Icon className="h-5 w-5" />
              </div>
              <h4 className="mt-5 font-bold text-slate-800">{title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">
                Abrir {label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <SectionHeader
          icon={Server}
          step="Etapa 1"
          title="Como configurar o Mapeamento de Jobs"
          description="O mapeamento é a fonte de verdade para os scripts e parâmetros que o agente pode usar e incluir no checklist. Cadastre os tipos antes de restringir regras por tipo de job."
          iconClass="bg-purple-50 text-purple-600"
        />
        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-5 sm:p-6">
            <h4 className="font-bold text-slate-800">Passo a passo</h4>
            <ol className="mt-4 space-y-4">
              <Step number={1}>Abra <Link className="font-semibold text-purple-700 underline underline-offset-2" to="/jobs">Mapeamento de Jobs</Link> e selecione <strong>Novo Tipo de Job</strong>.</Step>
              <Step number={2}>Informe um <strong>Tipo ID</strong> numérico e único, o <strong>Nome do Job</strong>, o <strong>Script Principal</strong> e uma descrição objetiva da finalidade.</Step>
              <Step number={3}>Em <strong>Parâmetros do Script</strong>, use <strong>Add Parâmetro</strong> para registrar todos os dados necessários para montar o comando e orientar a conversa.</Step>
              <Step number={4}>Defina obrigatoriedade, ordem, tipo de dado, valor padrão, exemplo e expressão de validação quando aplicável. Deixe ativo apenas o que deve ficar disponível para a IA.</Step>
              <Step number={5}>Revise a lista completa e clique em <strong>Criar Tipo de Job</strong> ou <strong>Salvar Alterações</strong>.</Step>
            </ol>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-5">
              <h4 className="font-bold text-slate-800">Tipos de parâmetro</h4>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p><code className="rounded bg-purple-50 px-1.5 py-0.5 text-xs font-bold text-purple-700">flag</code> inclui uma flag CLI e seu valor, como <code className="rounded bg-slate-100 px-1">-x</code>.</p>
                <p><code className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-bold text-blue-700">positional</code> inclui o valor pela posição definida em <strong>Ordem</strong>, sem uma flag.</p>
                <p><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-600">internal</code> e <code className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-700">generated</code> registram dados internos, documentais ou produzidos pelo fluxo, sem se tornarem flags de comando.</p>
              </div>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 text-sm leading-relaxed text-blue-950">
              <p className="font-semibold">Atenção ao editar</p>
              <p className="mt-1 text-blue-900/80">Ao salvar a edição de um tipo de job, a lista de parâmetros é substituída pela lista exibida no formulário. Preserve todos os parâmetros que continuam necessários antes de confirmar.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <SectionHeader
          icon={Database}
          step="Etapa 2"
          title="Como manter o Catálogo Oficial"
          description="Genéricos e pontes são opções oficiais usadas nos checklists. Eles são diferentes dos tipos de job e de seus parâmetros."
          iconClass="bg-cyan-50 text-cyan-700"
        />
        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-5 sm:p-6">
            <h4 className="font-bold text-slate-800">Cadastro e manutenção</h4>
            <ol className="mt-4 space-y-4">
              <Step number={1}>Acesse <Link className="font-semibold text-cyan-700 underline underline-offset-2" to="/catalogo-oficial">Catálogo Oficial</Link> e use <strong>Novo item</strong>.</Step>
              <Step number={2}>Escolha se o item é um <strong>Genérico</strong> ou uma <strong>Ponte</strong>; informe o código, o nome oficial, a descrição e a versão da fonte.</Step>
              <Step number={3}>Mantenha o item <strong>Ativo</strong> somente quando ele estiver aprovado para uso. Apenas itens ativos são aceitos na validação de novos checklists.</Step>
              <Step number={4}>Para cargas maiores, use <strong>Importar JSON</strong> com a relação oficial revisada. A importação atualiza cada combinação de tipo e código.</Step>
            </ol>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-5 text-sm leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-800">Quando desativar</p>
              <p className="mt-1">Desative um item que deixou de ser válido para novas solicitações. Ele deixa de ser aceito na validação, mas permanece disponível para consulta e pode ser reativado após nova aprovação.</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-950">
              <p className="font-semibold">Fonte de verdade</p>
              <p className="mt-1 text-amber-900/85">Não use o catálogo para inventar genéricos ou pontes. Registre apenas valores confirmados na fonte oficial DIOT e identifique a versão usada.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <SectionHeader
          icon={FileCode}
          step="Etapa 3"
          title="Como configurar Regras de Nomenclatura"
          description="As regras definem orientação e validação por ambiente. O motor aplica somente regras publicadas, ativas e compatíveis com o tipo de job selecionado."
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-5 sm:p-6">
            <h4 className="font-bold text-slate-800">Cadastro pela tela</h4>
            <ol className="mt-4 space-y-4">
              <Step number={1}>Acesse <Link className="font-semibold text-emerald-700 underline underline-offset-2" to="/normas">Norma N/PD/004/02</Link> e clique em <strong>Nova Regra</strong>.</Step>
              <Step number={2}>Escolha o ambiente: <strong>Geral</strong>, <strong>UNIX / LINUX</strong> ou <strong>Windows</strong>.</Step>
              <Step number={3}>Escreva uma orientação clara: informe o padrão, exceções permitidas e a correção esperada quando o valor não for válido.</Step>
              <Step number={4}>Salve e encaminhe a regra ao fluxo administrativo de aprovação e publicação. O salvamento cria uma versão de trabalho; não ativa a regra de imediato.</Step>
            </ol>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-5 sm:p-6">
              <div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-emerald-600" /><h4 className="font-bold text-slate-800">Aplicabilidade por tipo de job</h4></div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">Depois que uma regra estiver publicada e ativa, use o ícone de controles na própria linha para escolher <strong>Todos os tipos de job</strong> ou <strong>Somente tipos selecionados</strong>. A segunda opção exige pelo menos um tipo já cadastrado no Mapeamento de Jobs.</p>
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">A regra é avaliada conforme ambiente, vigência e aplicabilidade. Regras bloqueantes impedem a finalização quando falham; avisos registram a pendência sem bloquear.</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-950">
              <p className="font-semibold">Configuração técnica avançada</p>
              <p className="mt-1 text-amber-900/85">Código, expressão de validação, severidade e casos de teste fazem parte da regra estruturada, mas ainda não são campos editáveis nesta tela. Para esse nível de alteração, use o processo administrativo/técnico responsável pela publicação.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <SectionHeader
          icon={BookOpen}
          step="Etapa 4"
          title="Como manter o Dicionário de Dados"
          description="O dicionário ensina o vocabulário da operação ao agente. Ele contextualiza a conversa, mas não substitui uma regra de nomenclatura ou a configuração de um parâmetro."
          iconClass="bg-blue-50 text-blue-600"
        />
        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-5 sm:p-6">
            <h4 className="font-bold text-slate-800">Passo a passo</h4>
            <ol className="mt-4 space-y-4">
              <Step number={1}>Abra <Link className="font-semibold text-blue-700 underline underline-offset-2" to="/dicionario">Dicionário de Dados</Link> e clique em <strong>Adicionar Termo</strong>.</Step>
              <Step number={2}>Informe o termo exatamente como é usado pela operação e escolha a categoria mais adequada.</Step>
              <Step number={3}>Escreva uma definição direta: explique o significado, o contexto de uso e, quando necessário, o que o termo não representa.</Step>
              <Step number={4}>Salve, revise e encaminhe o termo ao fluxo administrativo de publicação. Somente a versão publicada e ativa é disponibilizada ao agente.</Step>
            </ol>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-5">
              <h4 className="font-bold text-slate-800">Categorias disponíveis</h4>
              <div className="mt-4 flex flex-wrap gap-2">
                {['Conceito', 'Operação', 'Ferramenta', 'Job Genérico', 'Codificação', 'Servidor'].map((category) => (
                  <span key={category} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{category}</span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Boas práticas</p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />Evite definições circulares ou siglas sem explicação.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />Use um conceito por termo e mantenha a nomenclatura consistente.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />Não registre senhas, chaves, tokens ou outros dados sigilosos.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <SectionHeader
          icon={Brain}
          step="Etapa 5"
          title="Diretrizes e modelo de linguagem"
          description="As instruções ajustam o tom e a orientação operacional complementar. Elas não substituem catálogo, campos obrigatórios ou validações corporativas aplicadas pelo servidor."
          iconClass="bg-indigo-50 text-indigo-600"
        />
        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5 sm:p-6">
            <h4 className="font-bold text-slate-800">Onde alterar</h4>
            <ol className="mt-4 space-y-4">
              <Step number={1}>Abra <Link className="font-semibold text-indigo-700 underline underline-offset-2" to="/agente">Agente IA (Chat)</Link>.</Step>
              <Step number={2}>Clique em <strong>Instruções</strong> (ícone de engrenagem) no cabeçalho do chat para abrir o painel <strong>Configurar Comportamento</strong>.</Step>
              <Step number={3}>Selecione o modelo de linguagem disponível e edite <strong>Instruções de IA (Prompt)</strong> com diretrizes complementares.</Step>
              <Step number={4}>Clique em <strong>Salvar Instruções</strong>. A nova orientação é usada nas próximas interações.</Step>
            </ol>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-indigo-600" /><h4 className="font-bold text-slate-800">O que continua protegido</h4></div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">O agente recebe uma política operacional fixa, jobs e parâmetros ativos, catálogo oficial ativo, regras e dicionário publicados. As instruções administrativas complementam esse contexto, mas não podem autorizar a omissão de campos obrigatórios nem a invenção de jobs, parâmetros, genéricos ou pontes.</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 text-sm leading-relaxed text-emerald-950">
              <p className="font-semibold">Antes de liberar uma mudança</p>
              <p className="mt-1 text-emerald-900/85">Inicie uma nova conversa, solicite um exemplo representativo e confira se o checklist e o comando proposto refletem o catálogo configurado.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-blue-200"><Cpu className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Como as configurações são usadas</span></div>
            <h3 className="mt-2 text-xl font-bold">O contexto do JobsIA é consolidado antes de cada conversa.</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">O sistema combina política operacional, diretrizes complementares, jobs e parâmetros ativos, catálogo oficial ativo, regras publicadas e dicionário publicado. Na finalização, o motor também valida as regras aplicáveis ao ambiente e ao tipo de job.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold">
            {['Catálogo', 'Regras', 'Dicionário', 'Validação'].map((item) => <span key={item} className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-blue-100">{item}</span>)}
          </div>
        </div>
      </section>
    </div>
  );
}
