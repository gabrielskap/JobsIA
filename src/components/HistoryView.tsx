import { useState, useEffect } from 'react';
import { History, FileText, Download, Search, TrendingUp, CheckCircle, XCircle, Activity, Loader2 } from 'lucide-react';
import { checklistService } from '../services/checklistService';
import type { Checklist } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { downloadChecklistPDF } from '../utils/pdfGenerator';

const TYPE_LABEL: Record<Checklist['type'], string> = {
  transhost: 'Transhost (Jobs 3 e 10)',
  swadm: 'SWADM (Job 1)',
  java: 'Programa JAVA (Job 9)',
};

export function HistoryView() {
  const { profile, user } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    checklistService.getAll().then(data => {
      setChecklists(data);
      setLoading(false);
    });
  }, []);

  const filtered = checklists.filter(item =>
    !search ||
    item.file_name?.toLowerCase().includes(search.toLowerCase()) ||
    TYPE_LABEL[item.type]?.toLowerCase().includes(search.toLowerCase()) ||
    item.type?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDownload = (item: Checklist) => {
    const saveFileName = `Checklist_${item.type}_${item.file_name ?? 'download'}.pdf`.replace(/\s+/g, '_');
    downloadChecklistPDF(item.id, saveFileName);
  };

  const total = checklists.length;
  const succeeded = checklists.filter(c => c.status === 'Concluído').length;
  const failed = checklists.filter(c => c.status === 'Falha Validação').length;
  const successRate = total > 0 ? ((succeeded / total) * 100).toFixed(1) : '—';

  const typeCounts = checklists.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});
  const typeEntries = Object.entries(typeCounts) as [string, number][];
  const mostCommon = total > 0
    ? (typeEntries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b pb-4 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <History className="w-6 h-6 text-amber-600" />
            Histórico de Checklists
          </h2>
          <p className="text-slate-600 mt-1">
            Registro de auditoria e monitoramento dos checklists gerados pelo Agente de IA.
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar checklist..."
            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Gerados</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : total}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Taxa de Sucesso</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : `${successRate}%`}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-red-50 p-3 rounded-lg text-red-600">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Falhas de Validação</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : failed}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-purple-50 p-3 rounded-lg text-purple-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Mais Solicitado</p>
            <p className="text-lg font-bold text-slate-800 leading-tight">
              {loading ? '…' : mostCommon ? TYPE_LABEL[mostCommon as Checklist['type']]?.split(' ')[0] : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando histórico...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <FileText className="w-10 h-10 opacity-40" />
            <p className="text-sm font-medium">
              {search ? 'Nenhum resultado para a busca.' : 'Nenhum checklist gerado ainda.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="p-4 font-semibold">Tipo de Job</th>
                <th className="p-4 font-semibold">Arquivo/Alvo</th>
                <th className="p-4 font-semibold">Data</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-slate-600">{TYPE_LABEL[item.type] ?? item.type}</td>
                  <td className="p-4 text-slate-600 font-mono text-xs">{item.file_name ?? '—'}</td>
                  <td className="p-4 text-slate-500">
                    {new Date(item.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        item.status === 'Concluído'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-40"
                      title="Baixar PDF"
                      disabled={item.status !== 'Concluído'}
                      onClick={() => handleDownload(item)}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
