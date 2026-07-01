import { pool } from '../db';

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

      // Validação de Required
      if (param.required && !isPresent) {
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

    // Validação de Dependências e Opcionais (ex: se preencher um, deve preencher o outro)
    // Se "diretorio_origem" estiver presente, "diretorio_destino" também deve
    if (data.diretorio_origem && !data.diretorio_destino) {
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
      const isCDSend = valStr.startsWith('F') && valStr.includes('.MMMMMMMM.');
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
          const rx = /^F[A-Z]{3}[A-Z]{3}[0-9]{2}\.MMMMMMMM\.[BIE][0-9]{3}\.[0-9]{8}\.[0-9]{6}\.[DR][0-9]{7}$/;
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
};
