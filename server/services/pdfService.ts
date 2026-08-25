import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

const PDF_LOGO_FILE_NAME = 'Logo_dataprev_Preferencial-01.png';
const PDF_LOGO_DATA_URI_PREFIX = 'data:image/png;base64,';

function findPdfLogoPath(): string | undefined {
  // Keep this ESM-safe. `process.cwd()` works in development and the launcher
  // location covers a compiled dist-server process started from another path.
  const launchDirectory = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : undefined;
  const projectRoots = [
    process.cwd(),
    launchDirectory ? path.resolve(launchDirectory, '..') : undefined,
    launchDirectory ? path.resolve(launchDirectory, '..', '..') : undefined,
  ].filter((root): root is string => Boolean(root));
  const candidates = [...new Set(projectRoots.map(root => path.join(root, 'public', PDF_LOGO_FILE_NAME)))];
  return candidates.find(candidate => fs.existsSync(candidate));
}

/**
 * Loads the institutional DATAPREV logo without making PDF generation depend
 * on it. When a deployment omits the static asset, the caller can render the
 * textual brand fallback instead.
 */
export function loadChecklistPdfLogo(assetPath = findPdfLogoPath()): string | undefined {
  if (!assetPath) return undefined;

  try {
    const image = fs.readFileSync(assetPath);
    return image.length > 0 ? `${PDF_LOGO_DATA_URI_PREFIX}${image.toString('base64')}` : undefined;
  } catch {
    return undefined;
  }
}

const logoDataUri = loadChecklistPdfLogo();

export type PDFValue = string | number | boolean | Date | null | undefined | PDFValue[] | { [key: string]: unknown };

export interface PDFField {
  label: string;
  value: PDFValue;
}

export type PDFFieldCollection = Record<string, unknown> | PDFField[];

/**
 * Structured representation of one job belonging to an Application checklist.
 * Known properties receive first-class labels in the PDF; `parameters`,
 * `capador`, `scheduling`, `responsibilities`, `metadata`, and any extra
 * properties are rendered as well so a new job type does not require a PDF
 * template change just to expose its collected data.
 */
export interface PDFJobPayload {
  id?: string | number;
  sequence?: string | number;
  sequencia?: string | number;
  name?: string;
  job_name?: string;
  job_type_name?: string;
  job_type_id?: string | number;
  type?: string;
  generic?: PDFValue;
  generico?: PDFValue;
  bridge?: PDFValue;
  ponte?: PDFValue;
  server?: PDFValue;
  servers?: PDFValue;
  servidor?: PDFValue;
  servidores?: PDFValue;
  command?: string;
  responsibilities?: PDFFieldCollection;
  scheduling?: PDFFieldCollection;
  parameters?: PDFFieldCollection;
  capador?: PDFFieldCollection;
  metadata?: PDFFieldCollection;
  fields?: PDFFieldCollection;
  [key: string]: unknown;
}

/**
 * PDF input supports both the original one-job flat payload and a structured
 * Application payload. The latter uses `jobs` and optional grouped metadata.
 */
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

  // Application checklist structure
  jobs?: PDFJobPayload[];
  responsibilities?: PDFFieldCollection;
  scheduling?: PDFFieldCollection;
  capador?: PDFFieldCollection;
  metadata?: PDFFieldCollection;
  application_metadata?: PDFFieldCollection;

  // Legacy flat collected data fields
  gestor?: string;
  solicitante?: string;
  desenvolvedor?: string;
  matricula?: string;
  area?: string;
  contato?: string;

  application?: PDFValue;
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

  // Transfer specifications and CAPADOR storage parameters
  origem_destino?: string;
  servidores?: string;
  operacao?: string;
  codificacao?: string;
  temporalidade?: string;
  servidor_origem?: string;
  servidor_destino?: string;
  diretorio_origem?: string;
  diretorio_destino?: string;
  capacidade_armazenamento?: string;
  permissoes_usuario?: string;

  // Validation results
  errors?: ValidationResult[];
  warnings?: ValidationResult[];
  applied_rules_snapshot?: unknown;
  applied_rules_hash?: string;

  [key: string]: unknown;
}

