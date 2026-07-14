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

// Tabela: JobsIA_parameters
export interface JobParameter {
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

// Tabela: JobsIA_checklists
export interface Checklist {
  id: string;
  conversation_id?: string;
  type: string;
  data: Record<string, unknown>;
  status: 'Concluído' | 'Falha Validação';
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
}

// Tabela: JobsIA_system_prompts
export interface SystemPrompt {
  id: string;
  content: string;
  is_active: boolean;
  created_at: string;
}
