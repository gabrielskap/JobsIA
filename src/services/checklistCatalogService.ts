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

export const checklistCatalogService = {
  async getAdminAll(): Promise<{ data: ChecklistCatalogItem[]; error: string | null }> {
    try {
      const data = await api.get<ChecklistCatalogItem[]>('/checklist-catalog/admin');
      return { data, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar o catálogo oficial.';
      console.error('checklistCatalogService.getAdminAll:', error);
      return { data: [], error: message };
    }
  },

  async importItems(items: ChecklistCatalogImportItem[]): Promise<{ data: ImportResult | null; error: string | null }> {
    try {
      const data = await api.post<ImportResult>('/checklist-catalog/import', { items });
      return { data, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar o catálogo oficial.';
      console.error('checklistCatalogService.importItems:', error);
      return { data: null, error: message };
    }
  },
};