interface ValidationResult {
  ruleCode?: string;
  code?: string;
  field?: string;
  message?: string;
}

const UNCONFIGURED_CATALOG_WARNING = /^CATALOG-[A-Z0-9_-]+-NOT-CONFIGURED$/i;

/**
 * Catalogues not published yet are informational at checklist creation time.
 * They should not be repeated in the PDF alert section, but every other
 * warning must remain visible for the operational team.
 */
export function filterChecklistPdfWarnings(warnings: ValidationResult[] = []): ValidationResult[] {
  return warnings.filter(warning => {
    const ruleCode = warning.ruleCode || warning.code || '';
    return !UNCONFIGURED_CATALOG_WARNING.test(ruleCode);
  });
}

export const TEMPLATE_VERSION = '2.1.0';
export const SCHEMA_VERSION = '2.0';

const EMPTY_VALUE = 'N/A';

const DISPLAY_LABELS: Record<string, string> = {
  id: 'Identificador',
  name: 'Nome',
  job_name: 'Nome do Job',
  job_type_name: 'Tipo de Job',
  job_type_id: 'Identificador do Tipo',
  type: 'Tipo',
  sequence: 'Sequência',
  sequencia: 'Sequência',
  generic: 'Genérico',
  generico: 'Genérico',
  bridge: 'Ponte',
  ponte: 'Ponte',
  server: 'Servidor',
  servers: 'Servidores',
  servidor: 'Servidor',
  servidores: 'Servidores',
  servidor_origem: 'Servidor de Origem',
  servidor_destino: 'Servidor de Destino',
  diretorio_origem: 'Diretório de Origem',
  diretorio_destino: 'Diretório de Destino',
  origem_destino: 'Origem / Destino',
  periodicidade: 'Periodicidade',
  data_processamento: 'Data de Processamento',
  horario_processamento: 'Horário de Processamento',
  horario_permitido: 'Janela Permitida',
  recorrencia: 'Recorrência',
  timezone: 'Fuso Horário',
  fuso_horario: 'Fuso Horário',
  gestor: 'Gestor Responsável',
  solicitante: 'Solicitante',
  desenvolvedor: 'Desenvolvedor',
  responsavel: 'Responsável',
  responsavel_operacional: 'Responsável Operacional',
  user_name: 'Usuário Responsável',
  area: 'Área do Processo',
  contato: 'Contato / Ramal',
  application: 'Application',
  application_name: 'Application',
  sistema: 'Sistema Afetado',
  rotina: 'Rotina Operacional',
  objetivo: 'Objetivo Operacional',
  quantidade_jobs: 'Quantidade de Jobs',
  operacao: 'Operação (GET/PUT)',
  codificacao: 'Codificação de Caracteres',
  temporalidade: 'Temporalidade / Retenção',
  capacidade_armazenamento: 'Capacidade de Armazenamento',
  permissoes_usuario: 'Permissões / Usuário Proprietário',
  command: 'Comando',
};

const JOB_GROUP_KEYS = new Set([
  'id',
  'sequence',
  'sequencia',
  'name',
  'job_name',
  'job_type_name',
  'job_type_id',
  'type',
  'generic',
  'generico',
  'bridge',
  'ponte',
  'server',
  'servers',
  'servidor',
  'servidores',
  'command',
  'responsibilities',
  'scheduling',
  'parameters',
  'capador',
  'metadata',
  'fields',
]);

const DASH_CHARACTERS = /[\u2010-\u2015\u2212]/g;

function normalizePdfText(value: string): string {
  // jsPDF built-in fonts are limited to WinAnsi in this deployment. Normalizing
  // diacritics keeps Portuguese labels readable instead of rendering as '?'.
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(DASH_CHARACTERS, '-');
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && trimmed.toUpperCase() !== EMPTY_VALUE;
  }
  if (Array.isArray(value)) return value.some(hasValue);
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasValue);
  return true;
}

