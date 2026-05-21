import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('JobsIA_profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setUsers(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="bg-slate-800 p-2 rounded-lg">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-bold text-lg text-slate-900">Usuários</h2>
          <p className="text-sm text-slate-500">Perfis cadastrados no sistema</p>
        </div>
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
    </div>
  );
}
