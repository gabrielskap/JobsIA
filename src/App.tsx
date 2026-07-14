import { useState } from 'react';
import { NavLink, Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import { Book, Cpu, FileCode, History, LogOut, Server, Terminal, Users, Menu, X, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { DictionaryView, JobsView, NormsView } from './components/KnowledgeViews';
import { AgentView } from './components/AgentView';
import { HistoryView } from './components/HistoryView';
import { HelpView } from './components/HelpView';
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
  { to: '/ajuda',      icon: HelpCircle, label: 'Ajuda / Manual',      activeClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' },
] as const;

function AppLayout() {
  const { profile, signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 h-16 shrink-0">
        <div className="px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Hamburguer menu para mobile */}
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 md:hidden focus:outline-none"
              title="Menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="bg-white p-1 rounded-lg border border-slate-100 shadow-sm flex items-center justify-center">
              <img
                src="/Dataprev logo.jpeg"
                alt="Dataprev logo"
                className="h-7 w-auto object-contain"
              />
            </div>
            <div>
              <h1 className="font-black text-xl leading-tight">
                <span className="text-[#005b9f]">Jobs</span>
                <span className="text-[#388226]">I</span>
                <span className="text-[#f09600]">A</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {profile && (
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm uppercase">
                  {profile.name?.charAt(0) ?? profile.email.charAt(0)}
                </div>
                <div className="hidden sm:flex flex-col items-start justify-center">
                  <span className="text-sm font-semibold text-slate-700 leading-tight">
                    {profile.name || profile.email}
                  </span>
                  <span className="text-xs text-slate-400 font-medium leading-tight">
                    {profile.role?.toUpperCase() === 'ADMIN'
                      ? 'Administrador'
                      : profile.role?.toUpperCase() === 'OPERADOR'
                        ? 'Operador'
                        : 'Solicitante'}
                  </span>
                </div>
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

      {/* Overlay para Mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <div className="flex flex-1 relative">
        {/* Sidebar Navigation */}
        <aside
          className={`
            fixed md:sticky top-16 left-0 z-40 h-[calc(100vh-4rem)] shrink-0
            bg-white border-r border-slate-200 transition-all duration-300 ease-in-out
            flex flex-col
            ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            ${isCollapsed ? 'w-20' : 'w-64'}
          `}
        >
          {/* Header/Toggle da Sidebar em Desktop */}
          <div className="hidden md:flex items-center justify-end p-4 border-b border-slate-100">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ${isCollapsed ? 'mx-auto' : ''}`}
              title={isCollapsed ? "Expandir menu" : "Recolher menu"}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Botão fechar para Mobile */}
          <div className="flex md:hidden items-center justify-between p-4 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Menu
            </span>
            <button
              onClick={() => setIsMobileOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
            {navItems.map(({ to, icon: Icon, label, activeClass }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setIsMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${
                    isActive ? activeClass : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                  } ${isCollapsed ? 'justify-center' : ''}`
                }
                title={isCollapsed ? label : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>{label}</span>}
                {isCollapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-md">
                    {label}
                  </span>
                )}
              </NavLink>
            ))}

            <div className="h-px bg-slate-200 my-2 mx-2" />

            {!isCollapsed && (
              <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                Base de Conhecimento
              </div>
            )}

            {knowledgeItems.map(({ to, icon: Icon, label, activeClass }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setIsMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${
                    isActive ? activeClass : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                  } ${isCollapsed ? 'justify-center' : ''}`
                }
                title={isCollapsed ? label : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>{label}</span>}
                {isCollapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-md">
                    {label}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 p-4 md:p-8">
          <Routes>
            <Route path="/" element={<Navigate to="/agente" replace />} />
            <Route path="/agente" element={<AgentView />} />
            <Route path="/historico" element={<HistoryView />} />
            <Route path="/dicionario" element={<DictionaryView />} />
            <Route path="/normas" element={<NormsView />} />
            <Route path="/jobs" element={<JobsView />} />
            <Route path="/usuarios" element={<UsersPage />} />
            <Route path="/ajuda" element={<HelpView />} />
          </Routes>
        </main>
      </div>
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
