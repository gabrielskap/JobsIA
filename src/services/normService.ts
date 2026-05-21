import { supabase } from '../lib/supabase';
import type { NormRule } from '../types/database';
import { norms as initialNorms } from '../data/knowledgeBase';

const TABLE = 'JobsIA_norm_rules';

export const normService = {
  async getAll(): Promise<NormRule[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.error('normService.getAll:', error); return []; }
    return data ?? [];
  },

  async create(rule: Omit<NormRule, 'id' | 'created_at'>): Promise<{ data: NormRule | null; error: string | null }> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(rule)
      .select()
      .single();
    if (error) {
      console.error('normService.create:', error);
      return { data: null, error: error.message };
    }
    return { data, error: null };
  },

  async update(id: string, updates: Partial<Omit<NormRule, 'id' | 'created_at'>>): Promise<NormRule | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error('normService.update:', error); return null; }
    return data;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) { console.error('normService.remove:', error); return false; }
    return true;
  },

  async seedIfEmpty(): Promise<void> {
    const { count, error } = await supabase
      .from(TABLE)
      .select('*', { count: 'exact', head: true });
    if (error || (count ?? 0) > 0) return;
    const rows = initialNorms.rules.map(r => ({
      environment: r.environment,
      rule: r.rule,
    }));
    await supabase.from(TABLE).insert(rows);
  },
};
