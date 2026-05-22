import { api } from '../lib/api';
import type { DictionaryTerm } from '../types/database';
import { dictionary as initialDictionary } from '../data/knowledgeBase';

export const dictionaryService = {
  async getAll(): Promise<DictionaryTerm[]> {
    try {
      return await api.get<DictionaryTerm[]>('/dictionary');
    } catch (err) {
      console.error('dictionaryService.getAll:', err);
      return [];
    }
  },

  async create(term: Omit<DictionaryTerm, 'id' | 'created_at'>): Promise<DictionaryTerm | null> {
    try {
      return await api.post<DictionaryTerm>('/dictionary', term);
    } catch (err) {
      console.error('dictionaryService.create:', err);
      return null;
    }
  },

  async update(id: string, updates: Partial<Omit<DictionaryTerm, 'id' | 'created_at'>>): Promise<DictionaryTerm | null> {
    try {
      return await api.put<DictionaryTerm>(`/dictionary/${id}`, updates);
    } catch (err) {
      console.error('dictionaryService.update:', err);
      return null;
    }
  },

  async remove(id: string): Promise<boolean> {
    try {
      await api.delete(`/dictionary/${id}`);
      return true;
    } catch (err) {
      console.error('dictionaryService.remove:', err);
      return false;
    }
  },

  async seedIfEmpty(): Promise<void> {
    try {
      const items = initialDictionary.map(d => ({
        term: d.term,
        definition: d.definition,
        category: d.category,
      }));
      await api.post('/dictionary/seed', { items });
    } catch (err) {
      console.error('dictionaryService.seedIfEmpty:', err);
    }
  },
};
