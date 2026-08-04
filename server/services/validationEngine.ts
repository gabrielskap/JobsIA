import { pool } from '../db';
import type {
  ChecklistApplicationProposal,
  ChecklistApplicationJob,
  ChecklistCatalogReference,
} from '../schemas/checklistSchema';

export interface ValidationError {
  ruleCode: string;
  field: string;
  message: string;
  severity: 'BLOQUEANTE' | 'AVISO';
  value?: string;
}

export interface ValidationRunResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  appliedRulesCount: number;
  validationRunId?: string;
}

export interface ApplicationNameValidationRule {
  code: string;
  validation_regex?: string | null;
  severity: 'BLOQUEANTE' | 'AVISO';
  message: string;
  suggestion_template?: string | null;
}

export interface ApplicationNameValidationResult {
  errors: ValidationError[];
  warnings: ValidationError[];
  suggestedValue?: string;
}

export interface ApplicationJobValidationResult extends ValidationRunResult {
  sequence: number;
  jobTypeId: number;
}

export interface ApplicationChecklistValidationRunResult extends ValidationRunResult {
  applicationName: string;
  suggestedApplicationName?: string;
  jobs: ApplicationJobValidationResult[];
}

interface JobChecklistRequirement {
  job_type_id: number;
  requires_server: boolean;
  requires_generic: boolean;
  requires_bridge: boolean;
  requires_capador: boolean;
}

const structuredRuleVersion = '2';

function prefixedValidationError(error: ValidationError, prefix: string): ValidationError {
  return {
    ...error,
    field: `${prefix}.${error.field}`,
  };
}

function valueForKey(data: Record<string, unknown>, expectedKey: string): unknown {
  const foundKey = Object.keys(data).find(key => key.trim().toLocaleLowerCase('pt-BR') === expectedKey.toLocaleLowerCase('pt-BR'));
  return foundKey ? data[foundKey] : undefined;
}

function hasTextValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.some(item => hasTextValue(item));
  return String(value).trim().length > 0;
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return String(left ?? '').trim() === String(right ?? '').trim();
}

function createStructuredError(
  ruleCode: string,
  field: string,
  message: string,
  severity: 'BLOQUEANTE' | 'AVISO' = 'BLOQUEANTE',
  value?: string
): ValidationError {
  return { ruleCode, field, message, severity, ...(value === undefined ? {} : { value }) };
}

/**
 * Applies only rules published in JobsIA_application_validation_rules. No
 * Application regex is hardcoded here: DIOT remains the authoritative source
 * of the corporate convention.
 */
export function validateApplicationName(
  applicationName: string,
  rules: ApplicationNameValidationRule[]
): ApplicationNameValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let suggestedValue: string | undefined;

  for (const rule of rules) {
    if (!rule.validation_regex) continue;

    let passed = false;
    try {
      passed = new RegExp(rule.validation_regex).test(applicationName);
    } catch {
      warnings.push(createStructuredError(
        `APPLICATION-RULE-CONFIG-${rule.code}`,
        'application.name',
        `A regra corporativa de Application "${rule.code}" possui uma expressão inválida e não foi aplicada.`,
        'AVISO',
        applicationName
      ));
      continue;
    }

    if (passed) continue;

    const error = createStructuredError(
      `APPLICATION-RULE-${rule.code}`,
      'application.name',
      rule.message || 'Nome de Application fora do padrão corporativo.',
      rule.severity,
      applicationName
    );
    if (rule.severity === 'BLOQUEANTE') errors.push(error);
    else warnings.push(error);

    if (!suggestedValue && rule.suggestion_template) {
      suggestedValue = rule.suggestion_template.replaceAll('{value}', applicationName);
    }
  }

  return { errors, warnings, ...(suggestedValue ? { suggestedValue } : {}) };
}

