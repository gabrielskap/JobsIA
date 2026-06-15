import { useEffect, useState, type FormEvent } from 'react';
import { Users, UserPlus, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile } from '../types/database';

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  async function fetchUsers() {
    setLoading(true);
    try {
      const data = await api.get<Profile[]>('/users');
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar usuários');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setModalError('');
    setModalLoading(true);
    try {
      await api.post('/users', { name, email, password });
      // Reset form
      setName('');
      setEmail('');
      setPassword('');
      setIsModalOpen(false);
      // Refresh user list
      await fetchUsers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Erro ao criar usuário');
    } finally {
      setModalLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 p-2 rounded-lg">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-900">Usuários</h2>
            <p className="text-sm text-slate-500">Perfis cadastrados no sistema</p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Criar Usuário</span>
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {users.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">Nenhum usuário encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Nome</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">E-mail</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-xs uppercase shrink-0">
                          {u.name?.charAt(0) || u.email.charAt(0)}
                        </div>
                        {u.name || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(u.created_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-900">Novo Usuário</h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setModalError('');
                  setName('');
                  setEmail('');
                  setPassword('');
                }}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateUser} className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="modal-name">Nome</label>
                <input
                  id="modal-name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome do usuário"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="modal-email">E-mail</label>
                <input
                  id="modal-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="exemplo@email.com"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="modal-password">Senha</label>
                <input
                  id="modal-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              {modalError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setModalError('');
                    setName('');
                    setEmail('');
                    setPassword('');
                  }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {modalLoading ? 'Criando...' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
