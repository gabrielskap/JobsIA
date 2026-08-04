/**
 * Schema contracts used by the checklist API.
 *
 * Version 1 remains intentionally small because it is the contract used by
 * existing single-job clients. Version 2 models a workload/Application and
 * its ordered job items without making the AI response itself authoritative
 * for command construction or corporate naming rules.
 */

export type ChecklistScalar = string | number | boolean | null;
export type ChecklistFieldValue = ChecklistScalar | ChecklistScalar[];
export type ChecklistFieldValues = Record<string, ChecklistFieldValue>;

export type ChecklistScheduleKind = 'one_time' | 'datetime' | 'recurrence';
export type ChecklistServerMode = 'shared' | 'per_job' | 'not_required';

export interface ChecklistSchedule {
  kind: ChecklistScheduleKind;
  /** ISO local date (YYYY-MM-DD) for a one-time schedule. */
  date?: string;
  /** ISO local datetime (YYYY-MM-DDTHH:mm:ss, optionally with an offset). */
  datetime?: string;
  /** A human-approved recurrence expression. Its syntax is defined by DIOT. */
  recurrence?: string;
  /** Optional execution time for a recurrence, normalized as HH:mm:ss. */
  time?: string;
  timezone: string;
  /** The wording entered by the user, kept for auditability and the PDF. */
  original_text?: string;
}

export interface ChecklistCatalogReference {
  /** Stable catalog code when the official catalog provides one. */
  code?: string;
  /** Display name supplied by the official catalog or the requester. */
  name: string;
}

export interface ChecklistCapadorProposal {
  /** Makes the “not applicable” decision explicit instead of silently omitting CAPADOR. */
  applicable: boolean;
  /** Document-only values; they must never be appended to a generated command. */
  parameters?: ChecklistFieldValues;
  notes?: string;
}

export interface ChecklistApplicationHeader {
  /** Workload Application, not a job name, script, or file name. */
  name: string;
  /** Operationally responsible person, distinct from the authenticated requester. */
  responsible_name: string;
  requester_name?: string;
  area?: string;
  contact?: string;
  server_mode: ChecklistServerMode;
  /** Required when server_mode is shared. */
  shared_server?: string;
  /** Default schedule for every item that does not declare its own schedule. */
  schedule?: ChecklistSchedule;
  /** Extra approved Application attributes not represented by a first-class field yet. */
  metadata?: Record<string, unknown>;
}

export interface ChecklistApplicationJob {
  /** One-based, contiguous execution order within the Application. */
  sequence: number;
  job_type_id: number;
  generic: ChecklistCatalogReference;
  bridge: ChecklistCatalogReference;
  /** Required for each item when application.server_mode is per_job. */
  server?: string;
  /** Overrides application.schedule for this item. */
  schedule?: ChecklistSchedule;
  /** Values collected for job parameters. Command eligibility is decided by DB metadata. */
  parameters: ChecklistFieldValues;
  capador?: ChecklistCapadorProposal;
}

/** The normalized payload for a structured Application checklist (schema v2). */
export interface ChecklistApplicationProposal {
  request_id: string;
  schema_version: 2;
  conversation_id?: string | null;
  application: ChecklistApplicationHeader;
  jobs: ChecklistApplicationJob[];
}

/** Legacy v1 proposal. Kept exported with its original name for compatibility. */
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

export interface ApplicationSchemaValidationResult {
  success: boolean;
  errors?: string[];
  data?: ChecklistApplicationProposal;
}

export interface ScheduleNormalizationResult {
  success: boolean;
  errors?: string[];
  data?: ChecklistSchedule;
}

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function validDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

/** Normalizes YYYYMMDD and YYYY-MM-DD without relying on host locale parsing. */
export function normalizeChecklistDate(value: unknown): string | undefined {
  const raw = nonEmptyString(value);
  if (!raw) return undefined;

  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(raw);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!validDateParts(year, month, day)) return undefined;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Normalizes HHMM, HH:mm, HHMMSS, and HH:mm:ss to HH:mm:ss. */
export function normalizeChecklistTime(value: unknown): string | undefined {
  const raw = nonEmptyString(value);
  if (!raw) return undefined;

  const match = /^(\d{2}):?(\d{2})(?::?(\d{2}))?$/.exec(raw);
  if (!match) return undefined;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;

  return `${match[1]}:${match[2]}:${String(seconds).padStart(2, '0')}`;
}

