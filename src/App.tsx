import { NavLink, Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Book, Bot, FileCode, History, Server, Terminal } from 'lucide-react';
import { DictionaryView, JobsView, NormsView } from './components/KnowledgeViews';
import { AgentView } from './components/AgentView';
import { HistoryView } from './components/HistoryView';

const navItems = [
  { to: '/agente',     icon: Terminal, label: 'Agente IA (Chat)',     activeClass: 'bg-blue-600 text-white shadow-md shadow-blue-600/20' },
  { to: '/historico',  icon: History,  label: 'Histórico (Auditoria)', activeClass: 'bg-amber-50 text-amber-700 border border-amber-200 shadow-sm' },
] as const;

const knowledgeItems = [
  { to: '/dicionario', icon: Book,     label: 'Dicionário de Dados',  activeClass: 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm' },
  { to: '/normas',     icon: FileCode, label: 'Norma N/PD/004/02',    activeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm' },
  { to: '/jobs',       icon: Server,   label: 'Mapeamento de Jobs',   activeClass: 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm' },
] as const;

export default function App() {
  return (
    <Router>
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
              {navItems.map(({ to, icon: Icon, label, activeClass }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive ? activeClass : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </NavLink>
              ))}

              <div className="h-px bg-slate-200 my-2 mx-4" />

              <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                Base de Conhecimento
              </div>

              {knowledgeItems.map(({ to, icon: Icon, label, activeClass }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive ? activeClass : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </aside>

          {/* Content Area */}
          <section className="flex-1 min-w-0">
            <Routes>
              <Route path="/" element={<Navigate to="/agente" replace />} />
              <Route path="/agente" element={<AgentView />} />
              <Route path="/historico" element={<HistoryView />} />
              <Route path="/dicionario" element={<DictionaryView />} />
              <Route path="/normas" element={<NormsView />} />
              <Route path="/jobs" element={<JobsView />} />
            </Routes>
          </section>
        </main>
      </div>
    </Router>
  );
}
