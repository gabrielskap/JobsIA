import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { validationEngine } from '../services/validationEngine';
import { validateChecklistProposal } from '../schemas/checklistSchema';
import { pdfService } from '../services/pdfService';

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

    // 7. Obter snapshot de regras aplicadas para o checklist
    let appliedRulesSnapshot: any = null;
    let appliedRulesHash: string | null = null;
    if (jobTypeId) {
      try {
        const detectedEnv = (collected_data.ambiente || collected_data.environment || 'Unix') as string;
        const { rows: appliedRules } = await pool.query(
          `SELECT id, codigo, version, expressao, mensagem FROM "JobsIA_validation_rules" 
           WHERE ativo = true 
             AND status = 'PUBLICADO'
             AND (ambiente = $1 OR ambiente = 'Global')
             AND (aplicabilidade_job IS NULL OR $2 = ANY(aplicabilidade_job))
             AND vigencia_inicio <= now() 
             AND (vigencia_fim IS NULL OR vigencia_fim >= now())`,
          [detectedEnv, jobTypeId]
        );
        if (appliedRules.length > 0) {
          appliedRulesSnapshot = appliedRules.map(r => ({
            id: r.id,
            codigo: r.codigo,
            version: r.version,
            expressao: r.expressao,
            mensagem: r.mensagem
          }));
          const crypto = await import('crypto');
          appliedRulesHash = crypto.createHash('sha256').update(JSON.stringify(appliedRulesSnapshot)).digest('hex');
        }
      } catch (snapshotErr) {
        console.error('Falha ao gerar snapshot das regras:', snapshotErr);
      }
    }

    // 7. Salvar checklist no Banco de Dados de forma idempotente
    let savedChecklist;
    try {
      const insertQuery = `
        INSERT INTO "JobsIA_checklists" (
          conversation_id, type, data, status, user_id, user_name, file_name,
          semantic_type, job_type_id, target_file, request_id, errors, warnings, command,
          applied_rules_snapshot, applied_rules_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
        appliedRulesSnapshot ? JSON.stringify(appliedRulesSnapshot) : null,
        appliedRulesHash
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

      // Classificar a interação no histórico se houver conversa vinculada
      if (conversation_id) {
        try {
          // Achar a última mensagem da LIA/User
          const { rows: msgRows } = await pool.query(
            `SELECT id FROM "JobsIA_messages" WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [conversation_id]
          );
          const msgId = msgRows[0]?.id;
          
          const ruleCode = errorsList[0]?.ruleCode || warningsList[0]?.ruleCode || null;
          const assunto = ruleCode ? 'nomenclatura' : 'parametros';
          const resultado = finalStatus;

          await pool.query(
            `INSERT INTO "JobsIA_interaction_classifications" (message_id, assunto, job_type_id, regra_acionada, resultado)
             VALUES ($1, $2, $3, $4, $5)`,
            [msgId || null, assunto, jobTypeId || null, ruleCode, resultado]
          );
        } catch (classificationErr) {
          console.error('Falha ao classificar interacao automaticamente:', classificationErr);
        }
      }
    }

    res.status(201).json(savedChecklist);
  } catch (err) {
    console.error('checklists.create:', err);
    res.status(500).json({ message: 'Erro ao criar checklist' });
  }
});

router.get('/:id/pdf', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // 1. Buscar o checklist no banco de dados
    const { rows } = await pool.query('SELECT * FROM "JobsIA_checklists" WHERE id = $1', [id]);
    if (rows.length === 0) {
      res.status(404).json({ message: 'Checklist não encontrado.' });
      return;
    }
    const checklist = rows[0];

    // 2. Aplicar autorização baseada em papéis
    if (req.user?.role === 'SOLICITANTE' && checklist.user_id !== req.userId) {
      res.status(403).json({ message: 'Acesso negado.' });
      return;
    }

    // 3. Buscar nome do tipo de job se houver
    let jobTypeName = '';
    if (checklist.job_type_id) {
      const { rows: jobRows } = await pool.query('SELECT name FROM "JobsIA_types" WHERE id = $1', [checklist.job_type_id]);
      if (jobRows.length > 0) {
        jobTypeName = jobRows[0].name;
      }
    }

    // 4. Mapear dados coletados
    const collected = checklist.data || {};
    const payload = {
      id: checklist.id,
      rqs_rdm: collected.rqs_rdm || collected.rqs || collected.rdm || 'N/A',
      status: checklist.status,
      user_name: checklist.user_name || 'Agente de IA',
      created_at: checklist.created_at,
      job_type_name: jobTypeName || checklist.type,
      job_type_id: checklist.job_type_id,
      command: checklist.command || collected.__command || '',
      
      gestor: collected.gestor,
      solicitante: collected.solicitante,
      desenvolvedor: collected.desenvolvedor,
      matricula: collected.matricula,
      area: collected.area,
      contato: collected.contato,
      
      application: collected.application,
      periodicidade: collected.periodicidade,
      tipo_execucao: collected.tipo_execucao,
      sistema: collected.sistema,
      rotina: collected.rotina,
      objetivo: collected.objetivo,
      quantidade_jobs: collected.quantidade_jobs,
      
      sequencia_jobs: collected.sequencia_jobs,
      ascendencia: collected.ascendencia,
      descendencia: collected.descendencia,
      horario_permitido: collected.horario_permitido || collected.horario,
      feriado_fds: collected.feriado_fds || collected.feriados,
      simultaneidade: collected.simultaneidade,
      regras_concorrencia: collected.regras_concorrencia,
      
      origem_destino: collected.origem_destino || collected.diretorio_destino || collected.diretorio_origem,
      servidores: collected.servidores || collected.servidor || collected.servidor_origem,
      operacao: collected.operacao || collected.get_put,
      codificacao: collected.codificacao,
      temporalidade: collected.temporalidade || collected.retencao,
      
      errors: checklist.errors || [],
      warnings: checklist.warnings || [],
      applied_rules_snapshot: checklist.applied_rules_snapshot,
      applied_rules_hash: checklist.applied_rules_hash,
    };

    // 5. Gerar o buffer do PDF
    const pdfBuffer = pdfService.generateChecklistPDF(payload);

    // 6. Retornar para download
    const safeFileName = `Checklist_${checklist.type || 'Job'}_${id}.pdf`.replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('checklists.getPDF:', err);
    res.status(500).json({ message: 'Erro ao gerar PDF do checklist' });
  }
});

export default router;