function normalizeChecklistDateTime(value: unknown): string | undefined {
  const raw = nonEmptyString(value);
  if (!raw) return undefined;

  // Accept the common compact/ISO forms, but keep the local wall-clock value
  // intact. The timezone is represented separately in ChecklistSchedule.
  const match = /^(\d{4})-?(\d{2})-?(\d{2})[T\s]?(\d{2}):?(\d{2})(?::?(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
  if (!match) return undefined;

  const date = normalizeChecklistDate(`${match[1]}-${match[2]}-${match[3]}`);
  const time = normalizeChecklistTime(`${match[4]}:${match[5]}${match[6] ? `:${match[6]}` : ''}`);
  if (!date || !time) return undefined;

  const offset = match[7];
  if (offset && offset !== 'Z') {
    const offsetMatch = /^([+-])(\d{2}):?(\d{2})$/.exec(offset);
    if (!offsetMatch || Number(offsetMatch[2]) > 23 || Number(offsetMatch[3]) > 59) return undefined;
    return `${date}T${time}${offsetMatch[1]}${offsetMatch[2]}:${offsetMatch[3]}`;
  }

  return `${date}T${time}${offset || ''}`;
}

function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function normalizeScheduleKind(value: unknown): ChecklistScheduleKind | undefined {
  const raw = nonEmptyString(value)?.toLowerCase();
  switch (raw) {
    case 'one_time':
    case 'one-time':
    case 'date':
      return 'one_time';
    case 'datetime':
    case 'date_time':
    case 'date-time':
      return 'datetime';
    case 'recurrence':
    case 'recurring':
      return 'recurrence';
    default:
      return undefined;
  }
}

/**
 * Validates and canonicalizes a scheduling value. It deliberately stores a
 * recurrence as approved text; a CRON/RRULE grammar must be supplied by DIOT
 * before this code can enforce one.
 */
export function normalizeChecklistSchedule(value: unknown, field = 'schedule'): ScheduleNormalizationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { success: false, errors: [`O campo "${field}" deve ser um objeto de agendamento.`] };
  }

  const kind = normalizeScheduleKind(value.kind ?? value.type ?? value.mode);
  if (!kind) {
    errors.push(`O campo "${field}.kind" deve ser one_time, datetime ou recurrence.`);
  }

  const timezone = nonEmptyString(value.timezone) || DEFAULT_TIMEZONE;
  if (!isValidTimezone(timezone)) {
    errors.push(`O campo "${field}.timezone" deve ser um fuso horário IANA válido.`);
  }

  const originalText = nonEmptyString(value.original_text ?? value.originalText);
  const normalized: Partial<ChecklistSchedule> = {
    kind: kind || 'one_time',
    timezone,
  };
  if (originalText) normalized.original_text = originalText;

  if (kind === 'one_time') {
    const date = normalizeChecklistDate(value.date);
    if (!date) {
      errors.push(`O campo "${field}.date" deve conter uma data válida no formato AAAAMMDD ou YYYY-MM-DD.`);
    } else {
      normalized.date = date;
    }
  }

  if (kind === 'datetime') {
    let datetime = normalizeChecklistDateTime(value.datetime);
    if (!datetime) {
      const date = normalizeChecklistDate(value.date);
      const time = normalizeChecklistTime(value.time);
      if (date && time) datetime = `${date}T${time}`;
    }
    if (!datetime) {
      errors.push(`O campo "${field}.datetime" deve conter uma data e horário válidos, ou informe "${field}.date" e "${field}.time".`);
    } else {
      normalized.datetime = datetime;
    }
  }

  if (kind === 'recurrence') {
    const recurrence = nonEmptyString(value.recurrence ?? value.rrule ?? value.expression);
    if (!recurrence) {
      errors.push(`O campo "${field}.recurrence" é obrigatório para um agendamento recorrente.`);
    } else {
      normalized.recurrence = recurrence;
    }

    if (value.time !== undefined && value.time !== null && value.time !== '') {
      const time = normalizeChecklistTime(value.time);
      if (!time) {
        errors.push(`O campo "${field}.time" deve estar no formato HH:mm ou HH:mm:ss.`);
      } else {
        normalized.time = time;
      }
    }
  }

  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: normalized as ChecklistSchedule };
}