async function getApplicationValidationRules(): Promise<ApplicationNameValidationRule[]> {
  try {
    const { rows } = await pool.query(
      `SELECT code, validation_regex, severity, message, suggestion_template
       FROM "JobsIA_application_validation_rules"
       WHERE active = true AND status = 'PUBLICADO'
       ORDER BY created_at ASC`
    );
    return rows.map((row: any) => ({
      code: String(row.code),
      validation_regex: row.validation_regex,
      severity: row.severity === 'AVISO' ? 'AVISO' : 'BLOQUEANTE',
      message: String(row.message || ''),
      suggestion_template: row.suggestion_template,
    }));
  } catch (error: any) {
    // Allows safe deployment while an old database is being migrated. The
    // structured route will surface schema-level validation independently.
    if (error?.code === '42P01') return [];
    throw error;
  }
}

async function getJobChecklistRequirements(jobTypeIds: number[]): Promise<Map<number, JobChecklistRequirement>> {
  if (jobTypeIds.length === 0) return new Map();
  try {
    const { rows } = await pool.query(
      `SELECT job_type_id, requires_server, requires_generic, requires_bridge, requires_capador
       FROM "JobsIA_job_checklist_requirements"
       WHERE job_type_id = ANY($1::int[])`,
      [jobTypeIds]
    );
    return new Map(rows.map((row: any) => [Number(row.job_type_id), {
      job_type_id: Number(row.job_type_id),
      requires_server: Boolean(row.requires_server),
      requires_generic: Boolean(row.requires_generic),
      requires_bridge: Boolean(row.requires_bridge),
      requires_capador: Boolean(row.requires_capador),
    }]));
  } catch (error: any) {
    if (error?.code === '42P01') return new Map();
    throw error;
  }
}

async function validateCatalogReference(
  kind: 'GENERIC' | 'BRIDGE',
  reference: ChecklistCatalogReference,
  field: string
): Promise<{ errors: ValidationError[]; warnings: ValidationError[] }> {
  try {
    const { rows: catalogRows } = await pool.query(
      `SELECT code, name
       FROM "JobsIA_checklist_catalog_items"
       WHERE kind = $1 AND active = true`,
      [kind]
    );

    // Do not invalidate an operational checklist merely because the official
    // catalog has not been imported yet. Once items exist, membership is
    // deterministic and blocking.
    if (catalogRows.length === 0) {
      return {
        errors: [],
        warnings: [createStructuredError(
          `CATALOG-${kind}-NOT-CONFIGURED`,
          field,
          `O catálogo oficial de ${kind === 'GENERIC' ? 'genéricos' : 'pontes'} ainda não foi publicado; a seleção será registrada para conferência.`,
          'AVISO',
          reference.code || reference.name
        )],
      };
    }

    const normalizedCode = reference.code?.trim().toLocaleUpperCase('pt-BR');
    const normalizedName = reference.name.trim().toLocaleUpperCase('pt-BR');
    const match = catalogRows.some((row: any) =>
      (normalizedCode && String(row.code).trim().toLocaleUpperCase('pt-BR') === normalizedCode)
      || String(row.name).trim().toLocaleUpperCase('pt-BR') === normalizedName
    );

    if (match) return { errors: [], warnings: [] };
    return {
      errors: [createStructuredError(
        `CATALOG-${kind}-UNKNOWN`,
        field,
        `O ${kind === 'GENERIC' ? 'genérico' : 'ponte'} informado não pertence ao catálogo oficial ativo.`,
        'BLOQUEANTE',
        reference.code || reference.name
      )],
      warnings: [],
    };
  } catch (error: any) {
    if (error?.code === '42P01') {
      return {
        errors: [],
        warnings: [createStructuredError(
          `CATALOG-${kind}-UNAVAILABLE`,
          field,
          `Não foi possível consultar o catálogo oficial de ${kind === 'GENERIC' ? 'genéricos' : 'pontes'} neste ambiente.`,
          'AVISO',
          reference.code || reference.name
        )],
      };
    }
    throw error;
  }
}

