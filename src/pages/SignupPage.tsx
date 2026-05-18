import { useState, type FormEvent } from 'react';
import { Bot } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      const { error: profileError } = await supabase
        .from('JobsIA_profiles')
        .insert({ id: userId, user_id: userId, name, email });

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="bg-blue-600 p-3 rounded-2xl">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs IA</h1>
          <p className="text-sm text-slate-500">Crie sua conta para começar</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="name">Nome</label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Seu nome"
              autoComplete="name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="seu@email.com"
              autoComplete="email"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white font-medium py-2.5 rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>

          <p className="text-center text-sm text-slate-500">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-blue-600 font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