function normalizeCatalogReference(value: unknown, field: string, errors: string[]): ChecklistCatalogReference | undefined {
  const directName = nonEmptyString(value);
  if (directName) return { name: directName };

  if (!isRecord(value)) {
    errors.push(`O campo "${field}" deve informar o genérico/ponte selecionado.`);
    return undefined;
  }

  const code = nonEmptyString(value.code);
  const name = nonEmptyString(value.name);
  if (!code && !name) {
    errors.push(`O campo "${field}" deve conter ao menos "code" ou "name".`);
    return undefined;
  }

  return {
    ...(code ? { code } : {}),
    // Catalog codes are valid identifiers before a formal display name exists.
    name: name || code!,
  };
}

function normalizeFieldValues(value: unknown, field: string, errors: string[]): ChecklistFieldValues | undefined {
  if (!isRecord(value)) {
    errors.push(`O campo "${field}" deve ser um objeto de parâmetros.`);
    return undefined;
  }

  const normalized: ChecklistFieldValues = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!nonEmptyString(key)) {
      errors.push(`O campo "${field}" contém uma chave de parâmetro vazia.`);
      continue;
    }

    const isScalar = raw === null || ['string', 'number', 'boolean'].includes(typeof raw);
    const isScalarArray = Array.isArray(raw)
      && raw.every(item => item === null || ['string', 'number', 'boolean'].includes(typeof item));
    if (!isScalar && !isScalarArray) {
      errors.push(`O parâmetro "${field}.${key}" deve ser um valor simples ou uma lista de valores simples.`);
      continue;
    }

    normalized[key] = raw as ChecklistFieldValue;
  }

  return normalized;
}

