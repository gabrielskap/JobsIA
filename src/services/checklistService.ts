import { supabase } from '../lib/supabase';
import type { Checklist } from '../types/database';

const TABLE = 'JobsIA_checklists';

export const checklistService = {
  async getAll(): Promise<Checklist[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('checklistService.getAll:', error); return []; }
    return data ?? [];
  },

  async create(checklist: Omit<Checklist, 'id' | 'created_at'>): Promise<Checklist | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(checklist)
      .select()
      .single();
    if (error) { console.error('checklistService.create:', error); return null; }
    return data;
  },
};
