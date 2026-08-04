// Tipos TypeScript espelhando o schema do banco PostgreSQL

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role?: string;
  matricula?: string;
  is_active?: boolean;
  selected_model?: string;
  created_at: string;
}

// Tabela: JobsIA_dictionary_terms
export interface DictionaryTerm {
  id: string;
  term: string;
  definition: string;
  category: string;
  created_at: string;
}

// Tabela: JobsIA_norm_rules (agora mapeia a view/JobsIA_validation_rules)
export interface NormRule {
  id: string;
  environment: string;
  rule: string;
  created_at: string;
  status?: string;
  version?: number;
  previous_version_id?: string;
  active?: boolean;
  texto_orientacao?: string;
  secao?: string;
  codigo?: string;
  campo_alvo?: string;
  tipo_regra?: string;
  severidade?: string;
  mensagem?: string;
  expressao?: string;
  aplicabilidade_job?: number[];
  casos_teste?: any;
}

// Tabela: JobsIA_types
export interface JobType {
  id: number;
  name: string;
  script: string;
  description: string;
  created_at?: string;
}

export type ParameterType = 'flag' | 'positional' | 'internal' | 'generated';
export type ParameterDataType = 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'path' | 'list';
export type ParameterCollectionScope = 'APPLICATION' | 'JOB' | 'CAPADOR';

/**
 * Command construction remains controlled by parameter_type. These fields
 * independently state whether a value is collected and/or shown in the PDF.
 */
export interface ParameterCollectionMetadata {
  collection_scope?: ParameterCollectionScope;
  collect_in_conversation?: boolean;
  document_only?: boolean;
}

// Tabela: JobsIA_parameters
export interface JobParameter extends ParameterCollectionMetadata {
  id: string;
  job_type_id: number;
  flag: string | null;       // null = sem flag (positional/internal/generated)
  name: string;
  required: boolean;
  description: string;
  parameter_type: ParameterType;
  order_index: number;
  data_type: string;
  default_value: string | null;
  example_value: string | null;
  validation_regex: string | null;
  active: boolean;
}

export interface JobTypeWithParameters extends JobType {
  parameters: JobParameter[];
}

// Tabela: JobsIA_conversations
export interface Conversation {
  id: string;
  flow_type: 'transhost' | 'swadm' | 'java';
  user_id?: string;
  created_at: string;
}

// Tabela: JobsIA_messages
export interface Message {
  id: string;
  conversation_id: string;
  role: 'agent' | 'user';
  text: string;
  is_error: boolean;
  created_at: string;
}

export type ChecklistScheduleKind = 'one_time' | 'datetime' | 'recurrence';
export type ChecklistServerMode = 'shared' | 'per_job' | 'not_required';
export type ChecklistFieldValue = string | number | boolean | null | Array<string | number | boolean | null>;

export interface ChecklistSchedule {
  kind: ChecklistScheduleKind;
  date?: string;
  datetime?: string;
  recurrence?: string;
  time?: string;
  timezone: string;
  original_text?: string;
}

export interface ChecklistCatalogReference {
  code?: string;
  name: string;
}

export interface ChecklistCapadorData {
  applicable: boolean;
  parameters?: Record<string, ChecklistFieldValue>;
  notes?: string;
}

export interface ChecklistApplicationHeader {
  name: string;
  responsible_name: string;
  requester_name?: string;
  area?: string;
  contact?: string;
  server_mode: ChecklistServerMode;
  shared_server?: string;
  schedule?: ChecklistSchedule;
  metadata?: Record<string, unknown>;
}

export interface ChecklistApplicationJob {
  sequence: number;
  job_type_id: number;
  generic: ChecklistCatalogReference;
  bridge: ChecklistCatalogReference;
  server?: string;
  schedule?: ChecklistSchedule;
  parameters: Record<string, ChecklistFieldValue>;
  capador?: ChecklistCapadorData;
}

export interface ChecklistApplicationProposal {
  request_id: string;
  schema_version: 2;
  conversation_id?: string | null;
  application: ChecklistApplicationHeader;
  jobs: ChecklistApplicationJob[];
}

export type ChecklistCatalogKind = 'GENERIC' | 'BRIDGE';

export interface ChecklistCatalogItem {
  id: string;
  kind: ChecklistCatalogKind;
  code: string;
  name: string;
  description?: string | null;
  official_version?: string | null;
  metadata?: Record<string, unknown>;
  active: boolean;
  created_at: string;
}

// Tabela: JobsIA_checklists
export interface Checklist {
  id: string;
  conversation_id?: string;
  type: string;
  data: Record<string, unknown>;
  status: 'Concluído' | 'Falha Validação' | 'Rascunho';
  user_id?: string;
  user_name?: string;
  file_name?: string;
  created_at: string;
  semantic_type?: string;
  job_type_id?: number;
  target_file?: string;
  request_id?: string;
  errors?: Array<{ ruleCode: string; field: string; message: string; severity: string }>;
  warnings?: Array<{ ruleCode: string; field: string; message: string; severity: string }>;
  command?: string;
  schema_version?: 1 | 2;
  workflow_status?: 'RASCUNHO' | 'FINAL';
  application_name?: string;
  responsible_name?: string;
  application_data?: ChecklistApplicationHeader;
  job_items?: ChecklistApplicationJob[];
  schedule_data?: ChecklistSchedule;
}

// Tabela: JobsIA_system_prompts
export interface SystemPrompt {
  id: string;
  content: string;
  is_active: boolean;
  created_at: string;
}
