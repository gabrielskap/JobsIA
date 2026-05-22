import { api } from '../lib/api';
import type { JobType, JobParameter, JobTypeWithParameters } from '../types/database';
import { jobs as initialJobs } from '../data/knowledgeBase';

export const jobService = {
  async getAll(): Promise<JobTypeWithParameters[]> {
    try {
      return await api.get<JobTypeWithParameters[]>('/jobs');
    } catch (err) {
      console.error('jobService.getAll:', err);
      return [];
    }
  },

  async create(
    job: Omit<JobType, 'created_at'>,
    parameters: Omit<JobParameter, 'id' | 'job_type_id'>[]
  ): Promise<JobTypeWithParameters | null> {
    try {
      return await api.post<JobTypeWithParameters>('/jobs', { job, parameters });
    } catch (err) {
      console.error('jobService.create:', err);
      return null;
    }
  },

  async update(
    id: number,
    job: Partial<Omit<JobType, 'created_at'>>,
    parameters: Omit<JobParameter, 'id' | 'job_type_id'>[]
  ): Promise<JobTypeWithParameters | null> {
    try {
      return await api.put<JobTypeWithParameters>(`/jobs/${id}`, { job, parameters });
    } catch (err) {
      console.error('jobService.update:', err);
      return null;
    }
  },

  async remove(id: number): Promise<boolean> {
    try {
      await api.delete(`/jobs/${id}`);
      return true;
    } catch (err) {
      console.error('jobService.remove:', err);
      return false;
    }
  },

  async seedIfEmpty(): Promise<void> {
    try {
      const { seeded } = await api.post<{ seeded: boolean }>('/jobs/seed');
      if (!seeded) return;
      for (const job of initialJobs) {
        await jobService.create(
          { id: job.id, name: job.name, script: job.script, description: job.description },
          job.parameters.map((p, i) => ({
            flag: p.flag ?? null,
            name: p.name,
            required: p.required,
            description: p.description,
            parameter_type: p.parameter_type ?? 'flag',
            order_index: i,
            data_type: 'text',
            default_value: null,
            example_value: null,
            validation_regex: null,
            active: true,
          }))
        );
      }
    } catch (err) {
      console.error('jobService.seedIfEmpty:', err);
    }
  },
};