function valueToText(value: PDFValue): string {
  if (!hasValue(value)) return EMPTY_VALUE;

  if (value instanceof Date) {
    return normalizePdfText(value.toLocaleString('pt-BR'));
  }
  if (Array.isArray(value)) {
    return normalizePdfText(value.map((item) => valueToText(item)).filter((item) => item !== EMPTY_VALUE).join(', '));
  }
  if (typeof value === 'object') {
    return normalizePdfText(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => hasValue(nestedValue))
        .map(([key, nestedValue]) => `${humanizeKey(key)}: ${valueToText(nestedValue as PDFValue)}`)
        .join('; '),
    );
  }
  return normalizePdfText(String(value).trim());
}

function humanizeKey(key: string): string {
  if (DISPLAY_LABELS[key]) return DISPLAY_LABELS[key];
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return 'Informação';
  return normalizePdfText(spaced.charAt(0).toUpperCase() + spaced.slice(1));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || Array.isArray(value) || value instanceof Date || typeof value !== 'object') return undefined;
  return value as Record<string, unknown>;
}

function collectionToFields(collection?: PDFFieldCollection, ignoredKeys: Set<string> = new Set()): PDFField[] {
  if (!collection) return [];

  if (Array.isArray(collection)) {
    return collection
      .filter((field): field is PDFField => Boolean(field) && typeof field.label === 'string' && hasValue(field.value))
      .map((field) => ({ label: normalizePdfText(field.label), value: field.value }));
  }

  return Object.entries(collection)
    .filter(([key, value]) => !ignoredKeys.has(key) && hasValue(value))
    .flatMap(([key, value]) => {
      const nested = asRecord(value);
      if (nested) {
        const nestedFields = collectionToFields(nested);
        if (nestedFields.length > 0) {
          return nestedFields.map((field) => ({
            label: `${humanizeKey(key)} - ${field.label}`,
            value: field.value,
          }));
        }
      }
      return [{ label: humanizeKey(key), value: value as PDFValue }];
    });
}

function firstAvailable(record: Record<string, unknown>, keys: string[]): PDFValue | undefined {
  for (const key of keys) {
    if (hasValue(record[key])) return record[key] as PDFValue;
  }
  return undefined;
}

function recordFields(record: Record<string, unknown>, items: Array<{ label: string; keys: string[] }>): PDFField[] {
  return items
    .map(({ label, keys }) => ({ label, value: firstAvailable(record, keys) }))
    .filter((field) => hasValue(field.value));
}

