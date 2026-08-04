import { ApiRequestError, api } from '../lib/api';
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

  /**
   * Finaliza um checklist orientado a Application (schema_version 2).
   * O backend aplica a validação determinística de todos os jobs antes de
   * persistir qualquer checklist final.
   */
  async createApplication(checklist: Record<string, unknown>): Promise<Checklist | null> {
    try {
      return await api.post<Checklist>('/checklists/application', checklist);
    } catch (err) {
      if (err instanceof ApiRequestError && err.details && typeof err.details === 'object') {
        const details = err.details as {
          status?: string;
          errors?: Checklist['errors'];
          warnings?: Checklist['warnings'];
          suggested_application_name?: string;
          message?: string;
        };
        if (details.status === 'Falha Validação' || details.errors) {
          const suggestion = details.suggested_application_name?.trim();
          return {
            id: '',
            type: 'application_checklist',
            data: {},
            status: 'Falha Validação',
            created_at: new Date().toISOString(),
            errors: details.errors || [],
            warnings: [
              ...(details.warnings || []),
              ...(suggestion ? [{
                ruleCode: 'APPLICATION-SUGGESTION',
                field: 'application.name',
                message: 'Sugestão de nomenclatura publicada: ' + suggestion,
                severity: 'AVISO',
              }] : []),
            ],
          };
        }
        // Uma falha de infraestrutura ou contrato também deve chegar ao chat
        // com sua causa. Retornar null fazia a IA supor campos ausentes.
        return {
          id: '',
          type: 'application_checklist',
          data: {},
          status: 'Falha Validação',
          created_at: new Date().toISOString(),
          errors: [{
            ruleCode: 'APPLICATION-REQUEST-FAILED',
            field: 'checklist',
            message: details.message || err.message || 'O serviço não retornou os detalhes da falha.',
            severity: 'BLOQUEANTE',
          }],
          warnings: [],
        };
      }
      console.error('checklistService.createApplication:', err);
      return {
        id: '',
        type: 'application_checklist',
        data: {},
        status: 'Falha Validação',
        created_at: new Date().toISOString(),
        errors: [{
          ruleCode: 'APPLICATION-REQUEST-FAILED',
          field: 'checklist',
          message: err instanceof Error ? err.message : 'Não foi possível comunicar com o serviço de checklist.',
          severity: 'BLOQUEANTE',
        }],
        warnings: [],
      };
    }
  },
};
