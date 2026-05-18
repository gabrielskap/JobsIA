import { supabase } from '../lib/supabase';
import type { JobType, JobParameter, JobTypeWithParameters } from '../types/database';
import { jobs as initialJobs } from '../data/knowledgeBase';

const TYPES_TABLE = 'JobsIA_types';
const PARAMS_TABLE = 'JobsIA_parameters';

export const jobService = {
  async getAll(): Promise<JobTypeWithParameters[]> {
    const { data: types, error: typesError } = await supabase
      .from(TYPES_TABLE)
      .select('*')
      .order('id', { ascending: true });
    if (typesError) { console.error('jobService.getAll types:', typesError); return []; }

    const { data: params, error: paramsError } = await supabase
      .from(PARAMS_TABLE)
      .select('*')
      .order('job_type_id', { ascending: true })
      .order('order_index', { ascending: true });
    if (paramsError) { console.error('jobService.getAll params:', paramsError); return []; }

    return (types ?? []).map(type => ({
      ...type,
      parameters: (params ?? []).filter(p => p.job_type_id === type.id),
    }));
  },

  async create(
    job: Omit<JobType, 'created_at'>,
    parameters: Omit<JobParameter, 'id' | 'job_type_id'>[]
  ): Promise<JobTypeWithParameters | null> {
    const { data: createdJob, error: jobError } = await supabase
      .from(TYPES_TABLE)
      .insert({ id: job.id, name: job.name, script: job.script, description: job.description })
      .select()
      .single();
    if (jobError) { console.error('jobService.create job:', jobError); return null; }

    if (parameters.length > 0) {
      const rows = parameters.map(p => ({ ...p, job_type_id: createdJob.id }));
      const { error: paramsError } = await supabase.from(PARAMS_TABLE).insert(rows);
      if (paramsError) console.error('jobService.create params:', paramsError);
    }

    const { data: createdParams } = await supabase
      .from(PARAMS_TABLE)
      .select('*')
      .eq('job_type_id', createdJob.id);

    return { ...createdJob, parameters: createdParams ?? [] };
  },

  async update(
    id: number,
    job: Partial<Omit<JobType, 'created_at'>>,
    parameters: Omit<JobParameter, 'id' | 'job_type_id'>[]
  ): Promise<JobTypeWithParameters | null> {
    const newId = job.id ?? id;

    // Deletar parâmetros antes para liberar a FK do id antigo
    await supabase.from(PARAMS_TABLE).delete().eq('job_type_id', id);

    const { data: updatedJob, error: jobError } = await supabase
      .from(TYPES_TABLE)
      .update(job)
      .eq('id', id)
      .select()
      .single();
    if (jobError) { console.error('jobService.update job:', jobError); return null; }

    if (parameters.length > 0) {
      const rows = parameters.map(p => ({ ...p, job_type_id: newId }));
      const { error: paramsError } = await supabase.from(PARAMS_TABLE).insert(rows);
      if (paramsError) console.error('jobService.update params:', paramsError);
    }

    const { data: updatedParams } = await supabase
      .from(PARAMS_TABLE)
      .select('*')
      .eq('job_type_id', newId);

    return { ...updatedJob, parameters: updatedParams ?? [] };
  },

  async remove(id: number): Promise<boolean> {
    // Parâmetros devem cascadear via FK; se não tiver CASCADE, deletar manualmente
    await supabase.from(PARAMS_TABLE).delete().eq('job_type_id', id);
    const { error } = await supabase.from(TYPES_TABLE).delete().eq('id', id);
    if (error) { console.error('jobService.remove:', error); return false; }
    return true;
  },

  async seedIfEmpty(): Promise<void> {
    const { count, error } = await supabase
      .from(TYPES_TABLE)
      .select('*', { count: 'exact', head: true });
    if (error || (count ?? 0) > 0) return;

    for (const job of initialJobs) {
      const { data: createdJob, error: jobError } = await supabase
        .from(TYPES_TABLE)
        .insert({ id: job.id, name: job.name, script: job.script, description: job.description })
        .select()
        .single();
      if (jobError) { console.error('jobService.seedIfEmpty job:', jobError); continue; }

      if (job.parameters.length > 0) {
        const rows = job.parameters.map((p, i) => ({
          job_type_id: createdJob.id,
          flag: p.flag ?? null,
          name: p.name,
          required: p.required,
          description: p.description,
          parameter_type: p.parameter_type ?? 'flag',
          order_index: i,
          data_type: 'text',
          active: true,
        }));
        await supabase.from(PARAMS_TABLE).insert(rows);
      }
    }
  },
};
