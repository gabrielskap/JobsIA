import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

let logoBase64 = '';
try {
  const logoPath = path.join(process.cwd(), 'public/dataprev-logo.png');
  if (fs.existsSync(logoPath)) {
    logoBase64 = fs.readFileSync(logoPath).toString('base64');
  }
} catch (err) {
  console.error('Erro ao carregar a logo do PDF:', err);
}


export interface PDFDataPayload {
  // Document metadata
  id?: string;
  rqs_rdm?: string;
  status: string;
  user_name: string;
  created_at?: string | Date;
  job_type_name?: string;
  job_type_id?: number;
  command?: string;

  // Collected data fields
  gestor?: string;
  solicitante?: string;
  desenvolvedor?: string;
  matricula?: string;
  area?: string;
  contato?: string;

  application?: string;
  periodicidade?: string;
  tipo_execucao?: string;
  sistema?: string;
  rotina?: string;
  objetivo?: string;
  quantidade_jobs?: string | number;

  sequencia_jobs?: string;
  ascendencia?: string;
  descendencia?: string;
  horario_permitido?: string;
  feriado_fds?: string;
  simultaneidade?: string;
  regras_concorrencia?: string;

  // Transfer specifications
  origem_destino?: string;
  servidores?: string;
  operacao?: string;
  codificacao?: string;
  temporalidade?: string;

  // Validation results
  errors?: any[];
  warnings?: any[];
  applied_rules_snapshot?: any;
  applied_rules_hash?: string;
}

export const TEMPLATE_VERSION = '2.0.0';
export const SCHEMA_VERSION = '1.0';

