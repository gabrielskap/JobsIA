import { History, FileText, Download, Search, TrendingUp, CheckCircle, XCircle, Activity } from 'lucide-react';

export function HistoryView() {
  const mockHistory = [
    { id: 'CHK-1042', type: 'Transhost (Jobs 3 e 10)', file: 'D.CNS.BOE.002', date: '2026-04-01 10:30', status: 'Concluído', user: 'Bruno Mendes' },
    { id: 'CHK-1041', type: 'Transhost (Jobs 3 e 10)', file: 'D_SCO_ATU_005_BATIMENTO', date: '2026-03-31 15:15', status: 'Concluído', user: 'Edson Nunes' },
    { id: 'CHK-1040', type: 'SWADM (Job 1)', file: 'P.GEN.PGM.010.SH', date: '2026-03-30 09:45', status: 'Concluído', user: 'Erich Jardim' },
    { id: 'CHK-1039', type: 'Transhost (Jobs 3 e 10)', file: 'D.HR.FOLHA.001', date: '2026-03-29 14:20', status: 'Falha Validação', user: 'Luiz Benini' },
    { id: 'CHK-1038', type: 'Programa JAVA (Job 9)', file: 'P.CNS.VRC.001.JAR', date: '2026-03-28 11:10', status: 'Concluído', user: 'Rafael Gratao' },
  ];

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
            placeholder="Buscar checklist..." 
            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* KPI Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Gerados</p>
            <p className="text-2xl font-bold text-slate-800">1.284</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Taxa de Sucesso</p>
            <p className="text-2xl font-bold text-slate-800">98,5%</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-red-50 p-3 rounded-lg text-red-600">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Falhas de Validação</p>
            <p className="text-2xl font-bold text-slate-800">19</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-purple-50 p-3 rounded-lg text-purple-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Mais Solicitado</p>
            <p className="text-lg font-bold text-slate-800 leading-tight">Transhost</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <th className="p-4 font-semibold">ID</th>
              <th className="p-4 font-semibold">Tipo de Job</th>
              <th className="p-4 font-semibold">Arquivo/Alvo</th>
              <th className="p-4 font-semibold">Data</th>
              <th className="p-4 font-semibold">Solicitante</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {mockHistory.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-medium text-slate-800">{item.id}</td>
                <td className="p-4 text-slate-600">{item.type}</td>
                <td className="p-4 text-slate-600 font-mono text-xs">{item.file}</td>
                <td className="p-4 text-slate-500">{item.date}</td>
                <td className="p-4 text-slate-600">{item.user}</td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    item.status === 'Concluído' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <button 
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Baixar PDF"
                    disabled={item.status !== 'Concluído'}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