function compactFields(fields: PDFField[]): PDFField[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (!hasValue(field.value)) return false;
    const identity = `${field.label.toLocaleLowerCase('pt-BR')}\u0000${valueToText(field.value).toLocaleLowerCase('pt-BR')}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function statusIsPassed(status: string): boolean {
  return status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase() === 'concluido';
}

export const pdfService = {
  generateChecklistPDF(payload: PDFDataPayload): Buffer {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    doc.setProperties({
      title: 'Checklist de Execução de Jobs',
      subject: `Template ${TEMPLATE_VERSION} - Schema ${SCHEMA_VERSION}`,
      author: 'DATAPREV',
      keywords: `checklist, jobs, application, template-${TEMPLATE_VERSION}, schema-${SCHEMA_VERSION}`,
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pageW - margin * 2;
    const labelW = 54;
    let y = 40;

    const checkSpace = (heightNeeded: number) => {
      if (y + heightNeeded > pageH - 22) {
        doc.addPage();
        y = 40;
      }
    };

    const drawSectionHeader = (title: string) => {
      const titleLines = doc.splitTextToSize(normalizePdfText(title.toUpperCase()), contentW - 6);
      const height = Math.max(7, titleLines.length * 4.2 + 2.5);
      checkSpace(height + 4);

      doc.setFillColor(29, 78, 216);
      doc.rect(margin, y, contentW, height, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(titleLines, margin + 3, y + 4.2);
      y += height + 2;
    };

    const drawFieldsTable = (fields: PDFField[]) => {
      const visibleFields = compactFields(fields);
      if (visibleFields.length === 0) return;

      for (const field of visibleFields) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        const labelLines = doc.splitTextToSize(normalizePdfText(field.label), labelW - 6);
        doc.setFont('helvetica', 'normal');
        const valueLines = doc.splitTextToSize(valueToText(field.value), contentW - labelW - 8);
        const rowH = Math.max(labelLines.length, valueLines.length) * 4.4 + 3;
        checkSpace(rowH);

        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentW, rowH, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.25);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);
        doc.line(margin + labelW, y, margin + labelW, y + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(labelLines, margin + 3, y + 4.4);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(valueLines, margin + labelW + 3, y + 4.4);
        y += rowH;
      }
      y += 3;
    };

    const drawCommand = (title: string, command: string) => {
      if (!hasValue(command)) return;
      drawSectionHeader(title);
      doc.setFont('courier', 'bold');
      doc.setFontSize(8);
      const commandLines = doc.splitTextToSize(normalizePdfText(command), contentW - 8);
      const commandHeight = commandLines.length * 4.5 + 8;
      checkSpace(commandHeight);
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, contentW, commandHeight, 'F');
      doc.setTextColor(34, 197, 94);
      doc.text(commandLines, margin + 4, y + 5.5);
      y += commandHeight + 5;
    };

    const drawGroupedFields = (title: string, fields: PDFField[]) => {
      if (compactFields(fields).length === 0) return;
      drawSectionHeader(title);
      drawFieldsTable(fields);
    };

    const payloadRecord = payload as Record<string, unknown>;
    const structuredResponsibilities = collectionToFields(payload.responsibilities);
    const hasStructuredRequester = structuredResponsibilities.some(
      field => normalizePdfText(field.label).toLocaleLowerCase('pt-BR') === 'solicitante'
    );
    const responsaveisFields = compactFields([
      { label: 'RQS / RDM Associada', value: payload.rqs_rdm },
      { label: 'Gestor Responsável', value: payload.gestor },
      { label: 'Solicitante', value: hasStructuredRequester ? undefined : (payload.solicitante ?? payload.user_name) },
      { label: 'Desenvolvedor', value: payload.desenvolvedor },
      { label: 'Matrícula', value: payload.matricula },
      { label: 'Área do Processo', value: payload.area },
      { label: 'Contato / Ramal', value: payload.contato },
      { label: 'Usuário Responsável', value: payload.user_name },
      ...structuredResponsibilities,
    ]);
    drawGroupedFields('1. Identificação do Processo e Responsáveis', responsaveisFields);

    const applicationRecord = asRecord(payload.application);
    const applicationFields = compactFields([
      { label: 'Application', value: typeof payload.application === 'object' ? undefined : payload.application },
      { label: 'Periodicidade de Execução', value: payload.periodicidade },
      { label: 'Tipo de Job / Processamento', value: payload.tipo_execucao },
      { label: 'Sistema Afetado', value: payload.sistema },
      { label: 'Rotina Operacional', value: payload.rotina },
      { label: 'Objetivo Operacional', value: payload.objetivo },
      { label: 'Quantidade de Jobs', value: payload.quantidade_jobs ?? payload.jobs?.length },
      ...collectionToFields(applicationRecord),
      ...collectionToFields(payload.application_metadata),
    ]);
    drawGroupedFields('2. Informações da Application', applicationFields);

    const schedulingFields = compactFields([
      { label: 'Sequência dos Jobs', value: payload.sequencia_jobs },
      { label: 'Ascendência (Pré-requisitos)', value: payload.ascendencia },
      { label: 'Descendência (Sucessores)', value: payload.descendencia },
      { label: 'Horário de Janela Permitida', value: payload.horario_permitido },
      { label: 'Executa em Feriados / Finais de Semana?', value: payload.feriado_fds },
      { label: 'Simultaneidade Controlada', value: payload.simultaneidade },
      { label: 'Regras de Concorrência', value: payload.regras_concorrencia },
      ...collectionToFields(payload.scheduling),
    ]);
    drawGroupedFields('3. Regras de Sequenciamento e Agendamento', schedulingFields);

    const jobs = payload.jobs?.filter((job): job is PDFJobPayload => Boolean(job)) ?? [];
    if (jobs.length > 0) {
      for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index];
        const jobRecord = job as Record<string, unknown>;
        const sequence = firstAvailable(jobRecord, ['sequence', 'sequencia']) ?? index + 1;
        const jobName = firstAvailable(jobRecord, ['name', 'job_name', 'job_type_name', 'type']) ?? `Job ${index + 1}`;
        drawSectionHeader(`4.${index + 1} Job ${sequence}: ${valueToText(jobName)}`);

        const summaryFields = recordFields(jobRecord, [
          { label: 'Tipo de Job', keys: ['job_type_name', 'type'] },
          { label: 'Nome do Job', keys: ['name', 'job_name'] },
          { label: 'Genérico', keys: ['generic', 'generico'] },
          { label: 'Ponte', keys: ['bridge', 'ponte'] },
          { label: 'Servidor', keys: ['server', 'servidor'] },
          { label: 'Servidores', keys: ['servers', 'servidores'] },
          { label: 'Servidor de Origem', keys: ['servidor_origem'] },
          { label: 'Servidor de Destino', keys: ['servidor_destino'] },
          { label: 'Origem / Destino', keys: ['origem_destino'] },
        ]);
        drawFieldsTable(summaryFields);

        drawGroupedFields(`4.${index + 1}.1 Responsáveis do Job`, collectionToFields(job.responsibilities));
        drawGroupedFields(`4.${index + 1}.2 Agendamento do Job`, collectionToFields(job.scheduling));
        drawGroupedFields(`4.${index + 1}.3 Parâmetros do Job`, collectionToFields(job.parameters));
        drawGroupedFields(`4.${index + 1}.4 CAPADOR e Armazenamento`, collectionToFields(job.capador));
        drawGroupedFields(`4.${index + 1}.5 Metadados do Job`, [
          ...collectionToFields(job.metadata),
          ...collectionToFields(job.fields),
          ...collectionToFields(jobRecord, JOB_GROUP_KEYS),
        ]);
        drawCommand(`4.${index + 1}.6 Comando do Job`, typeof job.command === 'string' ? job.command : '');
      }
    } else {
      drawCommand('4. Especificação do Comando / Job Workload', payload.command || '');

      const legacyStorageFields = compactFields([
        { label: 'Sentido da Operação (GET/PUT)', value: payload.operacao },
        { label: 'Servidores de Origem / Destino', value: payload.servidores },
        { label: 'Servidor de Origem', value: payload.servidor_origem },
        { label: 'Servidor de Destino', value: payload.servidor_destino },
        { label: 'Diretório / Caminho Origem', value: payload.diretorio_origem },
        { label: 'Diretório / Caminho Destino', value: payload.diretorio_destino ?? payload.origem_destino },
        { label: 'Capacidade / Volume Estimado', value: payload.capacidade_armazenamento },
        { label: 'Permissões / Usuário Proprietário', value: payload.permissoes_usuario },
        { label: 'Codificação de Caracteres', value: payload.codificacao },
        { label: 'Temporalidade / Tempo de Retenção', value: payload.temporalidade },
        ...collectionToFields(payload.capador),
      ]);
      drawGroupedFields('5. Armazenamento nos Servidores (Parâmetros CAPADOR) e Transferência', legacyStorageFields);
    }

    const topLevelMetadataIgnored = new Set([
      'id', 'rqs_rdm', 'status', 'user_name', 'created_at', 'job_type_name', 'job_type_id', 'command',
      'jobs', 'responsibilities', 'scheduling', 'capador', 'metadata', 'application_metadata',
      'gestor', 'solicitante', 'desenvolvedor', 'matricula', 'area', 'contato', 'application',
      'periodicidade', 'tipo_execucao', 'sistema', 'rotina', 'objetivo', 'quantidade_jobs',
      'sequencia_jobs', 'ascendencia', 'descendencia', 'horario_permitido', 'feriado_fds',
      'simultaneidade', 'regras_concorrencia', 'origem_destino', 'servidores', 'operacao',
      'codificacao', 'temporalidade', 'servidor_origem', 'servidor_destino', 'diretorio_origem',
      'diretorio_destino', 'capacidade_armazenamento', 'permissoes_usuario', 'errors', 'warnings',
      'applied_rules_snapshot', 'applied_rules_hash',
    ]);
    drawGroupedFields('Informações Adicionais da Application', [
      ...collectionToFields(payload.metadata),
      ...collectionToFields(payloadRecord, topLevelMetadataIgnored),
    ]);

    const errors = payload.errors ?? [];
    const warnings = filterChecklistPdfWarnings(payload.warnings ?? []);
    if (!statusIsPassed(payload.status) || errors.length > 0 || warnings.length > 0) {
      drawSectionHeader('Resultados da Validação da Norma N/PD/004/02');
      checkSpace(12);
      const hasErrors = errors.length > 0 || !statusIsPassed(payload.status);
      doc.setFillColor(hasErrors ? 254 : 255, hasErrors ? 242 : 251, hasErrors ? 242 : 235);
      doc.rect(margin, y, contentW, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(hasErrors ? 220 : 22, hasErrors ? 38 : 101, hasErrors ? 38 : 52);
      doc.text(
        normalizePdfText(hasErrors ? 'STATUS: REJEITADO - ERROS DE VALIDAÇÃO DETECTADOS' : 'STATUS: CONCLUÍDO COM ALERTAS'),
        margin + 4,
        y + 5,
      );
      y += 12;

      const drawValidationItems = (title: string, items: ValidationResult[], color: [number, number, number]) => {
        if (items.length === 0) return;
        checkSpace(8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...color);
        doc.text(normalizePdfText(title), margin, y);
        y += 5;
        for (const item of items) {
          const text = `[${item.ruleCode || item.code || 'VALIDAÇÃO'}] Campo: ${item.field || 'N/A'} - ${item.message || 'Sem detalhe informado'}`;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          const lines = doc.splitTextToSize(normalizePdfText(text), contentW - 6);
          const blockHeight = lines.length * 4 + 2;
          checkSpace(blockHeight);
          doc.setTextColor(...color);
          doc.text(lines, margin + 3, y + 3);
          y += blockHeight;
        }
        y += 2;
      };

      drawValidationItems('Erros Impeditivos (Bloqueantes):', errors, [220, 38, 38]);
      drawValidationItems('Alertas / Avisos (Não Bloqueantes):', warnings, [217, 119, 6]);
    }

    const totalPages = doc.getNumberOfPages();
    const dateStr = payload.created_at
      ? new Date(payload.created_at).toLocaleString('pt-BR')
      : new Date().toLocaleString('pt-BR');
    const headerLogoSize = 27;
    const headerTitleX = margin + headerLogoSize + 3;

    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFillColor(29, 78, 216);
      doc.rect(0, 0, pageW, 3, 'F');

      let logoDrawn = false;
      if (logoDataUri) {
        try {
          // The supplied institutional asset is square. Keep it square so the
          // brand mark is never stretched in the document header.
          doc.addImage(logoDataUri, 'PNG', margin, 3.5, headerLogoSize, headerLogoSize);
          logoDrawn = true;
        } catch {
          // An invalid optional asset must not prevent a checklist download.
          logoDrawn = false;
        }
      }

      if (!logoDrawn) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.text('DATAPREV S.A.', margin, 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(normalizePdfText(''), margin, 16);
      }

      const effectiveHeaderTitleX = logoDrawn ? headerTitleX : margin + 55;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text('CHECKLIST DE EXECUCAO DE JOBS', effectiveHeaderTitleX, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Documento operacional', effectiveHeaderTitleX, 18);

      if (hasValue(payload.rqs_rdm)) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text(`RQS/RDM: ${normalizePdfText(payload.rqs_rdm || '')}`, pageW - margin - 45, 20);
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(margin, 32, pageW - margin, 32);
      doc.line(margin, pageH - 15, pageW - margin, pageH - 15);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Gerado por: ${normalizePdfText(payload.user_name)} em ${normalizePdfText(dateStr)}`, margin, pageH - 10);
      doc.setFont('helvetica', 'normal');
      doc.text(normalizePdfText(`Página ${page} de ${totalPages}`), pageW - margin - 20, pageH - 10);
    }

    return Buffer.from(doc.output('arraybuffer'));
  },
};