async function saveStructuredValidationRun(
  passed: boolean,
  errors: ValidationError[],
  warnings: ValidationError[],
  userId?: string,
  checklistId?: string
): Promise<string | undefined> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO "JobsIA_validation_runs" (checklist_id, user_id, passed)
       VALUES ($1, $2, $3) RETURNING id`,
      [checklistId || null, userId || null, passed]
    );
    const runId = rows[0].id as string;

    for (const result of [...errors, ...warnings]) {
      await client.query(
        `INSERT INTO "JobsIA_validation_results"
          (validation_run_id, rule_id, rule_code, rule_version, campo_alvo, valor_analisado, severidade, mensagem, passou)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`,
        [
          runId,
          result.ruleCode,
          structuredRuleVersion,
          result.field,
          result.value || null,
          result.severity,
          result.message,
          false,
        ]
      );
    }

    await client.query('COMMIT');
    return runId;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('validationEngine.saveStructuredValidationRun:', error);
    return undefined;
  } finally {
    client.release();
  }
}

export const validationEngine = {
  async validateChecklist(
    jobTypeId: number,
    data: Record<string, any>,
    userId?: string,
    saveRun = true,
    checklistId?: string
  ): Promise<ValidationRunResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // 1. Buscar os parâmetros do Job Type no banco
    const { rows: parameters } = await pool.query(
      'SELECT * FROM "JobsIA_parameters" WHERE job_type_id = $1 AND active = true ORDER BY order_index ASC',
      [jobTypeId]
    );

    // Normalizar chaves do objeto de dados de forma case-insensitive baseada nos parâmetros cadastrados
    for (const param of parameters) {
      const officialName = param.name;
      const lowerName = officialName.toLowerCase();
      const foundKey = Object.keys(data).find(k => k.toLowerCase() === lowerName);
      if (foundKey !== undefined) {
        const val = data[foundKey];
        data[officialName] = val;
        data[lowerName] = val;
      }
    }

    // Detectar o ambiente
    const detectedEnv = (data.ambiente || data.environment || 'Unix') as string;

    // 2. Validações dos Parâmetros Específicos do Job Type
    for (const param of parameters) {
      const val = data[param.name];
      const isPresent = val !== undefined && val !== null && String(val).trim() !== '';
      const isSystemManaged = param.collect_in_conversation === false
        || param.parameter_type === 'generated'
        || param.document_only === true;

      // Validação de Required
      if (param.required && !isPresent && !isSystemManaged) {
        errors.push({
          ruleCode: `PARAM-REQUIRED-${param.name.toUpperCase()}`,
          field: param.name,
          message: `O parâmetro obrigatório "${param.name}" não foi preenchido.`,
          severity: 'BLOQUEANTE',
        });
        continue;
      }

      if (isPresent) {
        const valStr = String(val).trim();

        // Validação de Tipo de Dado
        if (param.data_type === 'number') {
          if (isNaN(Number(valStr))) {
            errors.push({
              ruleCode: `PARAM-TYPE-NUMBER-${param.name.toUpperCase()}`,
              field: param.name,
              message: `O parâmetro "${param.name}" deve ser um número válido.`,
              severity: 'BLOQUEANTE',
              value: valStr,
            });
          }
        } else if (param.data_type === 'boolean') {
          if (valStr !== 'true' && valStr !== 'false' && typeof val !== 'boolean') {
            errors.push({
              ruleCode: `PARAM-TYPE-BOOL-${param.name.toUpperCase()}`,
              field: param.name,
              message: `O parâmetro "${param.name}" deve ser um booleano (true/false).`,
              severity: 'BLOQUEANTE',
              value: valStr,
            });
          }
        } else if (param.data_type === 'date') {
          const dateRegex = /^(\d{4}-\d{2}-\d{2}|\d{8})$/;
          if (!dateRegex.test(valStr)) {
            errors.push({
              ruleCode: `PARAM-TYPE-DATE-${param.name.toUpperCase()}`,
              field: param.name,
              message: `O parâmetro "${param.name}" deve ser uma data no formato YYYY-MM-DD ou YYYYMMDD.`,
              severity: 'BLOQUEANTE',
              value: valStr,
            });
          }
        }

        // Validação de validation_regex do Parâmetro
        if (param.validation_regex) {
          try {
            const rx = new RegExp(param.validation_regex);
            if (!rx.test(valStr)) {
              errors.push({
                ruleCode: `PARAM-REGEX-${param.name.toUpperCase()}`,
                field: param.name,
                message: `O parâmetro "${param.name}" não atende ao padrão esperado de validação.`,
                severity: 'BLOQUEANTE',
                value: valStr,
              });
            }
          } catch (e) {
            console.error(`Erro ao compilar regex do parâmetro ${param.name}:`, e);
          }
        }
      }
    }

    // Validação de Dependências e Opcionais (ex: se preencher um, deve preencher o outro).
    // A dependência só existe para tipos que realmente possuem ambos os campos
    // CAPADOR; tipos de implantação podem ter apenas diretório de origem.
    const hasCapadorOrigin = parameters.some(param => String(param.name).toLocaleLowerCase('pt-BR') === 'diretorio_origem');
    const hasCapadorDestination = parameters.some(param => String(param.name).toLocaleLowerCase('pt-BR') === 'diretorio_destino');
    if (hasCapadorOrigin && hasCapadorDestination && data.diretorio_origem && !data.diretorio_destino) {
      errors.push({
        ruleCode: 'DEP-DIR-DESTINO',
        field: 'diretorio_destino',
        message: 'O parâmetro "diretorio_destino" é obrigatório quando "diretorio_origem" está preenchido.',
        severity: 'BLOQUEANTE',
      });
    }

    // 3. Buscar as Regras Versionadas Ativas da Norma N/PD/004/02
    const { rows: normRules } = await pool.query(
      `SELECT * FROM "JobsIA_validation_rules" 
       WHERE ativo = true 
         AND status = 'PUBLICADO'
         AND (ambiente = $1 OR ambiente = 'Global')
         AND (aplicabilidade_job IS NULL OR $2 = ANY(aplicabilidade_job))
         AND vigencia_inicio <= now() 
         AND (vigencia_fim IS NULL OR vigencia_fim >= now())`,
      [detectedEnv, jobTypeId]
    );

    // 4. Executar Validações da Norma N/PD/004/02
    for (const rule of normRules) {
      let fieldVal = data[rule.campo_alvo];
      if ((fieldVal === undefined || fieldVal === null || String(fieldVal).trim() === '') && rule.campo_alvo === 'file_name') {
        fieldVal = data.file_name || data.shell_name || data.program_name || data.nome_arquivo || data.nome_script;
        if (fieldVal === undefined || fieldVal === null || String(fieldVal).trim() === '') {
          // Fallback para o primeiro valor que não seja propriedades internas
          const entries = Object.entries(data).find(([k, v]) => !k.startsWith('__') && k !== 'ambiente' && k !== 'environment' && v);
          if (entries) {
            fieldVal = entries[1];
          }
        }
      }
      if ((fieldVal === undefined || fieldVal === null || String(fieldVal).trim() === '') && rule.campo_alvo === 'object_name') {
        fieldVal = data.object_name || data.nome_objeto || data.objeto || data.program_name;
      }
      if ((fieldVal === undefined || fieldVal === null || String(fieldVal).trim() === '') && rule.campo_alvo === 'tape_label') {
        fieldVal = data.tape_label || data.rotulo_fita || data.fita;
      }

      if (fieldVal === undefined || fieldVal === null || String(fieldVal).trim() === '') {
        continue; // Regras de nomenclatura só validam se o campo alvo estiver preenchido
      }

      const valStr = String(fieldVal).trim();

      // Determinar o contexto do arquivo para aplicar a regra correta
      const isSql = valStr.toLowerCase().endsWith('.sql') || /^(pkg|pkgbody|pr|fc|tr)_/i.test(valStr);
      const isCDSend =
        (valStr.startsWith('F') && valStr.includes('.MMMMMMMM.')) ||
        /^F[A-Z]{3}[A-Z]{3}[0-9]{2}\.[A-Z0-9]{1,8}\.[BIE][0-9]{3}\.[0-9]{8}\.[0-9]{6}\.[DR][0-9]{7}$/.test(valStr);
      const isCDReceive = /^[A-Z]{3}[A-Z]{3}[0-9]{2}\.[BIE][0-9]{3}\.[DR][0-9]{7}$/.test(valStr);
      const isCD = isCDSend || isCDReceive;

      // Determinar validade de fitas para exclusão mútua
      const isTapeWinUnix = /^F[DHME][A-Z0-9]{1,8}\/[CDFIN]\/(ON|OF)$/.test(valStr) && valStr.length <= 17;
      const isTapeUnixDb = /^F[DHME][A-Z0-9]{1,8}[A-Z0-9]{1,6}\/[CDFIN]\/(ON|OF)$/.test(valStr);

      // Ignorar regras não aplicáveis ao formato detectado
      if (rule.codigo === 'RULE-DB-SQL-FORMAT' && !isSql) continue;
      if (rule.codigo === 'RULE-CD-SEND' && !isCDSend) continue;
      if (rule.codigo === 'RULE-CD-RECEIVE' && !isCDReceive) continue;

      // Exclusão mútua para fitas magnéticas (evitar falso positivo em validações cruzadas)
      if (rule.codigo === 'RULE-TAPE-WIN-UNIX' && isTapeUnixDb && !isTapeWinUnix) continue;
      if (rule.codigo === 'RULE-TAPE-UNIX-DB' && isTapeWinUnix && !isTapeUnixDb) continue;

      // Se for SQL ou ConnectDirect, ignorar validações genéricas de nome de arquivo Unix/Windows/Mainframe
      if ((rule.codigo.includes('PREFIX') || rule.codigo.includes('UPPER-MAX')) &&
          (rule.codigo.includes('UNIX') || rule.codigo.includes('WIN') || rule.codigo.includes('MAINFRAME'))) {
        if (isSql || isCD) continue;
      }

      let passed = true;

      if (rule.tipo_regra === 'regex' && rule.expressao) {
        try {
          const rx = new RegExp(rule.expressao);
          passed = rx.test(valStr);
        } catch (e) {
          console.error(`Erro ao compilar regex da regra ${rule.codigo}:`, e);
          passed = false;
        }
      } else if (rule.tipo_regra === 'custom') {
        // Validações customizadas complexas
        if (rule.expressao === 'shell_exception') {
          // Exceção Shell: se for .sh, tamanho máx 16
          if (valStr.toLowerCase().endsWith('.sh')) {
            passed = valStr.length <= 16;
          }
        } else if (rule.expressao === 'jar_exception') {
          // Exceção JAR: se for .jar, tamanho da identificação (sem .jar) máx 18
          if (valStr.toLowerCase().endsWith('.jar')) {
            const base = valStr.substring(0, valStr.length - 4);
            passed = base.length <= 18;
          }
        } else if (rule.expressao === 'db_object_name_validation') {
          // Nome do objeto procedural batch: max 30, letras maiúsculas, TT_SIS_SUB_999_OPCIONAL
          const rx = /^[A-Z0-9]{2}_[A-Z]{3}_[A-Z]{3}_[0-9]{3}(_[A-Z0-9]{1,15})?$/;
          passed = rx.test(valStr) && valStr.length <= 30;
        } else if (rule.expressao === 'tape_win_unix_validation') {
          // F P HHHHHHHH / T / OO (max 17)
          const rx = /^F[DHME][A-Z0-9]{1,8}\/[CDFIN]\/(ON|OF)$/;
          passed = rx.test(valStr) && valStr.length <= 17;
        } else if (rule.expressao === 'tape_unix_db_validation') {
          // F P NNNNNNNN IIIII / T / 00 (max 25)
          const rx = /^F[DHME][A-Z0-9]{1,8}[A-Z0-9]{1,6}\/[CDFIN]\/(ON|OF)$/;
          passed = rx.test(valStr);
        } else if (rule.expressao === 'cd_send_validation') {
          // F SIS SUB 99 . MMMMMMMM . BXXX . AAAAMMDD . HHMMSS . X NNNNNNN
          const rx = /^F[A-Z]{3}[A-Z]{3}[0-9]{2}\.([A-Z0-9]{1,8}|MMMMMMMM)\.[BIE][0-9]{3}\.[0-9]{8}\.[0-9]{6}\.[DR][0-9]{7}$/;
          passed = rx.test(valStr);
        } else if (rule.expressao === 'cd_receive_validation') {
          // SIS SUB 99 . BXXX . X NNNNNNN
          const rx = /^[A-Z]{3}[A-Z]{3}[0-9]{2}\.[BIE][0-9]{3}\.[DR][0-9]{7}$/;
          passed = rx.test(valStr);
        }
      }

      if (!passed) {
        const errObj: ValidationError = {
          ruleCode: rule.codigo,
          field: rule.campo_alvo,
          message: rule.mensagem,
          severity: rule.severidade as 'BLOQUEANTE' | 'AVISO',
          value: valStr,
        };

        if (rule.severidade === 'BLOQUEANTE') {
          errors.push(errObj);
        } else {
          warnings.push(errObj);
        }
      }
    }

    const passedAll = errors.length === 0;

    // 5. Salvar Histórico de Execução no Banco de Dados
    if (saveRun) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        const { rows: runRows } = await client.query(
          `INSERT INTO "JobsIA_validation_runs" (checklist_id, user_id, passed)
           VALUES ($1, $2, $3) RETURNING id`,
          [checklistId || null, userId || null, passedAll]
        );
        const runId = runRows[0].id;

        // Salvar todos os resultados detalhados (passou ou não)
        for (const rule of normRules) {
          const fieldVal = data[rule.campo_alvo];
          const valStr = fieldVal !== undefined && fieldVal !== null ? String(fieldVal) : null;
          
          const isError = errors.some(e => e.ruleCode === rule.codigo);
          const isWarning = warnings.some(w => w.ruleCode === rule.codigo);
          const passedThis = !isError && !isWarning;

          await client.query(
            `INSERT INTO "JobsIA_validation_results" 
              (validation_run_id, rule_id, rule_code, rule_version, campo_alvo, valor_analisado, severidade, mensagem, passou)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              runId,
              rule.id,
              rule.codigo,
              rule.versao,
              rule.campo_alvo,
              valStr,
              rule.severidade,
              rule.mensagem,
              passedThis,
            ]
          );
        }

        await client.query('COMMIT');
        return {
          passed: passedAll,
          errors,
          warnings,
          appliedRulesCount: normRules.length,
          validationRunId: runId,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('validationEngine.saveRun:', err);
      } finally {
        client.release();
      }
    }

    return {
      passed: passedAll,
      errors,
      warnings,
      appliedRulesCount: normRules.length,
    };
  },

  /**
   * Validates an Application-level checklist (schema v2). This wraps the
   * proven per-job validator rather than duplicating nomenclature rules, then
   * adds Application/catalog/server/CAPADOR checks that have no v1 analogue.
   */
  async validateApplicationChecklist(
    proposal: ChecklistApplicationProposal,
    userId?: string,
    saveRun = false,
    checklistId?: string
  ): Promise<ApplicationChecklistValidationRunResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let appliedRulesCount = 0;

    const applicationRules = await getApplicationValidationRules();
    const applicationNameResult = validateApplicationName(proposal.application.name, applicationRules);
    errors.push(...applicationNameResult.errors);
    warnings.push(...applicationNameResult.warnings);

    const jobTypeIds = [...new Set(proposal.jobs.map(job => job.job_type_id))];
    const { rows: typeRows } = await pool.query(
      'SELECT id FROM "JobsIA_types" WHERE id = ANY($1::int[])',
      [jobTypeIds]
    );
    const knownJobTypes = new Set(typeRows.map((row: any) => Number(row.id)));
    const requirements = await getJobChecklistRequirements(jobTypeIds);
    const jobResults: ApplicationJobValidationResult[] = [];

    for (const job of proposal.jobs) {
      const jobErrors: ValidationError[] = [];
      const jobWarnings: ValidationError[] = [];
      let jobAppliedRulesCount = 0;
      const jobPrefix = `jobs[${job.sequence}]`;

      if (!knownJobTypes.has(job.job_type_id)) {
        jobErrors.push(createStructuredError(
          'JOB-TYPE-NOT-FOUND',
          `${jobPrefix}.job_type_id`,
          `Job Tipo ${job.job_type_id} não encontrado.`,
          'BLOQUEANTE',
          String(job.job_type_id)
        ));
      } else {
        const requirement = requirements.get(job.job_type_id);

        // Tipo 3 is explicitly server-bound by the approved test feedback.
        // Keep this guard even before a freshly provisioned catalog receives
        // its requirement seed; other job types remain metadata-driven.
        const requiresServer = requirement?.requires_server === true || job.job_type_id === 3;
        if (requiresServer && !job.server) {
          jobErrors.push(createStructuredError(
            'JOB-SERVER-REQUIRED',
            `${jobPrefix}.server`,
            `O servidor é obrigatório para o Job Tipo ${job.job_type_id}.`,
            'BLOQUEANTE'
          ));
        }

        if (requirement?.requires_capador && job.capador?.applicable !== true) {
          jobErrors.push(createStructuredError(
            'JOB-CAPADOR-REQUIRED',
            `${jobPrefix}.capador`,
            `Os dados CAPADOR são obrigatórios para o Job Tipo ${job.job_type_id}.`,
            'BLOQUEANTE'
          ));
        }

        // Catalog references are structurally required by schema v2. If a
        // future job rule declares one optional, still validate it when sent.
        const [genericCatalog, bridgeCatalog] = await Promise.all([
          validateCatalogReference('GENERIC', job.generic, `${jobPrefix}.generic`),
          validateCatalogReference('BRIDGE', job.bridge, `${jobPrefix}.bridge`),
        ]);
        jobErrors.push(...genericCatalog.errors, ...bridgeCatalog.errors);
        jobWarnings.push(...genericCatalog.warnings, ...bridgeCatalog.warnings);

        const suppliedApplication = valueForKey(job.parameters, 'Application');
        if (hasTextValue(suppliedApplication) && !valuesMatch(suppliedApplication, proposal.application.name)) {
          jobErrors.push(createStructuredError(
            'JOB-APPLICATION-MISMATCH',
            `${jobPrefix}.parameters.Application`,
            'A Application informada nos parâmetros do job diverge da Application do checklist.',
            'BLOQUEANTE',
            String(suppliedApplication)
          ));
        }

        const suppliedServer = valueForKey(job.parameters, 'Servidor');
        if (job.server && hasTextValue(suppliedServer) && !valuesMatch(suppliedServer, job.server)) {
          jobErrors.push(createStructuredError(
            'JOB-SERVER-MISMATCH',
            `${jobPrefix}.parameters.Servidor`,
            'O servidor informado nos parâmetros do job diverge do servidor definido para este job.',
            'BLOQUEANTE',
            String(suppliedServer)
          ));
        }

        const validationData: Record<string, any> = {
          ...job.parameters,
          Application: proposal.application.name,
          ...(job.server ? { Servidor: job.server } : {}),
          ...(job.capador?.applicable && job.capador.parameters ? job.capador.parameters : {}),
        };
        const perJobResult = await this.validateChecklist(
          job.job_type_id,
          validationData,
          userId,
          false
        );
        jobAppliedRulesCount = perJobResult.appliedRulesCount;
        jobErrors.push(...perJobResult.errors.map(error => prefixedValidationError(error, `${jobPrefix}.parameters`)));
        jobWarnings.push(...perJobResult.warnings.map(error => prefixedValidationError(error, `${jobPrefix}.parameters`)));
      }

      const jobPassed = jobErrors.length === 0;
      jobResults.push({
        sequence: job.sequence,
        jobTypeId: job.job_type_id,
        passed: jobPassed,
        errors: jobErrors,
        warnings: jobWarnings,
        appliedRulesCount: jobAppliedRulesCount,
      });
      errors.push(...jobErrors);
      warnings.push(...jobWarnings);
      appliedRulesCount += jobAppliedRulesCount;
    }

    const passed = errors.length === 0;
    const validationRunId = saveRun
      ? await saveStructuredValidationRun(passed, errors, warnings, userId, checklistId)
      : undefined;

    return {
      passed,
      errors,
      warnings,
      appliedRulesCount,
      applicationName: proposal.application.name,
      ...(applicationNameResult.suggestedValue
        ? { suggestedApplicationName: applicationNameResult.suggestedValue }
        : {}),
      jobs: jobResults,
      ...(validationRunId ? { validationRunId } : {}),
    };
  },
};