function normalizeOptionalText(value: unknown, field: string, errors: string[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = nonEmptyString(value);
  if (!normalized) errors.push(`O campo "${field}" deve ser uma string não vazia quando informado.`);
  return normalized;
}

function normalizeServerMode(value: unknown): ChecklistServerMode | undefined {
  const raw = nonEmptyString(value)?.toLowerCase();
  if (raw === 'shared') return 'shared';
  if (raw === 'per_job') return 'per_job';
  if (raw === 'not_required') return 'not_required';
  return undefined;
}

/** True when a request is explicitly using the structured Application contract. */
export function isChecklistApplicationProposal(value: unknown): boolean {
  return isRecord(value) && Number(value.schema_version) === 2;
}

/**
 * Validates the v2 Application proposal and returns a normalized, ordered
 * payload. It performs only deterministic shape checks; catalog membership,
 * corporate Application rules, job-specific required fields, and command
 * eligibility are enforced by validationEngine/database metadata.
 */
export function validateChecklistApplicationProposal(body: unknown): ApplicationSchemaValidationResult {
  const errors: string[] = [];
  if (!isRecord(body)) {
    return { success: false, errors: ['O corpo da requisição deve ser um objeto válido.'] };
  }

  const requestId = nonEmptyString(body.request_id ?? body.idempotency_key);
  if (!requestId) errors.push('O campo "request_id" (chave de idempotência) é obrigatório.');

  if (Number(body.schema_version) !== 2) {
    errors.push('O campo "schema_version" deve ser igual a 2 para o checklist de Application.');
  }

  const conversationId = normalizeOptionalText(body.conversation_id, 'conversation_id', errors);

  if (!isRecord(body.application)) {
    errors.push('O campo "application" é obrigatório e deve ser um objeto.');
  }

  const applicationSource = isRecord(body.application) ? body.application : {};
  const applicationName = nonEmptyString(applicationSource.name);
  if (!applicationName) errors.push('O campo "application.name" é obrigatório.');

  const responsibleName = nonEmptyString(applicationSource.responsible_name);
  if (!responsibleName) errors.push('O campo "application.responsible_name" é obrigatório.');

  const serverMode = normalizeServerMode(applicationSource.server_mode);
  if (!serverMode) {
    errors.push('O campo "application.server_mode" deve ser shared, per_job ou not_required.');
  }

  const sharedServer = normalizeOptionalText(applicationSource.shared_server, 'application.shared_server', errors);
  if (serverMode === 'shared' && !sharedServer) {
    errors.push('O campo "application.shared_server" é obrigatório quando application.server_mode é shared.');
  }
  if (serverMode !== 'shared' && sharedServer) {
    errors.push('O campo "application.shared_server" só pode ser informado quando application.server_mode é shared.');
  }

  const requesterName = normalizeOptionalText(applicationSource.requester_name, 'application.requester_name', errors);
  const area = normalizeOptionalText(applicationSource.area, 'application.area', errors);
  const contact = normalizeOptionalText(applicationSource.contact, 'application.contact', errors);

  let applicationSchedule: ChecklistSchedule | undefined;
  if (applicationSource.schedule !== undefined && applicationSource.schedule !== null) {
    const scheduleResult = normalizeChecklistSchedule(applicationSource.schedule, 'application.schedule');
    if (!scheduleResult.success) errors.push(...(scheduleResult.errors || []));
    else applicationSchedule = scheduleResult.data;
  }

  let applicationMetadata: Record<string, unknown> | undefined;
  if (applicationSource.metadata !== undefined && applicationSource.metadata !== null) {
    if (!isRecord(applicationSource.metadata)) {
      errors.push('O campo "application.metadata" deve ser um objeto quando informado.');
    } else {
      applicationMetadata = applicationSource.metadata;
    }
  }

  if (!Array.isArray(body.jobs) || body.jobs.length === 0) {
    errors.push('O campo "jobs" deve conter ao menos um job ordenado.');
  }

  const normalizedJobs: ChecklistApplicationJob[] = [];
  const suppliedJobs = Array.isArray(body.jobs) ? body.jobs : [];
  const sequences = new Set<number>();

  suppliedJobs.forEach((candidate, index) => {
    const itemPath = `jobs[${index}]`;
    if (!isRecord(candidate)) {
      errors.push(`O campo "${itemPath}" deve ser um objeto.`);
      return;
    }

    const sequence = Number(candidate.sequence);
    if (!Number.isInteger(sequence) || sequence <= 0) {
      errors.push(`O campo "${itemPath}.sequence" deve ser um inteiro positivo.`);
    } else if (sequences.has(sequence)) {
      errors.push(`O campo "${itemPath}.sequence" está duplicado.`);
    } else {
      sequences.add(sequence);
    }

    const jobTypeId = Number(candidate.job_type_id);
    if (!Number.isInteger(jobTypeId) || jobTypeId <= 0) {
      errors.push(`O campo "${itemPath}.job_type_id" deve ser um número inteiro positivo.`);
    }

    const generic = normalizeCatalogReference(candidate.generic, `${itemPath}.generic`, errors);
    const bridge = normalizeCatalogReference(candidate.bridge, `${itemPath}.bridge`, errors);
    const server = normalizeOptionalText(candidate.server, `${itemPath}.server`, errors);

    if (serverMode === 'per_job' && !server) {
      errors.push(`O campo "${itemPath}.server" é obrigatório quando application.server_mode é per_job.`);
    }
    if (serverMode === 'shared' && server && sharedServer && server !== sharedServer) {
      errors.push(`O campo "${itemPath}.server" não pode divergir de application.shared_server no modo shared.`);
    }

    let schedule: ChecklistSchedule | undefined;
    if (candidate.schedule !== undefined && candidate.schedule !== null) {
      const scheduleResult = normalizeChecklistSchedule(candidate.schedule, `${itemPath}.schedule`);
      if (!scheduleResult.success) errors.push(...(scheduleResult.errors || []));
      else schedule = scheduleResult.data;
    }

    const parameters = normalizeFieldValues(candidate.parameters, `${itemPath}.parameters`, errors);

    let capador: ChecklistCapadorProposal | undefined;
    if (candidate.capador !== undefined && candidate.capador !== null) {
      if (!isRecord(candidate.capador)) {
        errors.push(`O campo "${itemPath}.capador" deve ser um objeto.`);
      } else if (typeof candidate.capador.applicable !== 'boolean') {
        errors.push(`O campo "${itemPath}.capador.applicable" deve ser booleano.`);
      } else {
        let capadorParameters: ChecklistFieldValues | undefined;
        if (candidate.capador.parameters !== undefined && candidate.capador.parameters !== null) {
          capadorParameters = normalizeFieldValues(candidate.capador.parameters, `${itemPath}.capador.parameters`, errors);
        }
        const notes = normalizeOptionalText(candidate.capador.notes, `${itemPath}.capador.notes`, errors);
        capador = {
          applicable: candidate.capador.applicable,
          ...(capadorParameters ? { parameters: capadorParameters } : {}),
          ...(notes ? { notes } : {}),
        };
      }
    }

    if (
      Number.isInteger(sequence) && sequence > 0
      && Number.isInteger(jobTypeId) && jobTypeId > 0
      && generic && bridge && parameters
    ) {
      normalizedJobs.push({
        sequence,
        job_type_id: jobTypeId,
        generic,
        bridge,
        ...(serverMode === 'shared' && sharedServer ? { server: sharedServer } : server ? { server } : {}),
        ...(schedule ? { schedule } : {}),
        parameters,
        ...(capador ? { capador } : {}),
      });
    }
  });

  if (suppliedJobs.length > 0 && sequences.size === suppliedJobs.length) {
    for (let expected = 1; expected <= suppliedJobs.length; expected += 1) {
      if (!sequences.has(expected)) {
        errors.push('Os campos "jobs[].sequence" devem formar uma sequência contínua iniciada em 1.');
        break;
      }
    }
  }

  if (errors.length > 0 || !requestId || !applicationName || !responsibleName || !serverMode) {
    return { success: false, errors };
  }

  normalizedJobs.sort((left, right) => left.sequence - right.sequence);
  return {
    success: true,
    data: {
      request_id: requestId,
      schema_version: 2,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      application: {
        name: applicationName,
        responsible_name: responsibleName,
        ...(requesterName ? { requester_name: requesterName } : {}),
        ...(area ? { area } : {}),
        ...(contact ? { contact } : {}),
        server_mode: serverMode,
        ...(sharedServer ? { shared_server: sharedServer } : {}),
        ...(applicationSchedule ? { schedule: applicationSchedule } : {}),
        ...(applicationMetadata ? { metadata: applicationMetadata } : {}),
      },
      jobs: normalizedJobs,
    },
  };
}

/**
 * Validates the original v1 structured proposal. Do not route v2 calls here;
 * use validateChecklistApplicationProposal so legacy route consumers keep
 * their stable job_type_id/collected_data contract.
 */
export function validateChecklistProposal(body: unknown): SchemaValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { success: false, errors: ['O corpo da requisição deve ser um objeto válido.'] };
  }

  const source = body as Record<string, unknown>;

  if (isChecklistApplicationProposal(source)) {
    return {
      success: false,
      errors: ['A proposta com schema_version 2 deve ser validada como checklist de Application.'],
    };
  }

  // 1. Validar request_id (idempotency key)
  if (source.request_id === undefined || source.request_id === null) {
    errors.push('O campo "request_id" (chave de idempotência) é obrigatório.');
  } else if (typeof source.request_id !== 'string' || source.request_id.trim() === '') {
    errors.push('O campo "request_id" deve ser uma string não vazia.');
  }

  // 2. Validar job_type_id
  if (source.job_type_id === undefined || source.job_type_id === null) {
    errors.push('O campo "job_type_id" é obrigatório.');
  } else {
    const jobTypeId = Number(source.job_type_id);
    if (Number.isNaN(jobTypeId) || !Number.isInteger(jobTypeId) || jobTypeId <= 0) {
      errors.push('O campo "job_type_id" deve ser um número inteiro positivo.');
    }
  }

  // 3. Validar collected_data
  if (source.collected_data === undefined || source.collected_data === null) {
    errors.push('O campo "collected_data" contendo os parâmetros do job é obrigatório.');
  } else if (typeof source.collected_data !== 'object' || Array.isArray(source.collected_data)) {
    errors.push('O campo "collected_data" deve ser um objeto contendo chaves e valores.');
  }

  // 4. Validar conversation_id (opcional)
  if (source.conversation_id !== undefined && source.conversation_id !== null) {
    if (typeof source.conversation_id !== 'string') {
      errors.push('O campo "conversation_id" deve ser uma string.');
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      request_id: String(source.request_id).trim(),
      job_type_id: Number(source.job_type_id),
      collected_data: source.collected_data as Record<string, string | undefined>,
      conversation_id: source.conversation_id ? String(source.conversation_id).trim() : null,
      schema_version: 1,
    },
  };
}
