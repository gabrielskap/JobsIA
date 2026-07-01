import { jsPDF } from 'jspdf';
import { getToken } from '../lib/api';

/**
 * Faz o download do PDF do checklist gerado de forma robusta no backend.
 */
export async function downloadChecklistPDF(checklistId: string, saveFileName: string) {
  try {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const res = await fetch(`${apiBase}/checklists/${checklistId}/pdf`, {
      headers,
    });
    
    if (!res.ok) {
      throw new Error('Falha ao baixar PDF do backend');
    }
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Revoga a URL após 10 segundos para dar tempo do navegador carregar
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 10000);
  } catch (error) {
    console.error('downloadChecklistPDF erro:', error);
    alert('Erro ao abrir o PDF do backend.');
  }
}

/**
 * Fallback local caso o backend não esteja acessível.
 */
export function createChecklistPDF(
  section1Title: string,
  fields: Array<{ label: string; value: string }>,
  jobItems: Array<{ label: string; command: string }>,
  saveFileName: string
) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  const labelColW = 68;

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
  doc.text('Checklist de Execucao de Jobs', margin + 47, 16);

  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text('Gerado automaticamente pelo Agente de IA de Jobs da DATAPREV (Fallback Local)', margin, 24);

  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.6);
  doc.line(0, 28, pageW, 28);

  let y = 40;

  const drawSectionHeader = (title: string, startY: number): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(title, contentW - 14);
    const bandH = lines.length * 6 + 7;

    doc.setFillColor(239, 246, 255);
    doc.rect(margin, startY, contentW, bandH, 'F');
    doc.setFillColor(37, 99, 235);
    doc.rect(margin, startY, 3, bandH, 'F');
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.5);
    doc.line(margin, startY + bandH, margin + contentW, startY + bandH);
    doc.setTextColor(29, 78, 216);
    doc.text(lines, margin + 8, startY + 6 + (lines.length > 1 ? 1 : 0));
    return startY + bandH;
  };

  y = drawSectionHeader(`1. DADOS GERAIS (${section1Title})`, y) + 2;

  const rowH = 9;
  const fieldsStartY = y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  fields.forEach((field, i) => {
    const valueLines = doc.splitTextToSize(field.value, contentW - labelColW - 8);
    const thisRowH = rowH * Math.max(1, valueLines.length);

    if (i % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y, contentW, thisRowH, 'F');
    }
    doc.setDrawColor(243, 244, 246);
    doc.setLineWidth(0.3);
    doc.line(margin, y + thisRowH, margin + contentW, y + thisRowH);

    doc.setTextColor(107, 114, 128);
    doc.text(field.label, margin + 5, y + 6);
    doc.setTextColor(17, 24, 39);
    doc.text(valueLines, margin + labelColW, y + 6);
    y += thisRowH;
  });

  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.4);
  doc.rect(margin, fieldsStartY, contentW, y - fieldsStartY, 'S');
  y += 10;

  y = drawSectionHeader('2. ESPECIFICACAO DO JOB (WORKLOAD)', y) + 6;

  jobItems.forEach((job, idx) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(29, 78, 216);
    doc.text(job.label, margin, y);
    y += 8;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    const cmdLines = doc.splitTextToSize(job.command, contentW - 14);
    const lineH = 5.5;
    const blockH = cmdLines.length * lineH + 10;

    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentW, blockH, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(margin, y, 3, blockH, 'F');
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.4);
    doc.rect(margin, y, contentW, blockH, 'S');
    doc.setTextColor(6, 78, 59);
    doc.text(cmdLines, margin + 8, y + 7);
    y += blockH + (idx < jobItems.length - 1 ? 12 : 0);
  });

  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(`Data de geracao: ${new Date().toLocaleString('pt-BR')}`, margin, pageH - 9);

  doc.save(saveFileName);
}
