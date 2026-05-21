import { useState } from 'react';
import { Book, FileCode, Server, Bot, Terminal, History } from 'lucide-react';
import { DictionaryView, JobsView, NormsView } from './components/KnowledgeViews';
import { AgentView } from './components/AgentView';
import { HistoryView } from './components/HistoryView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'agent' | 'history' | 'dictionary' | 'norms' | 'jobs'>('agent');

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl leading-tight">Jobs IA</h1>
            </div>
          </div>
          <div className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
            Expansão & Dashboard
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex flex-col gap-2 sticky top-24">
            <button
              onClick={() => setActiveTab('agent')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'agent'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <Terminal className="w-5 h-5" />
              Agente IA (Chat)
            </button>
            
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <History className="w-5 h-5" />
              Histórico (Auditoria)
            </button>
            
            <div className="h-px bg-slate-200 my-2 mx-4" />
            
            <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              Base de Conhecimento
            </div>
            
            <button
              onClick={() => setActiveTab('dictionary')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'dictionary'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <Book className="w-5 h-5" />
              Dicionário de Dados
            </button>
            <button
              onClick={() => setActiveTab('norms')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'norms'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <FileCode className="w-5 h-5" />
              Norma N/PD/004/02
            </button>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'jobs'
                  ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <Server className="w-5 h-5" />
              Mapeamento de Jobs
            </button>
          </nav>
        </aside>

        {/* Content Area */}
        <section className="flex-1 min-w-0">
          {activeTab === 'agent' && <AgentView />}
          {activeTab === 'history' && <HistoryView />}
          {activeTab === 'dictionary' && <DictionaryView />}
          {activeTab === 'norms' && <NormsView />}
          {activeTab === 'jobs' && <JobsView />}
        </section>
      </main>
    </div>
  );
}
