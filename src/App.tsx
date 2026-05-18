import { NavLink, Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import { Book, Bot, FileCode, History, LogOut, Server, Terminal, Users } from 'lucide-react';
import { DictionaryView, JobsView, NormsView } from './components/KnowledgeViews';
import { AgentView } from './components/AgentView';
import { HistoryView } from './components/HistoryView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import UsersPage from './pages/UsersPage';

const navItems = [
  { to: '/agente',     icon: Terminal, label: 'Agente IA (Chat)',     activeClass: 'bg-blue-600 text-white shadow-md shadow-blue-600/20' },
  { to: '/historico',  icon: History,  label: 'Histórico (Auditoria)', activeClass: 'bg-amber-50 text-amber-700 border border-amber-200 shadow-sm' },
  { to: '/usuarios',   icon: Users,    label: 'Usuários',              activeClass: 'bg-slate-800 text-white shadow-md shadow-slate-800/20' },
] as const;

const knowledgeItems = [
  { to: '/dicionario', icon: Book,     label: 'Dicionário de Dados',  activeClass: 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm' },
  { to: '/normas',     icon: FileCode, label: 'Norma N/PD/004/02',    activeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm' },
  { to: '/jobs',       icon: Server,   label: 'Mapeamento de Jobs',   activeClass: 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm' },
] as const;

function AppLayout() {
  const { profile, signOut } = useAuth();

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

          <div className="flex items-center gap-3">
            {profile && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-xs uppercase">
                  {profile.name?.charAt(0) ?? profile.email.charAt(0)}
                </div>
                <span className="text-sm font-medium text-slate-700 hidden sm:block">
                  {profile.name || profile.email}
                </span>
              </div>
            )}
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sair</span>
            </button>
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
            <Route path="/usuarios" element={<UsersPage />} />
          </Routes>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<SignupPage />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
