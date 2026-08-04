import { api } from '../lib/api';
import type { NormRule } from '../types/database';
import { norms as initialNorms } from '../data/knowledgeBase';

export const normService = {
  async getAll(): Promise<NormRule[]> {
    try {
      return await api.get<NormRule[]>('/norms');
    } catch (err) {
      console.error('normService.getAll:', err);
      return [];
    }
  },

  async create(rule: Omit<NormRule, 'id' | 'created_at'>): Promise<{ data: NormRule | null; error: string | null }> {
    try {
      const data = await api.post<NormRule>('/norms', rule);
      return { data, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar norma';
      console.error('normService.create:', err);
      return { data: null, error: msg };
    }
  },

  async update(id: string, updates: Partial<Omit<NormRule, 'id' | 'created_at'>>): Promise<NormRule | null> {
    try {
      return await api.put<NormRule>(`/norms/${id}`, updates);
    } catch (err) {
      console.error('normService.update:', err);
      return null;
    }
  },

  async updateApplicability(
    id: string,
    aplicabilidadeJob: number[] | null
  ): Promise<{ data: NormRule | null; error: string | null }> {
    try {
      const data = await api.put<NormRule>(`/norms/${id}/applicability`, {
        aplicabilidade_job: aplicabilidadeJob,
      });
      return { data, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar a aplicabilidade da regra';
      console.error('normService.updateApplicability:', err);
      return { data: null, error: msg };
    }
  },

  async remove(id: string): Promise<boolean> {
    try {
      await api.delete(`/norms/${id}`);
      return true;
    } catch (err) {
      console.error('normService.remove:', err);
      return false;
    }
  },

  async seedIfEmpty(): Promise<void> {
    try {
      const items = initialNorms.rules.map(r => ({ environment: r.environment, rule: r.rule }));
      await api.post('/norms/seed', { items });
    } catch (err) {
      console.error('normService.seedIfEmpty:', err);
    }
  },
};
