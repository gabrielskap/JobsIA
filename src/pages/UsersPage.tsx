import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { Users, UserPlus, X, Pencil, Shield, CheckCircle, XCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile } from '../types/database';

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Filtered, sorted & paginated users
  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const filtered = term
      ? users.filter(u =>
          (u.name || '').toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term) ||
          (u.matricula || '').toLowerCase().includes(term)
        )
      : [...users];

    // Alphabetical order by name
    filtered.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB, 'pt-BR');
    });

    return filtered;
  }, [users, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('SOLICITANTE');
  const [isActive, setIsActive] = useState(true);
  const [matricula, setMatricula] = useState('');
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

  function handleOpenCreateModal() {
    setEditingUser(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('SOLICITANTE');
    setIsActive(true);
    setMatricula('');
    setModalError('');
    setIsModalOpen(true);
  }

  function handleOpenEditModal(user: Profile) {
    setEditingUser(user);
    setName(user.name || '');
    setEmail(user.email || '');
    setPassword(''); // Empty by default for edit (optional reset)
    setRole(user.role || 'SOLICITANTE');
    setIsActive(user.is_active !== false);
    setMatricula(user.matricula || '');
    setModalError('');
    setIsModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setModalError('');
    setModalLoading(true);

    const payload: Record<string, any> = {
      name,
      email,
      role,
      is_active: isActive,
      matricula: matricula || null,
    };

    // Only send password if provided
    if (password) {
      if (password.length < 6) {
        setModalError('A senha deve ter pelo menos 6 caracteres');
        setModalLoading(false);
        return;
      }
      payload.password = password;
    } else if (!editingUser) {
      // Password is required for new users
      setModalError('A senha é obrigatória para novos usuários');
      setModalLoading(false);
      return;
    }

    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, payload);
      } else {
        await api.post('/users', payload);
      }
      
      // Close modal & reset state
      setIsModalOpen(false);
      setEditingUser(null);
      setName('');
      setEmail('');
      setPassword('');
      setRole('SOLICITANTE');
      setIsActive(true);
      setMatricula('');
      
      // Refresh user list
      await fetchUsers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Erro ao processar requisição');
    } finally {
      setModalLoading(false);
    }
  }

  function getRoleBadge(userRole?: string) {
    switch (userRole) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-md text-xs font-semibold">
            <Shield className="w-3 h-3" />
            Administrador
          </span>
        );
      case 'OPERADOR':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-md text-xs font-semibold">
            Operador
          </span>
        );
      case 'SOLICITANTE':
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded-md text-xs font-medium">
            Solicitante
          </span>
        );
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
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Criar Usuário</span>
        </button>
      </div>

      {/* Search Bar */}
      {!loading && !error && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome, e-mail ou matrícula..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow shadow-sm"
          />
        </div>
      )}

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
          {filteredUsers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">
              {searchTerm ? 'Nenhum usuário encontrado para a pesquisa.' : 'Nenhum usuário cadastrado.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left font-semibold text-slate-600 px-6 py-3">Nome</th>
                    <th className="text-left font-semibold text-slate-600 px-6 py-3">E-mail</th>
                    <th className="text-left font-semibold text-slate-600 px-6 py-3">Matrícula</th>
                    <th className="text-left font-semibold text-slate-600 px-6 py-3">Perfil</th>
                    <th className="text-left font-semibold text-slate-600 px-6 py-3">Status</th>
                    <th className="text-left font-semibold text-slate-600 px-6 py-3">Cadastro</th>
                    <th className="text-center font-semibold text-slate-600 px-6 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {u.name?.charAt(0) || u.email.charAt(0)}
                          </div>
                          <span className="font-semibold text-slate-900">{u.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{u.email}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">{u.matricula || '—'}</td>
                      <td className="px-6 py-4">{getRoleBadge(u.role)}</td>
                      <td className="px-6 py-4">
                        {u.is_active !== false ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full text-xs font-medium">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full text-xs font-medium">
                            <XCircle className="w-3 h-3 text-red-600" />
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleOpenEditModal(u)}
                          className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {filteredUsers.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/50">
              <span className="text-xs text-slate-500">
                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)} de {filteredUsers.length} usuários
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    if (totalPages <= 7) return true;
                    if (page === 1 || page === totalPages) return true;
                    if (Math.abs(page - currentPage) <= 1) return true;
                    return false;
                  })
                  .map((page, idx, arr) => {
                    const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                    return (
                      <span key={page} className="flex items-center">
                        {showEllipsis && <span className="px-1 text-xs text-slate-400">…</span>}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[32px] h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            page === currentPage
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {page}
                        </button>
                      </span>
                    );
                  })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-900">
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingUser(null);
                }}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4" autoComplete="off">
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
                  autoComplete="off"
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
                  autoComplete="off"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700" htmlFor="modal-role">Perfil</label>
                  <select
                    id="modal-role"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="SOLICITANTE">Solicitante</option>
                    <option value="OPERADOR">Operador</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700" htmlFor="modal-matricula">Matrícula</label>
                  <input
                    id="modal-matricula"
                    type="text"
                    value={matricula}
                    onChange={e => setMatricula(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: DF12345"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="modal-status">Status da Conta</label>
                <select
                  id="modal-status"
                  value={isActive ? 'active' : 'inactive'}
                  onChange={e => setIsActive(e.target.value === 'active')}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo (Bloqueado)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="modal-password">
                  {editingUser ? 'Nova Senha (opcional)' : 'Senha'}
                </label>
                <input
                  id="modal-password"
                  type="password"
                  required={!editingUser}
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={editingUser ? 'Deixe em branco para manter a atual' : 'Mínimo 6 caracteres'}
                  autoComplete="new-password"
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
                    setEditingUser(null);
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
                  {modalLoading ? 'Salvando...' : editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
