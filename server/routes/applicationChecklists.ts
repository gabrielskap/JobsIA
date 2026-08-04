import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, logAudit, type AuthRequest } from '../middleware/auth';
import {
  type ChecklistApplicationJob,
  type ChecklistApplicationProposal,
  type ChecklistFieldValue,
  validateChecklistApplicationProposal,
} from '../schemas/checklistSchema';
import { validationEngine, type ValidationError } from '../services/validationEngine';

const router = Router();
router.use(requireAuth);

type JobTypeRecord = { id: number; name: string; script: string };
type JobParameterRecord = {
  name: string;
  flag: string | null;
  required: boolean;
  parameter_type: string;
  order_index: number;
  collection_scope?: 'APPLICATION' | 'JOB' | 'CAPADOR';
  document_only?: boolean;
};

const CAPADOR_PARAMETER_NAMES = new Set([
  'diretorio_origem',
  'diretorio_destino',
  'capacidade_armazenamento',
  'permissoes_usuario',
]);

function issue(ruleCode: string, field: string, message: string): ValidationError {
  return { ruleCode, field, message, severity: 'BLOQUEANTE' };
}

function fieldValue(values: Record<string, ChecklistFieldValue>, name: string): ChecklistFieldValue | undefined {
  if (values[name] !== undefined) return values[name];
  const key = Object.keys(values).find(candidate => candidate.trim().toLowerCase() === name.trim().toLowerCase());
  return key ? values[key] : undefined;
}

function textValue(value: ChecklistFieldValue | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(item => String(item ?? '')).filter(Boolean).join(',');
  return String(value);
}

function buildCommand(script: string, parameters: JobParameterRecord[], values: Record<string, ChecklistFieldValue>): string {
  const parts = [script];
  for (const parameter of parameters) {
    if (parameter.document_only || (parameter.parameter_type !== 'flag' && parameter.parameter_type !== 'positional')) continue;
    const value = textValue(fieldValue(values, parameter.name));
    if (!value?.trim()) continue;
    if (parameter.parameter_type === 'flag' && parameter.flag) {
      parts.push(parameter.flag + value);
    } else if (parameter.parameter_type === 'positional') {
      parts.push('"' + value + '"');
    }
  }
  return parts.join(' ');
}

function normalizeCommandValues(
  job: ChecklistApplicationJob,
  applicationName: string,
  parameters: JobParameterRecord[]
): Record<string, ChecklistFieldValue> {
  const values = { ...job.parameters };
  const applicationParameter = parameters.find(parameter => parameter.name.trim().toLowerCase() === 'application');
  if (applicationParameter) {
    values[applicationParameter.name] = applicationName;
  }
  const serverParameter = parameters.find(parameter => parameter.name.trim().toLowerCase() === 'servidor');
  if (job.server && serverParameter) {
    values[serverParameter.name] = job.server;
  }
  return values;
}

async function hydrateJobs(
  proposal: ChecklistApplicationProposal
): Promise<{ jobs: Array<Record<string, unknown>>; commands: string[]; errors: ValidationError[] }> {
  const jobIds = [...new Set(proposal.jobs.map(job => job.job_type_id))];
  const typesResult = await pool.query<JobTypeRecord>(
    'SELECT id, name, script FROM "JobsIA_types" WHERE id = ANY($1::int[])',
    [jobIds]
  );
  const parameterResults = await Promise.all(
    jobIds.map(jobTypeId => pool.query<JobParameterRecord>(
      'SELECT name, flag, required, parameter_type, order_index, collection_scope, document_only FROM "JobsIA_parameters" WHERE active = true AND job_type_id = $1 ORDER BY order_index ASC, name ASC',
      [jobTypeId]
    ))
  );
  const typeById = new Map(typesResult.rows.map(type => [type.id, type]));
  const parametersByJob = new Map(jobIds.map((id, index) => [id, parameterResults[index].rows]));
  const errors: ValidationError[] = [];
  const commands: string[] = [];
  const jobs: Array<Record<string, unknown>> = [];

  for (const job of proposal.jobs) {
    const type = typeById.get(job.job_type_id);
    const jobField = 'jobs[' + job.sequence + ']';
    if (!type) {
      errors.push(issue('JOB-TYPE-NOT-FOUND', jobField + '.job_type_id', 'O tipo de Job ' + job.job_type_id + ' não está cadastrado.'));
      continue;
    }

    const parameters = parametersByJob.get(job.job_type_id) || [];
    const commandValues = normalizeCommandValues(job, proposal.application.name, parameters);

    const capadorNames = parameters
      .filter(parameter =>
        parameter.collection_scope === 'CAPADOR'
        || CAPADOR_PARAMETER_NAMES.has(parameter.name.trim().toLowerCase())
      )
      .map(parameter => parameter.name);
    if (capadorNames.length > 0 && !job.capador) {
      errors.push(issue('CAPADOR-DECISION-REQUIRED', jobField + '.capador', 'Informe explicitamente se os parâmetros CAPADOR são aplicáveis a este job.'));
    }
    if (job.capador?.applicable) {
      const capadorValues = job.capador.parameters || {};
      if (!capadorNames.some(name => Boolean(textValue(fieldValue(capadorValues, name))?.trim()))) {
        errors.push(issue('CAPADOR-DATA-REQUIRED', jobField + '.capador.parameters', 'Informe ao menos um parâmetro CAPADOR ou marque CAPADOR como não aplicável.'));
      }
      for (const parameter of parameters.filter(item => item.required && capadorNames.includes(item.name))) {
        const name = parameter.name;
        if (!textValue(fieldValue(capadorValues, name))?.trim()) {
          errors.push(issue('CAPADOR-REQUIRED-' + name.toUpperCase(), jobField + '.capador.parameters.' + name, 'O parâmetro CAPADOR "' + name + '" é obrigatório quando CAPADOR é aplicável.'));
        }
      }
    }

    const command = buildCommand(type.script, parameters, commandValues);
    commands.push(command);
    jobs.push({
      ...job,
      job_type_name: type.name,
      command,
      parameters: commandValues,
    });
  }

  return { jobs, commands, errors };
}

