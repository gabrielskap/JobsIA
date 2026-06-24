import { useState, useEffect, FormEvent } from 'react';
import { Book, Database, FileCode, Server, Plus, Trash2, X, Edit2, Loader2 } from 'lucide-react';
import { dictionaryService } from '../services/dictionaryService';
import { normService } from '../services/normService';
import { jobService } from '../services/jobService';
import type { DictionaryTerm, NormRule, JobTypeWithParameters, ParameterType } from '../types/database';

const NORMS_TITLE = "Norma N/PD/004/02 - Nomenclatura";

export function DictionaryView() {
  const [dictionary, setDictionary] = useState<DictionaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTerm, setNewTerm] = useState({ term: '', definition: '', category: 'Conceito' });

  useEffect(() => {
    dictionaryService.seedIfEmpty().then(() =>
      dictionaryService.getAll().then(data => {
        setDictionary(data);
        setLoading(false);
      })
    );
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTerm.term.trim() || !newTerm.definition.trim()) return;

    if (editingId !== null) {
      const updated = await dictionaryService.update(editingId, newTerm);
      if (updated) setDictionary(prev => prev.map(d => d.id === editingId ? updated : d));
      setEditingId(null);
    } else {
      const created = await dictionaryService.create(newTerm);
      if (created) setDictionary(prev => [created, ...prev]);
      setIsAdding(false);
    }
    setNewTerm({ term: '', definition: '', category: 'Conceito' });
  };

  const startEdit = (item: DictionaryTerm) => {
    setEditingId(item.id);
    setNewTerm({ term: item.term, definition: item.definition, category: item.category });
    setIsAdding(false);
  };

  const removeTerm = async (item: DictionaryTerm) => {
    if (!confirm('Tem certeza que deseja excluir este termo?')) return;
    const ok = await dictionaryService.remove(item.id);
    if (ok) setDictionary(prev => prev.filter(d => d.id !== item.id));
    if (editingId === item.id) {
      setEditingId(null);
      setNewTerm({ term: '', definition: '', category: 'Conceito' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b pb-4 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <Book className="w-6 h-6 text-blue-600" />
            Dicionário de Dados
          </h2>
          <p className="text-slate-600 mt-1">
            Termos técnicos e conceitos extraídos da operação da DIOT para o treinamento da IA.
          </p>
        </div>
        <button
          onClick={() => {
            setIsAdding(!isAdding);
            setEditingId(null);
            setNewTerm({ term: '', definition: '', category: 'Conceito' });
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
            isAdding
              ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? 'Cancelar' : 'Adicionar Termo'}
        </button>
      </div>

      {(isAdding || editingId !== null) && (
        <form
          onSubmit={handleSave}
          className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 shadow-inner animate-in slide-in-from-top-4 duration-300"
        >
          <h3 className="text-blue-800 font-bold mb-4 flex items-center gap-2">
            {editingId !== null ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingId !== null ? 'Editar Termo' : 'Adicionar Novo Termo'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Termo</label>
              <input
                required
                type="text"
                value={newTerm.term}
                onChange={(e) => setNewTerm({ ...newTerm, term: e.target.value })}
                placeholder="Ex: Transhost"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Categoria</label>
              <select
                value={newTerm.category}
                onChange={(e) => setNewTerm({ ...newTerm, category: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              >
                <option value="Conceito">Conceito</option>
                <option value="Operação">Operação</option>
                <option value="Ferramenta">Ferramenta</option>
                <option value="Job Genérico">Job Genérico</option>
                <option value="Codificação">Codificação</option>
                <option value="Servidor">Servidor</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5 mb-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Definição</label>
            <textarea
              required
              rows={3}
              value={newTerm.definition}
              onChange={(e) => setNewTerm({ ...newTerm, definition: e.target.value })}
              placeholder="Descreva o significado deste termo para a operação..."
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20"
            >
              {editingId !== null ? 'Salvar Alterações' : 'Salvar Termo no Dicionário'}
            </button>
            {editingId !== null && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setNewTerm({ term: '', definition: '', category: 'Conceito' });
                }}
                className="px-6 bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg hover:bg-slate-300 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando dicionário...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dictionary.map((item) => (
            <div
              key={item.id}
              className={`bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-all group relative ${
                editingId === item.id ? 'ring-2 ring-blue-500 border-transparent bg-blue-50/10' : 'border-slate-200'
              }`}
            >
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={() => startEdit(item)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                  title="Editar termo"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeTerm(item)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Remover termo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-between items-start mb-2 pr-12">
                <h3 className="font-bold text-slate-800 text-lg">{item.term}</h3>
                <span className="bg-blue-50 text-blue-700 text-[10px] px-2 py-1 rounded-full font-bold border border-blue-100 uppercase tracking-wider">
                  {item.category}
                </span>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">{item.definition}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NormsView() {
  const [rules, setRules] = useState<NormRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ environment: '', rule: '' });

  const loadRules = async () => {
    const data = await normService.getAll();
    setRules(data);
  };

  useEffect(() => {
    normService.seedIfEmpty().then(() =>
      normService.getAll().then(data => {
        setRules(data);
        setLoading(false);
      })
    );
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.environment.trim() || !formData.rule.trim()) return;

    setSaving(true);
    setError(null);

    if (editingId !== null) {
      const updated = await normService.update(editingId, formData);
      if (updated) {
        setRules(prev => prev.map(r => r.id === editingId ? updated : r));
        setEditingId(null);
        setFormData({ environment: '', rule: '' });
      } else {
        setError('Erro ao atualizar a regra. Verifique o console para detalhes.');
      }
    } else {
      const { data: created, error: createError } = await normService.create(formData);
      if (created) {
        await loadRules();
        setIsAdding(false);
        setFormData({ environment: '', rule: '' });
      } else {
        setError(`Erro ao salvar: ${createError ?? 'erro desconhecido'}`);
      }
    }

    setSaving(false);
  };

  const startEdit = (rule: NormRule) => {
    setEditingId(rule.id);
    setFormData({ environment: rule.environment, rule: rule.rule });
    setIsAdding(false);
  };

  const removeRule = async (id: string) => {
    const ok = await normService.remove(id);
    if (ok) setRules(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b pb-4 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <FileCode className="w-6 h-6 text-emerald-600" />
            Regras de Nomenclatura
          </h2>
          <p className="text-slate-600 mt-1">
            {NORMS_TITLE} - Regras que a IA usará para validar as entradas do usuário.
          </p>
        </div>
        <button
          onClick={() => {
            setIsAdding(!isAdding);
            setEditingId(null);
            setError(null);
            setFormData({ environment: '', rule: '' });
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
            isAdding
              ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? 'Cancelar' : 'Nova Regra'}
        </button>
      </div>

      {(isAdding || editingId !== null) && (
        <form
          onSubmit={handleSave}
          className="bg-emerald-50/50 p-6 rounded-xl border border-emerald-100 shadow-inner animate-in slide-in-from-top-4 duration-300"
        >
          <h3 className="text-emerald-800 font-bold mb-4 flex items-center gap-2">
            {editingId !== null ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingId !== null ? 'Editar Regra' : 'Criar Nova Regra de Nomenclatura'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-1 space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Ambiente</label>
              <select
                required
                value={formData.environment}
                onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              >
                <option value="">Selecione...</option>
                <option value="Geral">Geral</option>
                <option value="UNIX / LINUX">UNIX / LINUX</option>
                <option value="Windows">Windows</option>
              </select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Regra de Validação</label>
              <input
                required
                type="text"
                value={formData.rule}
                onChange={(e) => setFormData({ ...formData, rule: e.target.value })}
                placeholder="Descreva a regra de nomenclatura..."
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-emerald-600 text-white font-semibold py-2.5 rounded-lg hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-600/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId !== null ? 'Atualizar Regra' : 'Salvar Nova Regra'}
            </button>
            {editingId !== null && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditingId(null);
                  setError(null);
                  setFormData({ environment: '', rule: '' });
                }}
                className="px-6 bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando regras...
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 font-semibold text-slate-700 w-1/4">Ambiente</th>
                <th className="p-4 font-semibold text-slate-700">Regra de Validação</th>
                <th className="p-4 font-semibold text-slate-700 w-24 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className={`hover:bg-slate-50 transition-colors group ${editingId === rule.id ? 'bg-emerald-50/30' : ''}`}
                >
                  <td className="p-4 font-medium text-slate-800">{rule.environment}</td>
                  <td className="p-4 text-slate-600 text-sm">{rule.rule}</td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(rule)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        title="Editar regra"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeRule(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir regra"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function JobsView() {
  const [jobsData, setJobsData] = useState<JobTypeWithParameters[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  type ParamForm = {
    flag: string;
    name: string;
    required: boolean;
    description: string;
    parameter_type: ParameterType;
    order_index: number;
    data_type: string;
    default_value: string;
    example_value: string;
    validation_regex: string;
    active: boolean;
  };

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    script: '',
    description: '',
    parameters: [] as ParamForm[],
  });

  useEffect(() => {
    jobService.seedIfEmpty().then(() =>
      jobService.getAll().then(data => {
        setJobsData(data);
        setLoading(false);
      })
    );
  }, []);

  const resetForm = () => {
    setFormData({ id: '', name: '', script: '', description: '', parameters: [] });
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.id.trim()) return;

    const jobId = Number(formData.id);
    if (isNaN(jobId)) { alert('ID do Job deve ser um número.'); return; }

    if (editingId !== null) {
      if (jobId !== editingId && jobsData.some(j => j.id === jobId)) {
        alert('Já existe um Job com este ID/Tipo.');
        return;
      }
      const updated = await jobService.update(
        editingId,
        { id: jobId, name: formData.name, script: formData.script, description: formData.description },
        formData.parameters.map(p => ({
          ...p,
          flag: p.parameter_type === 'flag' ? (p.flag || null) : null,
          default_value: p.default_value || null,
          example_value: p.example_value || null,
          validation_regex: p.validation_regex || null,
        }))
      );
      if (updated) setJobsData(prev => prev.map(j => j.id === editingId ? updated : j));
      setEditingId(null);
    } else {
      if (jobsData.some(j => j.id === jobId)) {
        alert('Já existe um Job com este ID/Tipo.');
        return;
      }
      const created = await jobService.create(
        { id: jobId, name: formData.name, script: formData.script, description: formData.description },
        formData.parameters.map(p => ({
          ...p,
          flag: p.parameter_type === 'flag' ? (p.flag || null) : null,
          default_value: p.default_value || null,
          example_value: p.example_value || null,
          validation_regex: p.validation_regex || null,
        }))
      );
      if (created) setJobsData(prev => [...prev, created]);
      setIsAdding(false);
    }
    resetForm();
  };

  const startEdit = (job: JobTypeWithParameters) => {
    setFormData({
      id: String(job.id),
      name: job.name,
      script: job.script,
      description: job.description,
      parameters: job.parameters.map((p, i) => ({
        flag: p.flag ?? '',
        name: p.name,
        required: p.required,
        description: p.description,
        parameter_type: p.parameter_type,
        order_index: p.order_index ?? i,
        data_type: p.data_type ?? 'text',
        default_value: p.default_value ?? '',
        example_value: p.example_value ?? '',
        validation_regex: p.validation_regex ?? '',
        active: p.active ?? true,
      })),
    });
    setEditingId(job.id);
    setIsAdding(false);
  };

  const removeJob = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este Tipo de Job?')) return;
    const ok = await jobService.remove(id);
    if (ok) setJobsData(prev => prev.filter(j => j.id !== id));
  };

  const addParameter = () => {
    setFormData({
      ...formData,
      parameters: [...formData.parameters, {
        flag: '', name: '', required: true, description: '',
        parameter_type: 'flag' as ParameterType,
        order_index: formData.parameters.length,
        data_type: 'text',
        default_value: '',
        example_value: '',
        validation_regex: '',
        active: true,
      }],
    });
  };

  const updateParameter = (idx: number, field: string, value: string | boolean) => {
    const newParams = [...formData.parameters];
    newParams[idx] = { ...newParams[idx], [field]: value };
    setFormData({ ...formData, parameters: newParams });
  };

  const removeParameter = (idx: number) => {
    setFormData({ ...formData, parameters: formData.parameters.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b pb-4 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <Server className="w-6 h-6 text-purple-600" />
            Estrutura de Jobs Genéricos
          </h2>
          <p className="text-slate-600 mt-1">
            Mapeamento dos scripts e parâmetros para a operação.
          </p>
        </div>
        <button
          onClick={() => {
            setIsAdding(!isAdding);
            setEditingId(null);
            resetForm();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
            isAdding
              ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          }`}
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? 'Cancelar' : 'Novo Tipo de Job'}
        </button>
      </div>

      {(isAdding || editingId !== null) && (
        <form
          onSubmit={handleSave}
          className="bg-purple-50/50 p-6 rounded-xl border border-purple-100 shadow-inner animate-in slide-in-from-top-4 duration-300 space-y-4"
        >
          <h3 className="text-purple-800 font-bold flex items-center gap-2">
            {editingId !== null ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingId !== null ? `Editando Tipo ${editingId}` : 'Configurar Novo Tipo de Job'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Tipo ID</label>
              <input
                required
                type="number"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="Ex: 1"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Nome do Job</label>
              <input
                required
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Transferência Direta"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Script Principal</label>
            <input
              required
              type="text"
              value={formData.script}
              onChange={(e) => setFormData({ ...formData, script: e.target.value })}
              placeholder="Ex: /u/bin/transhost_linux.sh"
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Descrição</label>
            <textarea
              required
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Para que serve este job?"
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none text-sm"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Parâmetros do Script</label>
              <button
                type="button"
                onClick={addParameter}
                className="text-xs flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 font-medium transition-all"
              >
                <Plus className="w-3 h-3" /> Add Parâmetro
              </button>
            </div>

            <div className="space-y-2">
              {formData.parameters.map((param, idx) => (
                <div
                  key={idx}
                  className={`bg-white rounded-lg border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 ${!param.active ? 'opacity-60' : ''}`}
                >
                  {/* Linha principal */}
                  <div className="p-3 flex flex-col md:flex-row gap-3 items-start">
                    {/* Tipo do parâmetro */}
                    <div className="w-28 shrink-0">
                      <select
                        value={param.parameter_type}
                        onChange={(e) => updateParameter(idx, 'parameter_type', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-purple-500 focus:outline-none"
                        title="Tipo do parâmetro"
                      >
                        <option value="flag">flag</option>
                        <option value="positional">positional</option>
                        <option value="internal">internal</option>
                        <option value="generated">generated</option>
                      </select>
                    </div>
                    {/* Flag CLI */}
                    <div className={`w-20 shrink-0 ${param.parameter_type !== 'flag' ? 'opacity-30 pointer-events-none' : ''}`}>
                      <input
                        type="text"
                        value={param.flag}
                        onChange={(e) => updateParameter(idx, 'flag', e.target.value)}
                        placeholder="-x"
                        disabled={param.parameter_type !== 'flag'}
                        className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div className="w-40 shrink-0">
                      <input
                        type="text"
                        value={param.name}
                        onChange={(e) => updateParameter(idx, 'name', e.target.value)}
                        placeholder="Nome amigável"
                        className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={param.description}
                        onChange={(e) => updateParameter(idx, 'description', e.target.value)}
                        placeholder="Descrição do parâmetro"
                        className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-4 shrink-0 h-8 self-center">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={param.required}
                          onChange={(e) => updateParameter(idx, 'required', e.target.checked)}
                          className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Obrig.</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => removeParameter(idx)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {/* Linha secundária — campos estendidos */}
                  <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2 flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ordem</span>
                      <input
                        type="number"
                        min={0}
                        value={param.order_index}
                        onChange={(e) => updateParameter(idx, 'order_index', e.target.value)}
                        className="w-14 px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo dado</span>
                      <select
                        value={param.data_type}
                        onChange={(e) => updateParameter(idx, 'data_type', e.target.value)}
                        className="px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      >
                        <option value="text">text</option>
                        <option value="number">number</option>
                        <option value="date">date</option>
                        <option value="datetime">datetime</option>
                        <option value="boolean">boolean</option>
                        <option value="path">path</option>
                        <option value="list">list</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Default</span>
                      <input
                        type="text"
                        value={param.default_value}
                        onChange={(e) => updateParameter(idx, 'default_value', e.target.value)}
                        placeholder="valor padrão"
                        className="w-full px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Exemplo</span>
                      <input
                        type="text"
                        value={param.example_value}
                        onChange={(e) => updateParameter(idx, 'example_value', e.target.value)}
                        placeholder="ex: /caminho/arquivo"
                        className="w-full px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Regex</span>
                      <input
                        type="text"
                        value={param.validation_regex}
                        onChange={(e) => updateParameter(idx, 'validation_regex', e.target.value)}
                        placeholder="^[A-Z].*"
                        className="w-full px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none ml-auto">
                      <input
                        type="checkbox"
                        checked={param.active}
                        onChange={(e) => updateParameter(idx, 'active', e.target.checked)}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Ativo</span>
                    </label>
                  </div>
                </div>
              ))}
              {formData.parameters.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-400 italic bg-slate-100/50 rounded-lg border border-dashed border-slate-200">
                  Nenhum parâmetro configurado ainda.
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-purple-600 text-white font-semibold py-2.5 rounded-lg hover:bg-purple-700 transition-colors shadow-md shadow-purple-600/20"
            >
              {editingId !== null ? 'Salvar Alterações' : 'Criar Tipo de Job'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setIsAdding(false);
                resetForm();
              }}
              className="px-6 bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg hover:bg-slate-300 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando jobs...
        </div>
      ) : (
        <div className="space-y-6">
          {jobsData.map((job) => (
            <div key={job.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group">
              <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">
                    Tipo {job.id}: {job.name}
                  </h3>
                  <code className="text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded mt-2 inline-block border border-purple-100">
                    {job.script}
                  </code>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(job)}
                    className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                    title="Editar Job"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeJob(job.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Excluir Job"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm text-slate-600 mb-4">{job.description}</p>
                <h4 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4" /> Parâmetros do Script
                </h4>
                <div className="grid gap-3">
                  {job.parameters?.map((param, idx) => {
                    const typeBadgeClass: Record<string, string> = {
                      flag:      'bg-purple-50 text-purple-700 border-purple-100',
                      positional:'bg-blue-50   text-blue-700   border-blue-100',
                      internal:  'bg-slate-100 text-slate-500  border-slate-200',
                      generated: 'bg-amber-50  text-amber-700  border-amber-100',
                    };
                    return (
                      <div key={idx} className={`flex items-start gap-3 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100 ${param.active === false ? 'opacity-50' : ''}`}>
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          {param.flag ? (
                            <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border shadow-sm">
                              {param.flag}
                            </span>
                          ) : (
                            <span className="font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-dashed shadow-sm text-xs">
                              —
                            </span>
                          )}
                          <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${typeBadgeClass[param.parameter_type] ?? typeBadgeClass.flag}`}>
                            {param.parameter_type}
                          </span>
                          {param.data_type && param.data_type !== 'text' && (
                            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border bg-teal-50 text-teal-700 border-teal-100">
                              {param.data_type}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-700">{param.name}</span>
                            {param.required ? (
                              <span className="text-[10px] uppercase tracking-wider font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Obrigatório</span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Opcional</span>
                            )}
                            {param.active === false && (
                              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Inativo</span>
                            )}
                          </div>
                          <p className="text-slate-500 mt-1">{param.description}</p>
                          {(param.default_value || param.example_value) && (
                            <div className="flex gap-3 mt-1.5 flex-wrap">
                              {param.default_value && (
                                <span className="text-[10px] text-slate-500">
                                  <span className="font-bold">default:</span>{' '}
                                  <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{param.default_value}</code>
                                </span>
                              )}
                              {param.example_value && (
                                <span className="text-[10px] text-slate-500">
                                  <span className="font-bold">ex:</span>{' '}
                                  <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{param.example_value}</code>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {(!job.parameters || job.parameters.length === 0) && (
                    <div className="text-xs text-slate-400 italic">Sem parâmetros definidos.</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
