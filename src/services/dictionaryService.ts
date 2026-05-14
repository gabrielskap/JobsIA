import { supabase } from '../lib/supabase';
import type { DictionaryTerm } from '../types/database';
import { dictionary as initialDictionary } from '../data/knowledgeBase';

const TABLE = 'JobsIA_dictionary_terms';

export const dictionaryService = {
  async getAll(): Promise<DictionaryTerm[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.error('dictionaryService.getAll:', error); return []; }
    return data ?? [];
  },

  async create(term: Omit<DictionaryTerm, 'id' | 'created_at'>): Promise<DictionaryTerm | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(term)
      .select()
      .single();
    if (error) { console.error('dictionaryService.create:', error); return null; }
    return data;
  },

  async update(id: string, updates: Partial<Omit<DictionaryTerm, 'id' | 'created_at'>>): Promise<DictionaryTerm | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error('dictionaryService.update:', error); return null; }
    return data;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) { console.error('dictionaryService.remove:', error); return false; }
    return true;
  },

  async seedIfEmpty(): Promise<void> {
    const { count, error } = await supabase
      .from(TABLE)
      .select('*', { count: 'exact', head: true });
    if (error || (count ?? 0) > 0) return;
    const rows = initialDictionary.map(d => ({
      term: d.term,
      definition: d.definition,
      category: d.category,
    }));
    await supabase.from(TABLE).insert(rows);
  },
};
