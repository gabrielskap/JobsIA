import { api } from '../lib/api';
import type { Checklist } from '../types/database';

export const checklistService = {
  async getAll(userId?: string): Promise<Checklist[]> {
    try {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return await api.get<Checklist[]>(`/checklists${qs}`);
    } catch (err) {
      console.error('checklistService.getAll:', err);
      return [];
    }
  },

  async create(
    checklist: Partial<Checklist> & {
      request_id?: string;
      job_type_id?: number;
      collected_data?: Record<string, any>;
    }
  ): Promise<Checklist | null> {
    try {
      return await api.post<Checklist>('/checklists', checklist);
    } catch (err) {
      console.error('checklistService.create:', err);
      return null;
    }
  },
};
