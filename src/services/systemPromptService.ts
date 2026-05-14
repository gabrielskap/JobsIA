import { supabase } from '../lib/supabase';

const TABLE = 'JobsIA_system_prompts';

export const systemPromptService = {
  async getActive(): Promise<string | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('content')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { console.error('systemPromptService.getActive:', error); return null; }
    return data?.content ?? null;
  },

  async save(content: string): Promise<void> {
    await supabase.from(TABLE).update({ is_active: false }).eq('is_active', true);
    const { error } = await supabase.from(TABLE).insert({ content, is_active: true });
    if (error) console.error('systemPromptService.save:', error);
  },
};