export const pdfService = {
  generateChecklistPDF(payload: PDFDataPayload): Buffer {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageW = doc.internal.pageSize.getWidth(); // 210
    const pageH = doc.internal.pageSize.getHeight(); // 297
    const margin = 15;
    const contentW = pageW - margin * 2; // 180
    let y = 30; // Starting Y coordinate below header

    // Helper to ensure layout doesn't overflow page bounds
    const checkSpace = (heightNeeded: number) => {
      if (y + heightNeeded > pageH - 22) {
        doc.addPage();
        y = 30; // Reset Y on new page
      }
    };

    // Draw Section Header
    const drawSectionHeader = (title: string) => {
      checkSpace(12);
      doc.setFillColor(29, 78, 216); // #1d4ed8 Primary Blue
      doc.rect(margin, y, contentW, 6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(title.toUpperCase(), margin + 3, y + 4.2);
      y += 8;
    };

    // Draw Field Rows
    const drawFieldsTable = (fields: { label: string; value: string }[]) => {
      // Filtrar campos vazios ou com valor 'N/A'
      const filteredFields = fields.filter((field) => {
        const valStr = String(field.value || '').trim();
        return valStr !== '' && valStr.toUpperCase() !== 'N/A';
      });

      if (filteredFields.length === 0) return;

      filteredFields.forEach((field) => {
        const valStr = String(field.value).trim();
        const valueLines = doc.splitTextToSize(valStr, 110);
        const rowH = Math.max(1, valueLines.length) * 5 + 2;

        checkSpace(rowH);

        // Row background
        doc.setFillColor(248, 250, 252); // slate 50
        doc.rect(margin, y, contentW, rowH, 'F');

        // Draw left cell (Label)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105); // slate 600
        doc.text(field.label, margin + 4, y + 4.5);

        // Draw right cell (Value)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42); // slate 900
        doc.text(valueLines, margin + 55, y + 4.5);

        // Border separator
        doc.setDrawColor(226, 232, 240); // slate 200
        doc.setLineWidth(0.3);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);

        y += rowH;
      });
      y += 3;
    };

    // --- SECTION 1: IDENTIFICAÇÃO & RESPONSÁVEIS ---
    // Exibir dados do usuário se os de identificação estiverem como N/A
    const solicitanteVal = (payload.solicitante && payload.solicitante.trim().toUpperCase() !== 'N/A')
      ? payload.solicitante
      : (payload.user_name || 'N/A');

    const responsaveisFields = [
      { label: 'RQS / RDM Associada', value: payload.rqs_rdm || 'N/A' },
      { label: 'Gestor Responsável', value: payload.gestor || 'N/A' },
      { label: 'Solicitante', value: solicitanteVal },
      { label: 'Desenvolvedor', value: payload.desenvolvedor || 'N/A' },
      { label: 'Matrícula', value: payload.matricula || 'N/A' },
      { label: 'Área do Processo', value: payload.area || 'N/A' },
      { label: 'Contato / Ramal', value: payload.contato || 'N/A' },
    ];

    // Desenhar cabeçalho da seção se houver algum campo válido para exibir
    const hasResponsaveis = responsaveisFields.some(f => f.value && f.value.trim().toUpperCase() !== 'N/A');
    if (hasResponsaveis) {
      drawSectionHeader('1. IDENTIFICAÇÃO DO PROCESSO E RESPONSÁVEIS');
      drawFieldsTable(responsaveisFields);
    }

    // --- SECTION 2: DADOS DO APPLICATION ---
    const applicationFields = [
      { label: 'Application Nome', value: payload.application || 'N/A' },
      { label: 'Periodicidade de Execução', value: payload.periodicidade || 'N/A' },
      { label: 'Tipo de Job / Processamento', value: payload.tipo_execucao || 'N/A' },
      { label: 'Sistema Afetado', value: payload.sistema || 'N/A' },
      { label: 'Rotina Operacional', value: payload.rotina || 'N/A' },
      { label: 'Objetivo Operacional', value: payload.objetivo || 'N/A' },
      { label: 'Quantidade de Jobs', value: String(payload.quantidade_jobs || 'N/A') },
    ];
    const hasApplication = applicationFields.some(f => f.value && f.value.trim().toUpperCase() !== 'N/A');
    if (hasApplication) {
      drawSectionHeader('2. INFORMAÇÕES DO APPLICATION E VOLUMETRIA');
      drawFieldsTable(applicationFields);
    }

    // --- SECTION 3: REGRAS DE SEQUENCIAMENTO & AGENDAMENTO ---
    const schedulingFields = [
      { label: 'Sequência dos Jobs', value: payload.sequencia_jobs || 'N/A' },
      { label: 'Ascendência (Pré-requisitos)', value: payload.ascendencia || 'N/A' },
      { label: 'Descendência (Sucessores)', value: payload.descendencia || 'N/A' },
      { label: 'Horário de Janela Permitida', value: payload.horario_permitido || 'N/A' },
      { label: 'Executa em Feriados / Finais de Semana?', value: payload.feriado_fds || 'N/A' },
      { label: 'Simultaneidade Controlada', value: payload.simultaneidade || 'N/A' },
      { label: 'Regras de Concorrência', value: payload.regras_concorrencia || 'N/A' },
    ];
    const hasScheduling = schedulingFields.some(f => f.value && f.value.trim().toUpperCase() !== 'N/A');
    if (hasScheduling) {
      drawSectionHeader('3. REGRAS DE SEQUENCIAMENTO E AGENDAMENTO');
      drawFieldsTable(schedulingFields);
    }

    // --- SECTION 4: ESPECIFICAÇÃO TÉCNICA E COMANDO ---
    const cmdStr = payload.command || 'N/A';
    if (cmdStr && cmdStr.trim().toUpperCase() !== 'N/A') {
      drawSectionHeader('4. ESPECIFICAÇÃO DO COMANDO / JOB WORKLOAD');
      const cmdLines = doc.splitTextToSize(cmdStr, contentW - 8);
      const cmdBlockH = cmdLines.length * 4.5 + 8;

      checkSpace(cmdBlockH);

      // Draw Monospace Command Block
      doc.setFillColor(15, 23, 42); // dark background
      doc.rect(margin, y, contentW, cmdBlockH, 'F');

      doc.setFont('courier', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(34, 197, 94); // emerald text
      doc.text(cmdLines, margin + 4, y + 5.5);

      y += cmdBlockH + 6;
    }

    // --- SECTION 5: ESPECIFICAÇÃO DE ARQUIVOS E TRANSFERÊNCIA ---
    const fileFields = [
      { label: 'Sentido da Operação (GET/PUT)', value: payload.operacao || 'N/A' },
      { label: 'Servidores de Origem / Destino', value: payload.servidores || 'N/A' },
      { label: 'Caminho Físico Origem/Destino', value: payload.origem_destino || 'N/A' },
      { label: 'Codificação de Caracteres', value: payload.codificacao || 'N/A' },
      { label: 'Temporalidade / Tempo de Retenção', value: payload.temporalidade || 'N/A' },
    ];
    const hasFiles = fileFields.some(f => f.value && f.value.trim().toUpperCase() !== 'N/A');
    if (hasFiles) {
      drawSectionHeader('5. ESPECIFICAÇÃO DE ARQUIVOS E TRANSFERÊNCIA');
      drawFieldsTable(fileFields);
    }

    // --- SECTION 6: RESULTADO DA VALIDAÇÃO DA NORMA ---
    const passed = String(payload.status).toLowerCase() === 'concluído';
    const errors = payload.errors || [];
    const warnings = payload.warnings || [];

    if (!passed || errors.length > 0 || warnings.length > 0) {
      drawSectionHeader('6. RESULTADOS DA VALIDAÇÃO DA NORMA N/PD/004/02');
      checkSpace(12);

      doc.setFillColor(254, 242, 242); // light red background for warning/error
      doc.rect(margin, y, contentW, 8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(220, 38, 38); // red text
      doc.text('STATUS: REJEITADO - ERROS DE VALIDAÇÃO DETECTADOS', margin + 4, y + 5);
      y += 12;

      if (errors.length > 0) {
        checkSpace(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(220, 38, 38);
        doc.text('Erros Impeditivos (Bloqueantes):', margin, y);
        y += 5;

        errors.forEach((err) => {
          const errMsg = `[${err.ruleCode || err.code || 'ERRO'}] Campo: ${err.field || ''} - ${err.message}`;
          const errLines = doc.splitTextToSize(errMsg, contentW - 6);
          const errBlockH = errLines.length * 4 + 2;
          checkSpace(errBlockH);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(220, 38, 38);
          doc.text(errLines, margin + 3, y + 3);
          y += errBlockH;
        });
        y += 2;
      }

      if (warnings.length > 0) {
        checkSpace(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(217, 119, 6);
        doc.text('Alertas / Avisos (Não Bloqueantes):', margin, y);
        y += 5;

        warnings.forEach((warn) => {
          const warnMsg = `[${warn.ruleCode || warn.code || 'AVISO'}] Campo: ${warn.field || ''} - ${warn.message}`;
          const warnLines = doc.splitTextToSize(warnMsg, contentW - 6);
          const warnBlockH = warnLines.length * 4 + 2;
          checkSpace(warnBlockH);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(217, 119, 6);
          doc.text(warnLines, margin + 3, y + 3);
          y += warnBlockH;
        });
        y += 2;
      }
    }

    // --- SECOND PASS: HEADER AND FOOTER DECORATION ---
    const totalPages = doc.getNumberOfPages();
    const dateStr = payload.created_at
      ? new Date(payload.created_at).toLocaleString('pt-BR')
      : new Date().toLocaleString('pt-BR');

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      // Top Accent Line
      doc.setFillColor(29, 78, 216); // #1d4ed8
      doc.rect(0, 0, pageW, 3, 'F');

      // Header Layout - Exibe a Logo do Sistema ou o texto fallback
      if (logoBase64) {
        doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', margin, 4, 48, 16);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.text('DATAPREV S.A.', margin, 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('Tecnologia e Informação para a Previdência', margin, 16);
      }

      // Se RQS/RDM for N/A, não exibe essa linha no cabeçalho
      const hasRqs = payload.rqs_rdm && payload.rqs_rdm.trim().toUpperCase() !== 'N/A';
      if (hasRqs) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text(`RQS/RDM: ${payload.rqs_rdm}`, pageW - margin - 45, 12);

        doc.setFont('helvetica', 'normal');
        doc.text(`Template: v${TEMPLATE_VERSION}`, pageW - margin - 45, 16);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text(`Template: v${TEMPLATE_VERSION}`, pageW - margin - 45, 16);
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(margin, 20, pageW - margin, 20);

      // Footer Layout
      doc.line(margin, pageH - 15, pageW - margin, pageH - 15);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Gerado por: ${payload.user_name} `, margin, pageH - 10);

      doc.setFont('helvetica', 'normal');
      doc.text(`Página ${i} de ${totalPages}`, pageW - margin - 20, pageH - 10);
    }

    const outputBuffer = doc.output('arraybuffer');
    return Buffer.from(outputBuffer);

  }
};
