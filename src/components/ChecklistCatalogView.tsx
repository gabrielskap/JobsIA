import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Edit2,
  FileUp,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { checklistCatalogService, type ChecklistCatalogImportItem } from '../services/checklistCatalogService';
import type { ChecklistCatalogItem, ChecklistCatalogKind } from '../types/database';

type CatalogForm = {
  kind: ChecklistCatalogKind;
  code: string;
  name: string;
  description: string;
  officialVersion: string;
  active: boolean;
};

const emptyForm = (): CatalogForm => ({
  kind: 'GENERIC',
  code: '',
  name: '',
  description: '',
  officialVersion: '',
  active: true,
});

function toImportItem(item: ChecklistCatalogItem, active = item.active): ChecklistCatalogImportItem {
  return {
    kind: item.kind,
    code: item.code,
    name: item.name,
    description: item.description ?? null,
    official_version: item.official_version ?? null,
    metadata: item.metadata ?? {},
    active,
  };
}

export function ChecklistCatalogView() {
  const { profile, user } = useAuth();
  const isAdmin = (profile?.role ?? user?.role)?.toUpperCase() === 'ADMIN';
  const [items, setItems] = useState<ChecklistCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [filterKind, setFilterKind] = useState<'ALL' | ChecklistCatalogKind>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [search, setSearch] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistCatalogItem | null>(null);
  const [form, setForm] = useState<CatalogForm>(emptyForm);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importPayload, setImportPayload] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCatalog = async () => {
    setLoading(true);
    setLoadError(null);
    const result = await checklistCatalogService.getAdminAll();
    setItems(result.data);
    setLoadError(result.error);
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void loadCatalog();
  }, [isAdmin]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return items.filter(item => {
      if (filterKind !== 'ALL' && item.kind !== filterKind) return false;
      if (filterStatus === 'ACTIVE' && !item.active) return false;
      if (filterStatus === 'INACTIVE' && item.active) return false;
      if (!normalizedSearch) return true;
      return [item.code, item.name, item.description ?? '', item.official_version ?? '']
        .some(value => value.toLocaleLowerCase('pt-BR').includes(normalizedSearch));
    });
  }, [filterKind, filterStatus, items, search]);

  const counts = useMemo(() => ({
    generic: items.filter(item => item.kind === 'GENERIC').length,
    bridge: items.filter(item => item.kind === 'BRIDGE').length,
    active: items.filter(item => item.active).length,
  }), [items]);

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingItem(null);
    setForm(emptyForm());
  };

  const openNewEditor = () => {
    setNotice(null);
    setEditingItem(null);
    setForm(emptyForm());
    setIsEditorOpen(true);
  };

  const openEditEditor = (item: ChecklistCatalogItem) => {
    setNotice(null);
    setEditingItem(item);
    setForm({
      kind: item.kind,
      code: item.code,
      name: item.name,
      description: item.description ?? '',
      officialVersion: item.official_version ?? '',
      active: item.active,
    });
    setIsEditorOpen(true);
  };

  const refreshAfterSave = async (successMessage: string) => {
    const result = await checklistCatalogService.getAdminAll();
    setItems(result.data);
    setLoadError(result.error);
    setNotice(result.error
      ? { kind: 'error', text: `${successMessage} Não foi possível atualizar a listagem: ${result.error}` }
      : { kind: 'success', text: successMessage });
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const code = form.code.trim().toLocaleUpperCase('pt-BR');
    const name = form.name.trim();
    if (!code || !name) {
      setNotice({ kind: 'error', text: 'Informe o código e o nome oficial do item.' });
      return;
    }
    if (!editingItem && items.some(item => item.kind === form.kind && item.code === code)) {
      setNotice({ kind: 'error', text: 'Já existe um item com este tipo e código. Use Editar para atualizá-lo.' });
      return;
    }

    const wasEditing = Boolean(editingItem);
    setSaving(true);
    const result = await checklistCatalogService.importItems([{
      kind: form.kind,
      code,
      name,
      description: form.description.trim() || null,
      official_version: form.officialVersion.trim() || null,
      metadata: editingItem?.metadata ?? {},
      active: form.active,
    }]);
    setSaving(false);
    if (result.error) {
      setNotice({ kind: 'error', text: result.error });
      return;
    }
    closeEditor();
    await refreshAfterSave(wasEditing ? 'Item oficial atualizado.' : 'Item oficial incluído.');
  };

  const handleToggleActive = async (item: ChecklistCatalogItem) => {
    const action = item.active ? 'desativar' : 'ativar';
    if (!confirm(`Deseja ${action} o item ${item.code}?`)) return;

    setSaving(true);
    setNotice(null);
    const result = await checklistCatalogService.importItems([toImportItem(item, !item.active)]);
    setSaving(false);
    if (result.error) {
      setNotice({ kind: 'error', text: result.error });
      return;
    }
    await refreshAfterSave(item.active
      ? 'Item desativado. Ele deixa de ser aceito nas novas validações.'
      : 'Item reativado.');
  };

  const handleImport = async (event: FormEvent) => {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(importPayload);
    } catch {
      setNotice({ kind: 'error', text: 'O conteúdo de importação não é um JSON válido.' });
      return;
    }

    const importedItems = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : null;
    if (!importedItems || importedItems.length === 0) {
      setNotice({ kind: 'error', text: 'Informe um array de itens ou um objeto no formato { "items": [...] }.' });
      return;
    }

    setSaving(true);
    const result = await checklistCatalogService.importItems(importedItems as ChecklistCatalogImportItem[]);
    setSaving(false);
    if (result.error) {
      setNotice({ kind: 'error', text: result.error });
      return;
    }
    setIsImportOpen(false);
    setImportPayload('');
    await refreshAfterSave(`${result.data?.imported ?? importedItems.length} item(ns) oficial(is) importado(s).`);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-800">Catálogo Oficial</h2>
        <p className="mt-2 text-slate-600">Esta área é restrita a administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b pb-4 flex flex-col gap-4 md:flex-row md:justify-between md:items-end">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <Database className="w-6 h-6 text-cyan-700" />
            Catálogo Oficial
          </h2>
          <p className="text-slate-600 mt-1 max-w-3xl">
            Cadastre os genéricos e as pontes aprovados pela DIOT. Apenas itens ativos são aceitos na validação de checklists.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void loadCatalog()}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button
            onClick={() => { setNotice(null); setIsImportOpen(true); }}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-800 text-sm font-medium hover:bg-cyan-100 disabled:opacity-50"
          >
            <FileUp className="w-4 h-4" /> Importar JSON
          </button>
          <button
            onClick={openNewEditor}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-700 text-white text-sm font-medium hover:bg-cyan-800 shadow-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Novo item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Genéricos" value={counts.generic} />
        <SummaryCard label="Pontes" value={counts.bridge} />
        <SummaryCard label="Ativos" value={counts.active} variant="active" />
      </div>

      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${
          notice.kind === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {notice.kind === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          Não foi possível carregar o catálogo: {loadError}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por código, nome ou versão"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterKind}
              onChange={event => setFilterKind(event.target.value as 'ALL' | ChecklistCatalogKind)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="ALL">Todos os tipos</option>
              <option value="GENERIC">Genéricos</option>
              <option value="BRIDGE">Pontes</option>
            </select>
            <select
              value={filterStatus}
              onChange={event => setFilterStatus(event.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="ALL">Todos os status</option>
              <option value="ACTIVE">Ativos</option>
              <option value="INACTIVE">Inativos</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando catálogo...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-14 px-6 text-center text-slate-500">
            {items.length === 0
              ? 'Nenhum item oficial foi cadastrado. Importe a relação aprovada pela DIOT.'
              : 'Nenhum item corresponde aos filtros informados.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left p-4 font-semibold">Tipo</th>
                  <th className="text-left p-4 font-semibold">Código</th>
                  <th className="text-left p-4 font-semibold">Nome oficial</th>
                  <th className="text-left p-4 font-semibold">Versão</th>
                  <th className="text-left p-4 font-semibold">Status</th>
                  <th className="text-right p-4 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(item => (
                  <tr key={item.id} className="group hover:bg-slate-50/80">
                    <td className="p-4">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold ${
                        item.kind === 'GENERIC' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
                      }`}>
                        {item.kind === 'GENERIC' ? 'Genérico' : 'Ponte'}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs font-semibold text-slate-700">{item.code}</td>
                    <td className="p-4">
                      <p className="font-medium text-slate-800">{item.name}</p>
                      {item.description && <p className="mt-0.5 text-xs text-slate-500 max-w-md">{item.description}</p>}
                    </td>
                    <td className="p-4 text-slate-600">{item.official_version || '—'}</td>
                    <td className="p-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                        item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {item.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEditEditor(item)}
                        disabled={saving}
                        className="p-2 text-slate-400 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg disabled:opacity-50"
                        title="Editar item"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleToggleActive(item)}
                        disabled={saving}
                        className={`p-2 rounded-lg disabled:opacity-50 ${
                          item.active
                            ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                            : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={item.active ? 'Desativar item' : 'Ativar item'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isEditorOpen && (
        <CatalogEditor
          form={form}
          editing={Boolean(editingItem)}
          saving={saving}
          onChange={setForm}
          onClose={closeEditor}
          onSubmit={handleSave}
        />
      )}

      {isImportOpen && (
        <CatalogImportDialog
          value={importPayload}
          saving={saving}
          onChange={setImportPayload}
          onClose={() => setIsImportOpen(false)}
          onSubmit={handleImport}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, variant }: { label: string; value: number; variant?: 'active' }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${
      variant === 'active' ? 'bg-white border-emerald-100' : 'bg-white border-slate-200'
    }`}>
      <p className={`text-xs font-bold tracking-wider uppercase ${variant === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${variant === 'active' ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function CatalogEditor({
  form,
  editing,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: CatalogForm;
  editing: boolean;
  saving: boolean;
  onChange: (form: CatalogForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/30 backdrop-blur-sm p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title">
      <form onSubmit={onSubmit} className="w-full max-w-2xl max-h-[100dvh] overflow-y-auto bg-white p-5 sm:p-6 rounded-t-2xl sm:rounded-2xl shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 id="catalog-editor-title" className="font-semibold text-slate-800">{editing ? 'Editar item oficial' : 'Novo item oficial'}</h3>
            <p className="mt-1 text-sm text-slate-500">O código identifica o item usado na validação.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo</span>
            <select
              value={form.kind}
              disabled={editing}
              onChange={event => onChange({ ...form, kind: event.target.value as ChecklistCatalogKind })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white disabled:bg-slate-100"
            >
              <option value="GENERIC">Genérico</option>
              <option value="BRIDGE">Ponte</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Código</span>
            <input
              required
              value={form.code}
              disabled={editing}
              onChange={event => onChange({ ...form, code: event.target.value.toLocaleUpperCase('pt-BR') })}
              placeholder="Ex.: GENERIC-OFICIAL-001"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono disabled:bg-slate-100"
            />
            {editing && <span className="block text-xs text-slate-400">Tipo e código não mudam; desative e crie um novo item se necessário.</span>}
          </label>
        </div>
        <label className="space-y-1.5 block">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Nome oficial</span>
          <input required value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} placeholder="Nome aprovado na fonte oficial" className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </label>
        <label className="space-y-1.5 block">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição</span>
          <textarea rows={3} value={form.description} onChange={event => onChange({ ...form, description: event.target.value })} placeholder="Referência, finalidade ou observação da fonte oficial" className="w-full px-3 py-2 border border-slate-200 rounded-lg resize-y" />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <label className="space-y-1.5">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Versão oficial</span>
            <input value={form.officialVersion} onChange={event => onChange({ ...form, officialVersion: event.target.value })} placeholder="Ex.: DIOT-2026.08" className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </label>
          <label className="inline-flex items-center gap-2 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.active} onChange={event => onChange({ ...form, active: event.target.checked })} className="w-4 h-4 accent-cyan-700" />
            Item ativo para validação
          </label>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-700 font-medium hover:bg-slate-200">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-700 text-white font-semibold hover:bg-cyan-800 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? 'Salvar alterações' : 'Adicionar ao catálogo'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CatalogImportDialog({
  value,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const placeholder = `{
  "items": [
    {
      "kind": "GENERIC",
      "code": "GENERIC-OFICIAL-001",
      "name": "Nome aprovado do genérico",
      "official_version": "DIOT-2026.08",
      "active": true
    },
    {
      "kind": "BRIDGE",
      "code": "PONTE-OFICIAL-001",
      "name": "Nome aprovado da ponte",
      "active": true
    }
  ]
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/30 backdrop-blur-sm p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="catalog-import-title">
      <form onSubmit={onSubmit} className="w-full max-w-3xl max-h-[100dvh] overflow-y-auto bg-white p-5 sm:p-6 rounded-t-2xl sm:rounded-2xl shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 id="catalog-import-title" className="font-semibold text-slate-800">Importar catálogo oficial</h3>
            <p className="mt-1 text-sm text-slate-500">A importação inclui ou atualiza cada combinação de tipo e código. Revise a fonte oficial antes de salvar.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          required
          rows={14}
          spellCheck={false}
          placeholder={placeholder}
          className="w-full px-3 py-3 border border-slate-200 rounded-lg font-mono text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
        />
        <p className="text-xs text-slate-500">Campos aceitos: <code>kind</code> (GENERIC ou BRIDGE), <code>code</code>, <code>name</code>, <code>description</code>, <code>official_version</code>, <code>metadata</code> e <code>active</code>.</p>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-700 font-medium hover:bg-slate-200">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-700 text-white font-semibold hover:bg-cyan-800 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Importar itens
          </button>
        </div>
      </form>
    </div>
  );
}
