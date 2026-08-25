import { api } from '../lib/api';
import type { ChecklistCatalogItem, ChecklistCatalogKind } from '../types/database';

export interface ChecklistCatalogImportItem {
  kind: ChecklistCatalogKind;
  code: string;
  name: string;
  description?: string | null;
  official_version?: string | null;
  metadata?: Record<string, unknown>;
  active?: boolean;
}

interface ImportResult {
  imported: number;
}

export interface CatalogDocument {
  id: string;
  filename: string;
  file_size: number;
  total_pages: number;
  summary: string;
  status: 'PROCESSANDO' | 'VETORIZADO' | 'FALHA';
  metadata?: Record<string, unknown>;
  chunks_count: number;
  created_at: string;
}

export interface CatalogDocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  page_number: number;
  chunk_text: string;
  token_count: number;
  created_at: string;
}

export interface SemanticSearchResult {
  id: string;
  document_id: string;
  filename: string;
  page_number: number;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
}

export interface PdfUploadResult {
  message: string;
  document: CatalogDocument;
  detected_candidates: ChecklistCatalogImportItem[];
}

export const checklistCatalogService = {
  async getAll(kind?: ChecklistCatalogKind): Promise<{ data: ChecklistCatalogItem[]; error: string | null }> {
    try {
      const data = await api.get<ChecklistCatalogItem[]>(kind ? `/checklist-catalog?kind=${kind}` : '/checklist-catalog');
      return { data, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar o catálogo.';
      console.error('checklistCatalogService.getAll:', error);
      return { data: [], error: message };
    }
  },

  async getAdminAll(): Promise<{ data: ChecklistCatalogItem[]; error: string | null }> {
    try {
      const data = await api.get<ChecklistCatalogItem[]>('/checklist-catalog/admin');
      return { data, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar o catálogo.';
      console.error('checklistCatalogService.getAdminAll:', error);
      return { data: [], error: message };
    }
  },

  async importItems(items: ChecklistCatalogImportItem[]): Promise<{ data: ImportResult | null; error: string | null }> {
    try {
      const data = await api.post<ImportResult>('/checklist-catalog/import', { items });
      return { data, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar o catálogo.';
      console.error('checklistCatalogService.importItems:', error);
      return { data: null, error: message };
    }
  },

  async uploadPdf(file: File): Promise<{ data: PdfUploadResult | null; error: string | null }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await api.postForm<PdfUploadResult>('/checklist-catalog/upload-pdf', formData);
      return { data, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao enviar e vetorizar o PDF.';
      console.error('checklistCatalogService.uploadPdf:', error);
      return { data: null, error: message };
    }
  },

  async getDocuments(): Promise<{ data: CatalogDocument[]; error: string | null }> {
    try {
      const data = await api.get<CatalogDocument[]>('/checklist-catalog/documents');
      return { data, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar documentos do catálogo.';
      console.error('checklistCatalogService.getDocuments:', error);
      return { data: [], error: message };
    }
  },

  async getDocumentChunks(documentId: string): Promise<{ data: CatalogDocumentChunk[]; error: string | null }> {
    try {
      const data = await api.get<CatalogDocumentChunk[]>(`/checklist-catalog/documents/${documentId}/chunks`);
      return { data, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar trechos do documento.';
      console.error('checklistCatalogService.getDocumentChunks:', error);
      return { data: [], error: message };
    }
  },

  async deleteDocument(documentId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      await api.delete(`/checklist-catalog/documents/${documentId}`);
      return { success: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao excluir documento do catálogo.';
      console.error('checklistCatalogService.deleteDocument:', error);
      return { success: false, error: message };
    }
  },

  async searchSemantic(query: string, limit = 5): Promise<{ data: SemanticSearchResult[]; error: string | null }> {
    try {
      const res = await api.post<{ query: string; results: SemanticSearchResult[] }>('/checklist-catalog/search-semantic', { query, limit });
      return { data: res.results || [], error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao executar busca semântica.';
      console.error('checklistCatalogService.searchSemantic:', error);
      return { data: [], error: message };
    }
  },
};
