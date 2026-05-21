// Tipos TypeScript espelhando o schema do Supabase após a migration rename_tables.sql

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
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

// Tabela: JobsIA_norm_rules
export interface NormRule {
  id: string;
  environment: string;
  rule: string;
  created_at: string;
}

// Tabela: JobsIA_types
export interface JobType {
  id: number;
  name: string;
  script: string;
  description: string;
  created_at?: string;
}

// Tabela: JobsIA_parameters
export interface JobParameter {
  id: string;
  job_type_id: number;
  flag: string;
  name: string;
  required: boolean;
  description: string;
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
  type: 'transhost' | 'swadm' | 'java';
  data: Record<string, unknown>;
  status: 'Concluído' | 'Falha Validação';
  user_name?: string;
  file_name?: string;
  created_at: string;
}

// Tabela: JobsIA_system_prompts
export interface SystemPrompt {
  id: string;
  content: string;
  is_active: boolean;
  created_at: string;
}
