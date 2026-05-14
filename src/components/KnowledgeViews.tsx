import { useState, useEffect, FormEvent } from 'react';
import { Book, Database, FileCode, Server, Plus, Trash2, X, Edit2 } from 'lucide-react';
import { dictionary as initialDictionary, jobs, norms } from '../data/knowledgeBase';

export function DictionaryView() {
  const [dictionary, setDictionary] = useState(() => {
    const saved = localStorage.getItem('checklist_jobs_dictionary');
    return saved ? JSON.parse(saved) : initialDictionary;
  });
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newTerm, setNewTerm] = useState({ term: '', definition: '', category: 'Conceito' });

  useEffect(() => {
    localStorage.setItem('checklist_jobs_dictionary', JSON.stringify(dictionary));
  }, [dictionary]);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (newTerm.term.trim() && newTerm.definition.trim()) {
      if (editingIndex !== null) {
        const newList = [...dictionary];
        newList[editingIndex] = newTerm;
        setDictionary(newList);
        setEditingIndex(null);
      } else {
        setDictionary([newTerm, ...dictionary]);
        setIsAdding(false);
      }
      setNewTerm({ term: '', definition: '', category: 'Conceito' });
    }
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setNewTerm(dictionary[index]);
    setIsAdding(false);
  };

  const removeTerm = (index: number) => {
    if (confirm('Tem certeza que deseja excluir este termo?')) {
      const newList = [...dictionary];
      newList.splice(index, 1);
      setDictionary(newList);
      if (editingIndex === index) {
        setEditingIndex(null);
        setNewTerm({ term: '', definition: '', category: 'Conceito' });
      }
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
            setEditingIndex(null);
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

      {(isAdding || editingIndex !== null) && (
        <form 
          onSubmit={handleSave}
          className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 shadow-inner animate-in slide-in-from-top-4 duration-300"
        >
          <h3 className="text-blue-800 font-bold mb-4 flex items-center gap-2">
            {editingIndex !== null ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingIndex !== null ? 'Editar Termo' : 'Adicionar Novo Termo'}
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
              {editingIndex !== null ? 'Salvar Alterações' : 'Salvar Termo no Dicionário'}
            </button>
            {editingIndex !== null && (
              <button
                type="button"
                onClick={() => {
                  setEditingIndex(null);
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dictionary.map((item: any, idx: number) => (
          <div key={idx} className={`bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-all group relative ${editingIndex === idx ? 'ring-2 ring-blue-500 border-transparent bg-blue-50/10' : 'border-slate-200'}`}>
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
              <button
                onClick={() => startEdit(idx)}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                title="Editar termo"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => removeTerm(idx)}
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
    </div>
  );
}

export function NormsView() {
  const [normsData, setNormsData] = useState(() => {
    const saved = localStorage.getItem('checklist_jobs_norms');
    return saved ? JSON.parse(saved) : norms;
  });
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState({ environment: '', rule: '' });

  useEffect(() => {
    localStorage.setItem('checklist_jobs_norms', JSON.stringify(normsData));
  }, [normsData]);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.environment.trim() || !formData.rule.trim()) return;

    if (editingIndex !== null) {
      const updatedRules = [...normsData.rules];
      updatedRules[editingIndex] = formData;
      setNormsData({ ...normsData, rules: updatedRules });
      setEditingIndex(null);
    } else {
      setNormsData({
        ...normsData,
        rules: [...normsData.rules, formData]
      });
      setIsAdding(false);
    }
    setFormData({ environment: '', rule: '' });
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setFormData(normsData.rules[index]);
    setIsAdding(false);
  };

  const removeRule = (index: number) => {
    const updatedRules = normsData.rules.filter((_: any, i: number) => i !== index);
    setNormsData({ ...normsData, rules: updatedRules });
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
            {normsData.title} - Regras que a IA usará para validar as entradas do usuário.
          </p>
        </div>
        <button
          onClick={() => {
            setIsAdding(!isAdding);
            setEditingIndex(null);
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

      {(isAdding || editingIndex !== null) && (
        <form 
          onSubmit={handleSave}
          className="bg-emerald-50/50 p-6 rounded-xl border border-emerald-100 shadow-inner animate-in slide-in-from-top-4 duration-300"
        >
          <h3 className="text-emerald-800 font-bold mb-4 flex items-center gap-2">
            {editingIndex !== null ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingIndex !== null ? 'Editar Regra' : 'Criar Nova Regra de Nomenclatura'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-1 space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Ambiente</label>
              <input
                required
                type="text"
                value={formData.environment}
                onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                placeholder="Ex: Mainframe"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
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
          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-emerald-600 text-white font-semibold py-2.5 rounded-lg hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-600/20"
            >
              {editingIndex !== null ? 'Atualizar Regra' : 'Salvar Nova Regra'}
            </button>
            {editingIndex !== null && (
              <button
                type="button"
                onClick={() => {
                  setEditingIndex(null);
                  setFormData({ environment: '', rule: '' });
                }}
                className="px-6 bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg hover:bg-slate-300 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

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
            {normsData.rules.map((rule: any, idx: number) => (
              <tr key={idx} className={`hover:bg-slate-50 transition-colors group ${editingIndex === idx ? 'bg-emerald-50/30' : ''}`}>
                <td className="p-4 font-medium text-slate-800">{rule.environment}</td>
                <td className="p-4 text-slate-600 text-sm">{rule.rule}</td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(idx)}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      title="Editar regra"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeRule(idx)}
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
    </div>
  );
}

export function JobsView() {
  const [jobsData, setJobsData] = useState(() => {
    const saved = localStorage.getItem('checklist_jobs_list');
    return saved ? JSON.parse(saved) : jobs;
  });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    script: '',
    description: '',
    parameters: [] as { flag: string; name: string; required: boolean; description: string }[]
  });

  useEffect(() => {
    localStorage.setItem('checklist_jobs_list', JSON.stringify(jobsData));
  }, [jobsData]);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.id.trim()) return;

    if (editingId !== null) {
      setJobsData(jobsData.map((j: any) => j.id === editingId ? formData : j));
      setEditingId(null);
    } else {
      if (jobsData.some((j: any) => j.id === formData.id)) {
        alert('Já existe um Job com este ID/Tipo.');
        return;
      }
      setJobsData([...jobsData, formData]);
      setIsAdding(false);
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      script: '',
      description: '',
      parameters: []
    });
  };

  const startEdit = (job: any) => {
    setFormData({ ...job });
    setEditingId(job.id);
    setIsAdding(false);
  };

  const removeJob = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este Tipo de Job?')) {
      setJobsData(jobsData.filter((j: any) => j.id !== id));
    }
  };

  const addParameter = () => {
    setFormData({
      ...formData,
      parameters: [...formData.parameters, { flag: '', name: '', required: true, description: '' }]
    });
  };

  const updateParameter = (idx: number, field: string, value: any) => {
    const newParams = [...formData.parameters];
    newParams[idx] = { ...newParams[idx], [field]: value };
    setFormData({ ...formData, parameters: newParams });
  };

  const removeParameter = (idx: number) => {
    const newParams = formData.parameters.filter((_, i) => i !== idx);
    setFormData({ ...formData, parameters: newParams });
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
                disabled={editingId !== null}
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="Ex: 1"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all disabled:bg-slate-100 disabled:cursor-not-allowed"
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
                <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col md:flex-row gap-3 items-start animate-in zoom-in-95 duration-200">
                  <div className="w-20 shrink-0">
                    <input
                      type="text"
                      value={param.flag}
                      onChange={(e) => updateParameter(idx, 'flag', e.target.value)}
                      placeholder="Flag"
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

      <div className="space-y-6">
        {jobsData.map((job: any) => (
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
                {job.parameters?.map((param: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border shadow-sm">
                      {param.flag}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">{param.name}</span>
                        {param.required ? (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Obrigatório</span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Opcional</span>
                        )}
                      </div>
                      <p className="text-slate-500 mt-1">{param.description}</p>
                    </div>
                  </div>
                ))}
                {(!job.parameters || job.parameters.length === 0) && (
                  <div className="text-xs text-slate-400 italic">Sem parâmetros definidos.</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
