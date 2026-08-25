import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Edit2,
  FileCode2,
  FileText,
  FileUp,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
  Eye,
  BookOpen,
  Layers,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  checklistCatalogService,
  type ChecklistCatalogImportItem,
  type CatalogDocument,
  type CatalogDocumentChunk,
  type SemanticSearchResult,
  type PdfUploadResult,
} from '../services/checklistCatalogService';
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
  
  // Abas principais
  const [activeTab, setActiveTab] = useState<'items' | 'documents' | 'semantic'>('items');

  // Estado dos Itens
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

  // Estado dos Documentos PDF e Vetores
  const [documents, setDocuments] = useState<CatalogDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [inspectingDoc, setInspectingDoc] = useState<CatalogDocument | null>(null);
  const [docChunks, setDocChunks] = useState<CatalogDocumentChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  // Estado da Busca Semântica
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [semanticSearching, setSemanticSearching] = useState(false);

  const loadCatalog = async () => {
    setLoading(true);
    setLoadError(null);
    const result = isAdmin
      ? await checklistCatalogService.getAdminAll()
      : await checklistCatalogService.getAll();
    setItems(result.data);
    setLoadError(result.error);
    setLoading(false);
  };

  const loadDocuments = async () => {
    setDocsLoading(true);
    const result = await checklistCatalogService.getDocuments();
    setDocuments(result.data);
    setDocsLoading(false);
  };

  useEffect(() => {
    void loadCatalog();
    void loadDocuments();
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
    documents: documents.length,
    chunks: documents.reduce((acc, doc) => acc + (Number(doc.chunks_count) || 0), 0),
  }), [items, documents]);

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
    const result = isAdmin
      ? await checklistCatalogService.getAdminAll()
      : await checklistCatalogService.getAll();
    setItems(result.data);
    setLoadError(result.error);
    void loadDocuments();
    setNotice(result.error
      ? { kind: 'error', text: `${successMessage} Não foi possível atualizar a listagem: ${result.error}` }
      : { kind: 'success', text: successMessage });
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const code = form.code.trim().toLocaleUpperCase('pt-BR');
    const name = form.name.trim();
    if (!code || !name) {
      setNotice({ kind: 'error', text: 'Informe o código e o nome do item.' });
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
    await refreshAfterSave(wasEditing ? 'Item atualizado.' : 'Item incluído.');
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
    await refreshAfterSave(`${result.data?.imported ?? importedItems.length} item(ns) importado(s).`);
  };

  const handleDeleteDocument = async (doc: CatalogDocument) => {
    if (!confirm(`Deseja excluir o documento "${doc.filename}" e todos os seus ${doc.chunks_count} trechos vetorizados?`)) return;
    setDocsLoading(true);
    const res = await checklistCatalogService.deleteDocument(doc.id);
    setDocsLoading(false);
    if (res.error) {
      setNotice({ kind: 'error', text: res.error });
      return;
    }
    await refreshAfterSave(`Documento "${doc.filename}" e seus vetores excluídos.`);
  };

  const handleInspectDocument = async (doc: CatalogDocument) => {
    setInspectingDoc(doc);
    setChunksLoading(true);
    const res = await checklistCatalogService.getDocumentChunks(doc.id);
    setDocChunks(res.data);
    setChunksLoading(false);
  };

  const handleSemanticSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!semanticQuery.trim()) return;
    setSemanticSearching(true);
    const res = await checklistCatalogService.searchSemantic(semanticQuery, 8);
    setSemanticResults(res.data);
    setSemanticSearching(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="border-b pb-4 flex flex-col gap-4 md:flex-row md:justify-between md:items-end">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <Database className="w-6 h-6 text-cyan-700" />
            Catálogo
          </h2>
          <p className="text-slate-600 mt-1 max-w-3xl">
            {isAdmin
              ? 'Gerencie genéricos, pontes, documentos PDF e a base de conhecimento vetorial utilizada pelo assistente de IA.'
              : 'Consulte os genéricos, pontes e documentos técnicos aplicáveis aos checklists e ao assistente.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { void loadCatalog(); void loadDocuments(); }}
            disabled={loading || docsLoading || saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${(loading || docsLoading) ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => { setNotice(null); setIsPdfModalOpen(true); }}
                disabled={saving}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 text-sm font-semibold hover:bg-indigo-100 shadow-sm transition-all disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-indigo-600" /> Importar PDF (Vetorizar)
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
            </>
          )}
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Genéricos" value={counts.generic} icon={BookOpen} color="text-blue-700 bg-blue-50" />
        <SummaryCard label="Pontes" value={counts.bridge} icon={FileCode2} color="text-purple-700 bg-purple-50" />
        <SummaryCard label="Itens Ativos" value={counts.active} icon={CheckCircle2} color="text-emerald-700 bg-emerald-50" />
        <SummaryCard label="PDFs Vetorizados" value={`${counts.documents} (${counts.chunks} trechos)`} icon={Sparkles} color="text-indigo-700 bg-indigo-50" />
      </div>

      {/* Notificações */}
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

      {/* Abas */}
      <div className="flex border-b border-slate-200 gap-1 sm:gap-2">
        <button
          onClick={() => setActiveTab('items')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'items'
              ? 'border-cyan-600 text-cyan-800 bg-cyan-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Database className="w-4 h-4" /> Itens Cadastrados ({items.length})
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'documents'
              ? 'border-indigo-600 text-indigo-800 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" /> Documentos PDF & Vetores ({documents.length})
        </button>
        <button
          onClick={() => setActiveTab('semantic')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'semantic'
              ? 'border-violet-600 text-violet-800 bg-violet-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sparkles className="w-4 h-4" /> Busca Semântica no Catálogo
        </button>
      </div>

      {/* ABA 1: TABELA DE ITENS */}
      {activeTab === 'items' && (
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
              {isAdmin && (
                <select
                  value={filterStatus}
                  onChange={event => setFilterStatus(event.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  <option value="ALL">Todos os status</option>
                  <option value="ACTIVE">Ativos</option>
                  <option value="INACTIVE">Inativos</option>
                </select>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando catálogo...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-14 px-6 text-center text-slate-500">
              {items.length === 0
                ? 'Nenhum item foi cadastrado no catálogo. Importe um PDF ou JSON para começar.'
                : 'Nenhum item corresponde aos filtros informados.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left p-4 font-semibold">Tipo</th>
                    <th className="text-left p-4 font-semibold">Código</th>
                    <th className="text-left p-4 font-semibold">Nome</th>
                    <th className="text-left p-4 font-semibold">Versão</th>
                    <th className="text-left p-4 font-semibold">Status</th>
                    {isAdmin && <th className="text-right p-4 font-semibold">Ações</th>}
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
                      {isAdmin && (
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
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: DOCUMENTOS PDF E VETORES */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">Documentos PDF Indexados na Base Vetorial</h3>
                <p className="text-xs text-slate-500 mt-0.5">Os trechos destes arquivos alimentam a recuperação semântica de conhecimento do assistente de IA.</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setIsPdfModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-sm"
                >
                  <FileUp className="w-3.5 h-3.5" /> Enviar Novo PDF
                </button>
              )}
            </div>

            {docsLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando documentos...
              </div>
            ) : documents.length === 0 ? (
              <div className="py-14 px-6 text-center text-slate-500">
                <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-medium text-slate-700">Nenhum documento PDF importado ainda.</p>
                <p className="text-xs text-slate-400 mt-1">Importe arquivos de especificações técnicas para gerar vetores de busca semântica.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left p-4 font-semibold">Documento</th>
                      <th className="text-left p-4 font-semibold">Páginas</th>
                      <th className="text-left p-4 font-semibold">Trechos Vetorizados</th>
                      <th className="text-left p-4 font-semibold">Tamanho</th>
                      <th className="text-left p-4 font-semibold">Status</th>
                      <th className="text-left p-4 font-semibold">Data</th>
                      <th className="text-right p-4 font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {documents.map(doc => (
                      <tr key={doc.id} className="group hover:bg-slate-50/80">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                            <div>
                              <p className="font-semibold text-slate-800">{doc.filename}</p>
                              {doc.summary && <p className="text-xs text-slate-500 max-w-sm line-clamp-1">{doc.summary}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-xs text-slate-600">{doc.total_pages} pág(s)</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <Sparkles className="w-3 h-3" /> {doc.chunks_count} chunks
                          </span>
                        </td>
                        <td className="p-4 text-xs text-slate-500 font-mono">{(doc.file_size / 1024).toFixed(1)} KB</td>
                        <td className="p-4">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                            {doc.status}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-slate-500">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => void handleInspectDocument(doc)}
                            className="p-1.5 text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg mr-1"
                            title="Visualizar trechos vetorizados"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => void handleDeleteDocument(doc)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              title="Excluir documento e vetores"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 3: BUSCA SEMÂNTICA NO CATÁLOGO */}
      {activeTab === 'semantic' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <form onSubmit={handleSemanticSearch} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Consulta Semântica Vetorial
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Faça perguntas em linguagem natural ou busque conceitos. O sistema compara os vetores dos PDFs indexados e retorna os trechos com maior correspondência semântica.
                </p>
                <div className="flex gap-2">
                  <input
                    value={semanticQuery}
                    onChange={e => setSemanticQuery(e.target.value)}
                    placeholder="Ex.: Quais os requisitos para transferência de arquivos via ponte Connect:Direct?"
                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                  <button
                    type="submit"
                    disabled={semanticSearching || !semanticQuery.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-sm disabled:opacity-50"
                  >
                    {semanticSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar
                  </button>
                </div>
              </div>
            </form>

            {/* Resultados da busca */}
            {semanticSearching && (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <Loader2 className="w-5 h-5 mr-2 animate-spin text-indigo-600" /> Calculando similaridade vetorial nos documentos...
              </div>
            )}

            {!semanticSearching && semanticResults.length > 0 && (
              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {semanticResults.length} Trechos Mais Relevantes Encontrados
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  {semanticResults.map((res, i) => (
                    <div key={res.id || i} className="p-4 border border-indigo-100 rounded-xl bg-indigo-50/20 hover:bg-indigo-50/40 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700">
                          <FileText className="w-3.5 h-3.5" /> {res.filename} (Pág. {res.page_number})
                        </span>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                          Similaridade: {(res.similarity * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">{res.chunk_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Importar e Vetorizar PDF */}
      {isPdfModalOpen && (
        <CatalogPdfUploadModal
          onClose={() => setIsPdfModalOpen(false)}
          onSuccess={async (result) => {
            setIsPdfModalOpen(false);
            await refreshAfterSave(`PDF "${result.document.filename}" importado e vetorizado com ${result.document.chunks_count} trechos.`);
          }}
        />
      )}

      {/* MODAL: Inspecionar Chunks do Documento */}
      {inspectingDoc && (
        <DocumentChunksModal
          document={inspectingDoc}
          chunks={docChunks}
          loading={chunksLoading}
          onClose={() => setInspectingDoc(null)}
        />
      )}

      {/* MODAL: Editar / Novo Item */}
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

      {/* MODAL: Importar JSON */}
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

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon?: any; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
      {Icon && (
        <div className={`p-2.5 rounded-lg shrink-0 ${color || 'text-cyan-700 bg-cyan-50'}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div>
        <p className="text-xs font-bold tracking-wider uppercase text-slate-400">{label}</p>
        <p className="mt-0.5 text-lg sm:text-xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function CatalogPdfUploadModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (result: PdfUploadResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<'IDLE' | 'EXTRACTING' | 'VECTORIZING' | 'SAVING'>('IDLE');
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.name.toLowerCase().endsWith('.pdf')) {
        setError('Selecione um arquivo com extensão .pdf');
        return;
      }
      setFile(selected);
      setError(null);
    }
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setStep('EXTRACTING');

    setTimeout(() => {
      if (uploading) setStep('VECTORIZING');
    }, 1200);

    const result = await checklistCatalogService.uploadPdf(file);
    setUploading(false);

    if (result.error || !result.data) {
      setError(result.error || 'Falha ao processar e vetorizar o PDF.');
      setStep('IDLE');
      return;
    }

    onSuccess(result.data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Importar e Vetorizar PDF
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              O arquivo será dividido em trechos semânticos e indexado na base vetorial do Catálogo.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={uploading} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="border-2 border-dashed border-indigo-200 rounded-xl p-6 text-center hover:bg-indigo-50/30 transition-colors">
            <FileText className="w-10 h-10 mx-auto text-indigo-400 mb-3" />
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
              id="catalog-pdf-input"
            />
            <label
              htmlFor="catalog-pdf-input"
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 text-sm font-semibold rounded-lg hover:bg-indigo-100 transition-colors mb-2"
            >
              <FileUp className="w-4 h-4" /> Selecionar Arquivo PDF
            </label>
            {file ? (
              <p className="text-xs font-semibold text-slate-700 mt-2">
                Arquivo selecionado: <span className="font-mono text-indigo-600">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
              </p>
            ) : (
              <p className="text-xs text-slate-400">PDFs com especificações de genéricos, pontes e normas</p>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-xs">
              {error}
            </div>
          )}

          {uploading && (
            <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2 text-xs text-indigo-900">
              <div className="flex items-center gap-2 font-semibold">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Processando documento...</span>
              </div>
              <p className="text-indigo-700">
                {step === 'EXTRACTING' && 'Extraindo texto e estruturando páginas do PDF...'}
                {step === 'VECTORIZING' && 'Gerando embeddings vetoriais com normalização L2...'}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!file || uploading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 text-sm shadow-sm"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              {uploading ? 'Importando & Vetorizando...' : 'Iniciar Vetorização'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DocumentChunksModal({
  document,
  chunks,
  loading,
  onClose,
}: {
  document: CatalogDocument;
  chunks: CatalogDocumentChunk[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              Trechos Vetorizados: {document.filename}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Total de {document.total_pages} página(s) divididas em {chunks.length} chunks vetorizados.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-5 h-5 mr-2 animate-spin text-indigo-600" /> Carregando trechos...
            </div>
          ) : chunks.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-500">Nenhum trecho encontrado.</p>
          ) : (
            chunks.map(chunk => (
              <div key={chunk.id} className="p-3.5 border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-slate-50">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1.5">
                  <span className="text-indigo-600 font-mono">Chunk #{chunk.chunk_index} (Pág. {chunk.page_number})</span>
                  <span>~{chunk.token_count} tokens</span>
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{chunk.chunk_text}</p>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-100 pt-3 flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 text-sm">
            Fechar
          </button>
        </div>
      </div>
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
            <h3 id="catalog-editor-title" className="font-semibold text-slate-800">{editing ? 'Editar item' : 'Novo item'}</h3>
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
              placeholder="Ex.: GENERIC-001"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono disabled:bg-slate-100"
            />
            {editing && <span className="block text-xs text-slate-400">Tipo e código não mudam; desative e crie um novo item se necessário.</span>}
          </label>
        </div>
        <label className="space-y-1.5 block">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Nome</span>
          <input required value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} placeholder="Nome aprovado do item" className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </label>
        <label className="space-y-1.5 block">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição</span>
          <textarea rows={3} value={form.description} onChange={event => onChange({ ...form, description: event.target.value })} placeholder="Referência, finalidade ou observação" className="w-full px-3 py-2 border border-slate-200 rounded-lg resize-y" />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <label className="space-y-1.5">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Versão</span>
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
      "code": "GENERIC-001",
      "name": "Nome do genérico",
      "official_version": "DIOT-2026.08",
      "active": true
    },
    {
      "kind": "BRIDGE",
      "code": "PONTE-001",
      "name": "Nome da ponte",
      "active": true
    }
  ]
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/30 backdrop-blur-sm p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="catalog-import-title">
      <form onSubmit={onSubmit} className="w-full max-w-3xl max-h-[100dvh] overflow-y-auto bg-white p-5 sm:p-6 rounded-t-2xl sm:rounded-2xl shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 id="catalog-import-title" className="font-semibold text-slate-800">Importar catálogo</h3>
            <p className="mt-1 text-sm text-slate-500">A importação inclui ou atualiza cada combinação de tipo e código. Revise os itens antes de salvar.</p>
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

