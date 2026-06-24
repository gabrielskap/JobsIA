import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { validationEngine } from '../services/validationEngine';
import { validateChecklistProposal } from '../schemas/checklistSchema';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    let query = 'SELECT * FROM "JobsIA_checklists" ORDER BY created_at DESC';
    const params: unknown[] = [];

    if (userRole === 'SOLICITANTE') {
      // Solicitante só acessa os próprios checklists
      query = 'SELECT * FROM "JobsIA_checklists" WHERE user_id = $1 ORDER BY created_at DESC';
      params.push(req.userId);
    } else {
      // ADMIN ou OPERADOR podem acessar checklists de outros usuários filtrando via query string
      const { userId } = req.query as { userId?: string };
      if (userId) {
        query = 'SELECT * FROM "JobsIA_checklists" WHERE user_id = $1 ORDER BY created_at DESC';
        params.push(userId);
      }
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('checklists.getAll:', err);
    res.status(500).json({ message: 'Erro ao buscar checklists' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  const derivedUserId = req.userId;
  const derivedUserName = req.user?.name || '';

  // 1. Verificar idempotência se houver request_id / idempotency_key
  const requestId = req.body.request_id !== undefined ? req.body.request_id : req.body.idempotency_key;
  if (requestId && String(requestId).trim() !== '') {
    try {
      const { rows: existingRows } = await pool.query(
        'SELECT * FROM "JobsIA_checklists" WHERE request_id = $1',
        [requestId]
      );
      if (existingRows.length > 0) {
        res.status(200).json(existingRows[0]);
        return;
      }
    } catch (err) {
      console.error('checklists.checkIdempotency:', err);
    }
  }

  // 2. Tratar requisição estruturada vs legado
  let conversation_id: string | null = null;
  let jobTypeId: number;
  let collected_data: Record<string, any>;
  let type: string | undefined = undefined;
  let originalFileName: string | null = null;

  const isStructured =
    req.body.request_id !== undefined ||
    req.body.idempotency_key !== undefined ||
    req.body.job_type_id !== undefined ||
    req.body.collected_data !== undefined;

  if (isStructured) {
    // Validar contra o schema estruturado versionado
    const validation = validateChecklistProposal(req.body);
    if (!validation.success) {
      res.status(400).json({
        message: 'Erro de validação do schema do checklist.',
        errors: validation.errors,
      });
      return;
    }
    const proposal = validation.data!;
    conversation_id = proposal.conversation_id || null;
    jobTypeId = proposal.job_type_id;
    collected_data = proposal.collected_data;
  } else {
    // Fluxo legado (retrocompatibilidade)
    const { conversation_id: cid, type: legacyType, data, file_name } = req.body;
    conversation_id = cid || null;
    type = legacyType;
    originalFileName = file_name || null;
    jobTypeId = Number(data?.__job_type_id || data?.__job_name?.match(/Tipo (\d+)/)?.[1]);
    collected_data = { ...data };
    // Limpar chaves internas no collected_data legado se existirem
    delete collected_data.__command;
    delete collected_data.__job_name;
    delete collected_data.__job_type_id;
  }

  try {
    let finalStatus = 'Concluído';
    let errorsList: any[] = [];
    let warningsList: any[] = [];
    let generatedCommand: string | null = null;
    let semanticType: string = 'generic_file';
    let targetFile: string | null = null;
    let finalType = type;
    let dataToSave = { ...collected_data };
    let valRunId: string | undefined = undefined;

    if (jobTypeId) {
      // 3. Buscar metadados do Job Type no Banco de Dados
      const { rows: jobRows } = await pool.query(
        'SELECT * FROM "JobsIA_types" WHERE id = $1',
        [jobTypeId]
      );
      if (jobRows.length === 0) {
        res.status(404).json({ message: `Job Tipo ${jobTypeId} não encontrado.` });
        return;
      }
      const job = jobRows[0];

      const { rows: paramRows } = await pool.query(
        'SELECT * FROM "JobsIA_parameters" WHERE job_type_id = $1 AND active = true ORDER BY order_index ASC',
        [jobTypeId]
      );

      // 4. Executar Validação (Sem gravar Concluído antes de validar)
      const valResult = await validationEngine.validateChecklist(
        jobTypeId,
        collected_data,
        req.userId,
        true
      );

      finalStatus = valResult.passed ? 'Concluído' : 'Falha Validação';
      errorsList = valResult.errors || [];
      warningsList = valResult.warnings || [];
      valRunId = valResult.validationRunId;

      // 5. Geração do Comando no Backend
      const parts: string[] = [job.script];
      for (const param of paramRows) {
        if (param.parameter_type === 'internal' || param.parameter_type === 'generated') continue;
        const value = collected_data[param.name];
        if (value === undefined || value === null || String(value).trim() === '') continue;

        if (param.parameter_type === 'flag' && param.flag) {
          parts.push(`${param.flag}${value}`);
        } else if (param.parameter_type === 'positional') {
          parts.push(`"${value}"`);
        }
      }
      generatedCommand = parts.join(' ');

      // 6. Mapear target_file e derivar semantic_type
      targetFile =
        collected_data.file_name ||
        collected_data.shell_name ||
        collected_data.program_name ||
        collected_data.nome_arquivo ||
        collected_data.nome_script ||
        collected_data.tape_label ||
        collected_data.rotulo_fita ||
        collected_data.fita ||
        collected_data.object_name ||
        collected_data.nome_objeto ||
        collected_data.objeto ||
        originalFileName ||
        '';

      const targetFileLower = String(targetFile).toLowerCase();

      if (targetFileLower.endsWith('.sh') || job.script.toLowerCase().endsWith('.sh')) {
        semanticType = 'shell_script';
      } else if (targetFileLower.endsWith('.jar') || job.script.toLowerCase().endsWith('.jar')) {
        semanticType = 'java_executable';
      } else if (targetFileLower.endsWith('.sql') || job.script.toLowerCase().endsWith('.sql')) {
        semanticType = 'database_procedural';
      } else if (collected_data.tape_label || collected_data.rotulo_fita || collected_data.fita) {
        semanticType = 'tape_backup';
      } else if (
        targetFileLower.startsWith('f') &&
        (targetFileLower.includes('.mmmmmmmm.') || /^[a-z]{3}[a-z]{3}[0-9]{2}\.[bie][0-9]{3}\.[dr][0-9]{7}$/.test(targetFileLower))
      ) {
        semanticType = 'connect_direct';
      }

      if (!finalType) {
        finalType = job.script
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '') || `tipo_${jobTypeId}`;
      }

      // Salvar argumentos estruturados na coluna data
      dataToSave = {
        ...collected_data,
        __command: generatedCommand,
        __job_name: job.name,
        __job_type_id: jobTypeId,
      };
    } else {
      // Caso legado extremo sem jobTypeId (ex. rbac.test.ts)
      finalStatus = req.body.status || 'Concluído';
      finalType = finalType || 'generic';
      targetFile = originalFileName || '';
    }

    // 7. Salvar checklist no Banco de Dados de forma idempotente
    let savedChecklist;
    try {
      const insertQuery = `
        INSERT INTO "JobsIA_checklists" (
          conversation_id, type, data, status, user_id, user_name, file_name,
          semantic_type, job_type_id, target_file, request_id, errors, warnings, command
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;
      const insertParams = [
        conversation_id,
        finalType,
        JSON.stringify(dataToSave),
        finalStatus,
        derivedUserId,
        derivedUserName,
        targetFile || null,
        semanticType,
        jobTypeId || null,
        targetFile || null,
        requestId || null,
        JSON.stringify(errorsList),
        JSON.stringify(warningsList),
        generatedCommand,
      ];

      const { rows } = await pool.query(insertQuery, insertParams);
      savedChecklist = rows[0];
    } catch (err: any) {
      // Se for erro de chave única duplicada (request_id), fazer fallback para retornar o existente
      if (err.code === '23505' && requestId) {
        const { rows: existingRows } = await pool.query(
          'SELECT * FROM "JobsIA_checklists" WHERE request_id = $1',
          [requestId]
        );
        if (existingRows.length > 0) {
          res.status(200).json(existingRows[0]);
          return;
        }
      }
      throw err;
    }

    // 8. Atualizar a run de validação com o ID do checklist salvo
    if (valRunId && savedChecklist) {
      await pool.query(
        `UPDATE "JobsIA_validation_runs" SET checklist_id = $1 WHERE id = $2`,
        [savedChecklist.id, valRunId]
      );
    }

    res.status(201).json(savedChecklist);
  } catch (err) {
    console.error('checklists.create:', err);
    res.status(500).json({ message: 'Erro ao criar checklist' });
  }
});

export default router;
