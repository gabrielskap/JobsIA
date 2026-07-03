export interface ChecklistProposal {
  request_id: string;
  job_type_id: number;
  collected_data: Record<string, string | undefined>;
  conversation_id?: string | null;
  schema_version: number;
}

export interface SchemaValidationResult {
  success: boolean;
  errors?: string[];
  data?: ChecklistProposal;
}

/**
 * Valida a proposta estruturada do checklist contra o schema versionado.
 * Suporta versionamento do schema do checklist (atualmente versão 1).
 */
export function validateChecklistProposal(body: any): SchemaValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { success: false, errors: ['O corpo da requisição deve ser um objeto válido.'] };
  }

  // 1. Validar request_id (idempotency key)
  if (body.request_id === undefined || body.request_id === null) {
    errors.push('O campo "request_id" (chave de idempotência) é obrigatório.');
  } else if (typeof body.request_id !== 'string' || body.request_id.trim() === '') {
    errors.push('O campo "request_id" deve ser uma string não vazia.');
  }

  // 2. Validar job_type_id
  if (body.job_type_id === undefined || body.job_type_id === null) {
    errors.push('O campo "job_type_id" é obrigatório.');
  } else {
    const jobTypeId = Number(body.job_type_id);
    if (isNaN(jobTypeId) || !Number.isInteger(jobTypeId) || jobTypeId <= 0) {
      errors.push('O campo "job_type_id" deve ser um número inteiro positivo.');
    }
  }

  // 3. Validar collected_data
  if (body.collected_data === undefined || body.collected_data === null) {
    errors.push('O campo "collected_data" contendo os parâmetros do job é obrigatório.');
  } else if (typeof body.collected_data !== 'object' || Array.isArray(body.collected_data)) {
    errors.push('O campo "collected_data" deve ser um objeto contendo chaves e valores.');
  }

  // 4. Validar conversation_id (opcional)
  if (body.conversation_id !== undefined && body.conversation_id !== null) {
    if (typeof body.conversation_id !== 'string') {
      errors.push('O campo "conversation_id" deve ser uma string.');
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Normalização e retorno
  const normalizedData: ChecklistProposal = {
    request_id: String(body.request_id).trim(),
    job_type_id: Number(body.job_type_id),
    collected_data: body.collected_data,
    conversation_id: body.conversation_id ? String(body.conversation_id).trim() : null,
    schema_version: 1, // Versão do schema estruturado
  };

  return {
    success: true,
    data: normalizedData,
  };
}