router.post('/', async (req: AuthRequest, res) => {
  const proposalResult = validateChecklistApplicationProposal(req.body);
  if (!proposalResult.success || !proposalResult.data) {
    res.status(422).json({
      message: 'O checklist da Application possui dados obrigatórios pendentes ou inválidos.',
      status: 'Falha Validação',
      errors: (proposalResult.errors || []).map(message => issue('APPLICATION-SCHEMA', 'application', message)),
    });
    return;
  }

  const proposal = proposalResult.data;
  try {
    const { rows: existingRows } = await pool.query(
      'SELECT * FROM "JobsIA_checklists" WHERE request_id = $1',
      [proposal.request_id]
    );
    if (existingRows.length > 0) {
      const existing = existingRows[0];
      if (existing.user_id && existing.user_id !== req.userId) {
        res.status(409).json({ message: 'A chave de idempotência já pertence a outro usuário.' });
        return;
      }
      res.status(200).json(existing);
      return;
    }

    const [applicationValidation, jobsResult] = await Promise.all([
      validationEngine.validateApplicationChecklist(proposal, req.userId, false),
      hydrateJobs(proposal),
    ]);
    // O motor v2 é a fonte determinística para Application, catálogo,
    // servidores e parâmetros de cada job. A hidratação acrescenta apenas a
    // decisão explícita de CAPADOR e os comandos documentais.
    const errors = [
      ...applicationValidation.errors,
      ...jobsResult.errors.filter(error => error.ruleCode.startsWith('CAPADOR-')),
    ];
    if (errors.some(error => error.severity === 'BLOQUEANTE')) {
      res.status(422).json({
        message: 'O checklist da Application não foi finalizado. Corrija as pendências indicadas.',
        status: 'Falha Validação',
        errors,
        warnings: applicationValidation.warnings,
        ...(applicationValidation.suggestedApplicationName
          ? { suggested_application_name: applicationValidation.suggestedApplicationName }
          : {}),
      });
      return;
    }

    const data = {
      ...proposal,
      application: {
        ...proposal.application,
        requester_name: proposal.application.requester_name || req.user?.name || '',
      },
      jobs: jobsResult.jobs,
      commands: jobsResult.commands,
    };
    const command = jobsResult.commands.join('\n');
    const { rows } = await pool.query(
      'INSERT INTO "JobsIA_checklists" (conversation_id, type, data, status, user_id, user_name, file_name, semantic_type, job_type_id, target_file, request_id, errors, warnings, command, schema_version, workflow_status, application_name, responsible_name, application_data, job_items, schedule_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING *',
      [
        proposal.conversation_id || null,
        'application_checklist',
        JSON.stringify(data),
        'Concluído',
        req.userId || null,
        req.user?.name || '',
        proposal.application.name,
        'application_checklist',
        proposal.application.name,
        proposal.request_id,
        JSON.stringify([]),
        JSON.stringify(applicationValidation.warnings),
        command,
        2,
        'FINAL',
        proposal.application.name,
        proposal.application.responsible_name,
        JSON.stringify(proposal.application),
        JSON.stringify(jobsResult.jobs),
        proposal.application.schedule ? JSON.stringify(proposal.application.schedule) : null,
      ]
    );

    const saved = rows[0];
    await logAudit(req.userId, 'CREATE_APPLICATION_CHECKLIST', {
      checklist_id: saved.id,
      application: proposal.application.name,
      jobs: proposal.jobs.length,
      schema_version: 2,
    }, req.ip);
    res.status(201).json(saved);
  } catch (error: any) {
    if (error?.code === '23505') {
      const { rows } = await pool.query('SELECT * FROM "JobsIA_checklists" WHERE request_id = $1', [proposal.request_id]);
      if (rows.length > 0) {
        res.status(200).json(rows[0]);
        return;
      }
    }
    if (error?.code === '42P01' || error?.code === '42703') {
      res.status(503).json({
        message: 'O checklist estruturado ainda não está disponível neste ambiente. Aplique a migração 0021 antes de finalizar Applications.',
      });
      return;
    }
    console.error('applicationChecklists.create:', error);
    res.status(500).json({ message: 'Erro ao finalizar o checklist da Application.' });
  }
});

export default router;
