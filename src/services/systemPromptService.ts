import { api } from '../lib/api';

export const systemPromptService = {
  async getActive(): Promise<string | null> {
    try {
      const { content } = await api.get<{ content: string | null }>('/system-prompts/active');
      return content;
    } catch (err) {
      console.error('systemPromptService.getActive:', err);
      return null;
    }
  },

  async save(content: string): Promise<void> {
    try {
      await api.post('/system-prompts', { content });
    } catch (err) {
      console.error('systemPromptService.save:', err);
    }
  },
};
