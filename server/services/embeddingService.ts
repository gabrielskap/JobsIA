import { GoogleGenAI } from '@google/genai';

/**
 * Gera um vetor de embedding hash/TF-IDF ponderado de 128 dimensões com normalização L2.
 * Usado como fallback ultra-rápido, determinístico e 100% offline.
 */
function generateDeterministicEmbedding(text: string, dimensions = 128): number[] {
  const vector = new Array(dimensions).fill(0);
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const tokens = normalized.match(/\b\w+\b/g) || [];

  if (tokens.length === 0) return vector;

  // Frequência de termos e hash n-grams
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
    }
    const bucket = Math.abs(hash) % dimensions;
    vector[bucket] += 1;

    // Character bigrams para capturar similaridade morfológica
    if (token.length > 2) {
      for (let i = 0; i < token.length - 1; i++) {
        const bigram = token.slice(i, i + 2);
        let bHash = 0;
        for (let j = 0; j < bigram.length; j++) {
          bHash = ((bHash << 5) - bHash + bigram.charCodeAt(j)) | 0;
        }
        const bBucket = Math.abs(bHash) % dimensions;
        vector[bBucket] += 0.5;
      }
    }
  }

  // Normalização L2 (norma euclidiana)
  let sumSq = 0;
  for (let i = 0; i < dimensions; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] = Number((vector[i] / norm).toFixed(6));
    }
  }

  return vector;
}

/**
 * Gera embedding para um texto utilizando o provedor configurado (Gemini ou Fallback).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (apiKey && text.trim().length > 0) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });

      const rawRes = response as any;
      const values = rawRes?.embedding?.values || rawRes?.embeddings?.[0]?.values || rawRes?.values;
      if (Array.isArray(values) && values.length > 0) {
        return values;
      }
    } catch (err) {
      console.warn('Falha na chamada da API de embeddings Gemini, usando gerador determinístico L2:', err);
    }
  }

  return generateDeterministicEmbedding(text);
}

/**
 * Calcula a similaridade de cosseno entre dois vetores.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

export interface CatalogCandidate {
  kind: 'GENERIC' | 'BRIDGE';
  code: string;
  name: string;
  description?: string;
  official_version?: string;
}

/**
 * Detecta candidatos a itens do catálogo (Genéricos e Pontes) no texto do PDF.
 */
export function extractCatalogCandidatesFromText(text: string): CatalogCandidate[] {
  const candidates: CatalogCandidate[] = [];
  const seenCodes = new Set<string>();

  // Padrões comuns em documentações técnicas da Dataprev/DIOT
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Padrões do tipo: [GENERICO] GEN-001: Nome do Genérico ou JOB TIPO 3 - Descrição
    const genericMatch = trimmed.match(/^\s*(?:\[GEN[EÉ]RICO\]|GEN[EÉ]RICO\b|\[GENERIC\]|GENERIC\b|\[JOB\s*TIPO\s*\d+\]|JOB\s*TIPO\s*\d+\b)\s*[-:]?\s*([A-Z0-9_-]+)?\s*[-:—]?\s*(.+)/i);
    if (genericMatch) {
      const rawCode = (genericMatch[1] || `GEN-${candidates.length + 1}`).toUpperCase();
      const code = rawCode.startsWith('GEN') ? rawCode : `GEN-${rawCode}`;
      const name = genericMatch[2].replace(/[;.,]+$/, '').trim();

      if (name.length > 3 && !seenCodes.has(`GENERIC:${code}`)) {
        seenCodes.add(`GENERIC:${code}`);
        candidates.push({
          kind: 'GENERIC',
          code,
          name,
          description: trimmed,
        });
      }
      continue;
    }

    // Padrões do tipo: [PONTE] PONTE-001: Nome da Ponte ou BRIDGE
    const bridgeMatch = trimmed.match(/^\s*(?:\[PONTE\]|PONTE\b|\[BRIDGE\]|BRIDGE\b)\s*[-:]?\s*([A-Z0-9_-]+)?\s*[-:—]?\s*(.+)/i);
    if (bridgeMatch) {
      const rawCode = (bridgeMatch[1] || `BRIDGE-${candidates.length + 1}`).toUpperCase();
      const code = rawCode.startsWith('PONTE') || rawCode.startsWith('BRIDGE') ? rawCode : `BRIDGE-${rawCode}`;
      const name = bridgeMatch[2].replace(/[;.,]+$/, '').trim();

      if (name.length > 3 && !seenCodes.has(`BRIDGE:${code}`)) {
        seenCodes.add(`BRIDGE:${code}`);
        candidates.push({
          kind: 'BRIDGE',
          code,
          name,
          description: trimmed,
        });
      }
    }
  }

  return candidates;
}
