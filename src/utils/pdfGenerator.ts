import { jsPDF } from 'jspdf';
import { getToken } from '../lib/api';

export interface ChecklistPdfDownloadResult {
  success: boolean;
  fileName?: string;
  error?: string;
}

function toSafePdfFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[\\/:*?"<>|]/g, '_') || 'checklist.pdf';
  return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
}

function toPdfText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-');
}

async function getDownloadError(response: Response): Promise<string> {
  const fallback = `O servidor retornou ${response.status} ao gerar o PDF.`;
  const contentType = response.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      const body = await response.json() as { message?: unknown; error?: unknown };
      const message = body.message ?? body.error;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }

    const text = (await response.text()).trim();
    if (text) return text.slice(0, 300);
  } catch {
    // Keep the useful HTTP status fallback when the response body is unavailable.
  }

  return fallback;
}

/**
 * Downloads a generated checklist with an anchor element. This preserves the
 * requested file name and does not depend on popup permission after an async call.
 */
export async function downloadChecklistPDF(
  checklistId: string,
  saveFileName: string,
): Promise<ChecklistPdfDownloadResult> {
  try {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const response = await fetch(`${apiBase}/checklists/${checklistId}/pdf`, { headers });
    if (!response.ok) {
      throw new Error(await getDownloadError(response));
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error('O PDF gerado está vazio. Tente novamente ou contate o suporte.');
    }

    const fileName = toSafePdfFileName(saveFileName);
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // Some browsers start the transfer lazily after click().
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 30_000);
    return { success: true, fileName };
  } catch (error) {
    console.error('downloadChecklistPDF error:', error);
    const detail = error instanceof Error && error.message
      ? error.message
      : 'Não foi possível concluir o download.';
    window.alert(`Erro ao baixar o PDF: ${detail}`);
    return { success: false, error: detail };
  }
}

/**
 * Local fallback used only when the backend is unavailable.
 */
export function createChecklistPDF(
  section1Title: string,
  fields: Array<{ label: string; value: string }>,
  jobItems: Array<{ label: string; command: string }>,
  saveFileName: string,
) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  const labelColW = 68;
  let y = 40;

  const drawPageDecorations = () => {
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(17, 24, 39);
    doc.text('DATAPREV', margin, 16);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.5);
    doc.line(margin + 44, 9, margin + 44, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text(toPdfText('Checklist de Execução de Jobs'), margin + 47, 16);
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(toPdfText('Gerado localmente pelo Agente de IA de Jobs da DATAPREV'), margin, 24);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.6);
    doc.line(0, 28, pageW, 28);
  };

  const ensureSpace = (height: number) => {
    if (y + height <= pageH - 22) return;
    doc.addPage();
    drawPageDecorations();
    y = 40;
  };

  const drawSectionHeader = (title: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(toPdfText(title), contentW - 14);
    const bandH = lines.length * 6 + 7;
    ensureSpace(bandH + 2);
    doc.setFillColor(239, 246, 255);
    doc.rect(margin, y, contentW, bandH, 'F');
    doc.setFillColor(37, 99, 235);
    doc.rect(margin, y, 3, bandH, 'F');
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.5);
    doc.line(margin, y + bandH, margin + contentW, y + bandH);
    doc.setTextColor(29, 78, 216);
    doc.text(lines, margin + 8, y + 6);
    y += bandH + 2;
  };

  drawPageDecorations();
  drawSectionHeader(`1. DADOS GERAIS (${section1Title})`);

  for (const field of fields) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const labelLines = doc.splitTextToSize(toPdfText(field.label), labelColW - 8);
    const valueLines = doc.splitTextToSize(toPdfText(field.value), contentW - labelColW - 8);
    const rowH = Math.max(labelLines.length, valueLines.length) * 5.5 + 3;
    ensureSpace(rowH);
    doc.setFillColor(249, 250, 251);
    doc.rect(margin, y, contentW, rowH, 'F');
    doc.setDrawColor(243, 244, 246);
    doc.setLineWidth(0.3);
    doc.line(margin, y + rowH, margin + contentW, y + rowH);
    doc.line(margin + labelColW, y, margin + labelColW, y + rowH);
    doc.setTextColor(107, 114, 128);
    doc.text(labelLines, margin + 5, y + 6);
    doc.setTextColor(17, 24, 39);
    doc.text(valueLines, margin + labelColW + 3, y + 6);
    y += rowH;
  }

  drawSectionHeader('2. ESPECIFICAÇÃO DO JOB (WORKLOAD)');
  for (const [index, job] of jobItems.entries()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const jobLabelLines = doc.splitTextToSize(toPdfText(job.label), contentW);
    ensureSpace(jobLabelLines.length * 5 + 10);
    doc.setTextColor(29, 78, 216);
    doc.text(jobLabelLines, margin, y + 4);
    y += jobLabelLines.length * 5 + 5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    const commandLines = doc.splitTextToSize(toPdfText(job.command), contentW - 14);
    const blockH = commandLines.length * 5.5 + 10;
    ensureSpace(blockH);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentW, blockH, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(margin, y, 3, blockH, 'F');
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.4);
    doc.rect(margin, y, contentW, blockH, 'S');
    doc.setTextColor(6, 78, 59);
    doc.text(commandLines, margin + 8, y + 7);
    y += blockH + (index < jobItems.length - 1 ? 8 : 0);
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text(toPdfText(`Data de geração: ${new Date().toLocaleString('pt-BR')}`), margin, pageH - 9);
    doc.setFont('helvetica', 'normal');
    doc.text(toPdfText(`Página ${page} de ${totalPages}`), pageW - margin - 20, pageH - 9);
  }

  doc.save(toSafePdfFileName(saveFileName));
}
