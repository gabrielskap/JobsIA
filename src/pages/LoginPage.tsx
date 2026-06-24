import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, type AuthUser } from '../contexts/AuthContext';

function DataprevLogo() {
  return <img src="/dataprev-logo.png" alt="Dataprev" className="w-64 h-auto" />;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
      login(user, token);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden md:flex w-1/2 bg-white items-center justify-center px-16">
        <div className="max-w-sm flex flex-col items-start">
          <DataprevLogo />
          <div className="mt-8">
            <h1 className="text-5xl font-black leading-tight">
              <span className="text-slate-900">Jobs</span>
              <span className="text-yellow-400">IA</span>
            </h1>
            <h2 className="text-4xl font-black text-blue-600 mt-1">Dataprev</h2>
            <div className="w-10 h-1 bg-yellow-400 mt-4 mb-6" />
            <p className="text-slate-600 text-base leading-relaxed">
              Solução inteligente da Dataprev para apoiar a execução de Jobs, automatizando checklists,
              organizando informações técnicas e gerando PDFs padronizados com mais eficiência e segurança operacional.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full md:w-1/2 bg-gray-100 flex items-center justify-center px-6 md:px-16">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900">Acessar sistema</h2>
            <p className="text-slate-500 mt-1">Entre com suas credenciais para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="seu.email@dataprev.com.br"
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-700" htmlFor="password">Senha</label>
                <button type="button" className="text-sm text-blue-600 hover:underline">
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white font-semibold py-3 rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <p className="text-center text-sm text-slate-500 mt-2">
              Não tem uma conta?{' '}
              <Link to="/cadastro" className="text-blue-600 font-semibold hover:underline">
                Cadastre-se
              </Link>
            </p>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Sistema restrito a servidores autorizados.
          </p>
        </div>
      </div>
    </div>
  );
}
