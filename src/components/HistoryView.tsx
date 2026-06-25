import { useState, useEffect } from 'react';
import { History, FileText, Download, Search, TrendingUp, CheckCircle, XCircle, Activity, Loader2, Star, ThumbsUp, ShieldAlert, Award } from 'lucide-react';
import { checklistService } from '../services/checklistService';
import type { Checklist } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { downloadChecklistPDF } from '../utils/pdfGenerator';
import { api } from '../lib/api';

const TYPE_LABEL: Record<string, string> = {
  transhost: 'Transhost (Jobs 3 e 10)',
  swadm: 'SWADM (Job 1)',
  java: 'Programa JAVA (Job 9)',
};

interface AggregationData {
  ruleFailures: Array<{ rule_code: string; count: number; message: string }>;
  recurrentTopics: Array<{ assunto: string; count: number }>;
  commonCorrections: Array<{ correcao_operador: string; count: number }>;
  feedback: { avg_rating: number; count: number };
  auditHistory: Array<{ id: string; action: string; details: any; ip_address: string; created_at: string; user_name: string }>;
}

export function HistoryView() {
  const { profile } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [aggregations, setAggregations] = useState<AggregationData | null>(null);

  // Estados para feedback
  const [selectedChecklist, setSelectedChecklist] = useState<Checklist | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [operatorCorrection, setOperatorCorrection] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await checklistService.getAll();
      setChecklists(data);

      if (profile?.role === 'ADMIN' || profile?.role === 'OPERADOR') {
        const aggs = await api.get<AggregationData>('/interactions/aggregations');
        setAggregations(aggs);
      }
    } catch (err) {
      console.error('Erro ao buscar dados do histórico:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile]);

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

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChecklist) return;

    try {
      await api.post('/interactions/feedback', {
        checklist_id: selectedChecklist.id,
        rating,
        comentario: comment,
        correcao_operador: operatorCorrection || null
      });
      setFeedbackSuccess(true);
      setComment('');
      setOperatorCorrection('');
      setTimeout(() => {
        setSelectedChecklist(null);
        setFeedbackSuccess(false);
        loadData();
      }, 1500);
    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
    }
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
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <History className="w-6 h-6 text-amber-600" />
            Histórico e Auditoria de Conformidade
          </h2>
          <p className="text-slate-600 mt-1">
            Métricas reais, auditoria administrativa e retenção de checklists e interações.
          </p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar checklist..."
            className="pl-9 pr-4 py-2 w-full bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Cards de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total de Checklists</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : total}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Taxa de Conformidade</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : `${successRate}%`}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-red-50 p-3 rounded-lg text-red-600">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Falhas Reais</p>
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
              {loading ? '…' : mostCommon ? (TYPE_LABEL[mostCommon] ?? mostCommon).split(' ')[0] : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* DASHBOARDS ADMINISTRATIVOS / OPERADOR */}
      {aggregations && (profile?.role === 'ADMIN' || profile?.role === 'OPERADOR') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Falhas por regra de validação */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600" /> Regras de Nomenclatura Mais Violadas
            </h3>
            <div className="space-y-3">
              {aggregations.ruleFailures.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhuma falha registrada.</p>
              ) : (
                aggregations.ruleFailures.map((rf, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-50 p-2.5 rounded border border-slate-100">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{rf.rule_code}</p>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{rf.message}</p>
                    </div>
                    <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold">{rf.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Assuntos recorrentes e campos mais corrigidos */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" /> Assuntos Recorrentes no Chat LIA
              </h3>
              <div className="flex flex-wrap gap-2">
                {aggregations.recurrentTopics.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum assunto classificado ainda.</p>
                ) : (
                  aggregations.recurrentTopics.map((rt, idx) => (
                    <span key={idx} className="bg-blue-50 text-blue-700 border border-blue-100 text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5">
                      {rt.assunto} <span className="bg-blue-200 text-blue-800 text-[10px] font-bold px-1.5 rounded">{rt.count}</span>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <ThumbsUp className="w-4 h-4 text-amber-600" /> Correções Efetuadas por Operadores
              </h3>
              <div className="space-y-2">
                {aggregations.commonCorrections.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhuma anotação de correção cadastrada.</p>
                ) : (
                  aggregations.commonCorrections.map((cc, idx) => (
                    <div key={idx} className="text-xs bg-amber-50 text-amber-800 p-2 rounded border border-amber-100 flex justify-between">
                      <span>"{cc.correcao_operador}"</span>
                      <span className="font-bold">x{cc.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / FORM DE FEEDBACK E CORREÇÃO DO OPERADOR */}
      {selectedChecklist && (
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl space-y-4">
          <h3 className="text-base font-bold text-slate-800">
            Registrar Avaliação / Correção de Operador
          </h3>
          <p className="text-xs text-slate-600">
            Checklist: <span className="font-mono">{selectedChecklist.file_name || 'Legado'}</span> (Tipo {selectedChecklist.job_type_id})
          </p>

          {feedbackSuccess ? (
            <div className="bg-emerald-50 text-emerald-700 text-xs p-3 rounded border border-emerald-200 font-bold">
              Feedback registrado com sucesso!
            </div>
          ) : (
            <form onSubmit={handleSubmitFeedback} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Satisfação (1 a 5 Estrelas)</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      type="button"
                      key={val}
                      onClick={() => setRating(val)}
                      className={`p-1 rounded ${rating >= val ? 'text-amber-500' : 'text-slate-300'}`}
                    >
                      <Star className="w-6 h-6 fill-current" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Comentários Adicionais</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Deixe observações sobre a conversa com a LIA..."
                  className="w-full text-xs p-2 border rounded bg-white text-slate-800"
                />
              </div>

              {(profile?.role === 'ADMIN' || profile?.role === 'OPERADOR') && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Correção Efetuada pelo Operador (Se aplicável)</label>
                  <input
                    type="text"
                    value={operatorCorrection}
                    onChange={(e) => setOperatorCorrection(e.target.value)}
                    placeholder="Ex: corrigido nome do arquivo que possuía ponto em vez de underscore"
                    className="w-full text-xs p-2 border rounded bg-white text-slate-800"
                  />
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedChecklist(null)}
                  className="text-xs px-3 py-1.5 border rounded hover:bg-slate-100 text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
                >
                  Salvar Avaliação
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TABELA DE CHECKLISTS E HISTÓRICO */}
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
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
                    <td className="p-4 text-right flex justify-end gap-1">
                      <button
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-40"
                        title="Avaliar ou Registrar Correção"
                        onClick={() => setSelectedChecklist(item)}
                      >
                        <Star className="w-4 h-4 text-amber-500" />
                      </button>
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
          </div>
        )}
      </div>
    </div>
  );
}
