import pdfParse from 'pdf-parse';

export interface ExtractedPdf {
  text: string;
  total_pages: number;
  info?: Record<string, any>;
}

export interface DocumentChunk {
  chunkIndex: number;
  pageNumber: number;
  text: string;
  tokenCount: number;
}

/**
 * Extrai texto e informações estruturadas de um buffer de arquivo PDF.
 */
export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<ExtractedPdf> {
  const data = await pdfParse(buffer);
  const cleanText = data.text ? data.text.replace(/\r\n/g, '\n').trim() : '';

  return {
    text: cleanText,
    total_pages: data.numpages || 1,
    info: data.info || {},
  };
}

/**
 * Divide o texto do documento em chunks semânticos com sobreposição (overlap).
 */
export function chunkDocumentText(
  text: string,
  totalPages = 1,
  maxChunkSize = 700,
  overlap = 100
): DocumentChunk[] {
  if (!text || text.trim().length === 0) return [];

  // Divide o texto por quebras de parágrafo duplas ou quebras de página
  const paragraphs = text.split(/\n{2,}|\f/);
  const rawSections: string[] = [];

  let currentBuffer = '';
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (currentBuffer.length + trimmed.length + 1 <= maxChunkSize) {
      currentBuffer = currentBuffer ? `${currentBuffer}\n\n${trimmed}` : trimmed;
    } else {
      if (currentBuffer) {
        rawSections.push(currentBuffer);
      }
      if (trimmed.length > maxChunkSize) {
        // Divide parágrafos longos por frases ou blocos de tamanho maxChunkSize
        let start = 0;
        while (start < trimmed.length) {
          const end = Math.min(start + maxChunkSize, trimmed.length);
          rawSections.push(trimmed.slice(start, end));
          start += (maxChunkSize - overlap);
        }
        currentBuffer = '';
      } else {
        currentBuffer = trimmed;
      }
    }
  }

  if (currentBuffer) {
    rawSections.push(currentBuffer);
  }

  // Gera os chunks com índices e cálculo estimado de página
  const chunks: DocumentChunk[] = rawSections.map((section, index) => {
    // Estimativa de página baseada na proporção do texto
    const progress = rawSections.length > 1 ? index / (rawSections.length - 1) : 0;
    const pageNumber = Math.min(Math.max(1, Math.round(progress * (totalPages - 1)) + 1), totalPages);
    const tokenCount = Math.ceil(section.split(/\s+/).length * 1.3);

    return {
      chunkIndex: index + 1,
      pageNumber,
      text: section.trim(),
      tokenCount,
    };
  });

  return chunks;
}
