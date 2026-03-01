/**
 * Chunker de documentos Markdown.
 *
 * Divide um arquivo .md em chunks semânticos respeitando o tamanho máximo
 * em palavras (aproximação de tokens) e preservando contexto de seção.
 */

import fs from "fs";
import path from "path";

export interface Chunk {
  text: string;
  sourceFile: string;
  collection: string;
  chunkIndex: number;
  type: "markdown";
}

// 1 palavra ≈ 1.3 tokens — estimativa suficiente para chunking
const WORDS_PER_TOKEN = 1.3;

function countTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * WORDS_PER_TOKEN);
}

/**
 * Extrai o último header (# / ## / ###) visto antes de um trecho,
 * para ser prefixado no próximo chunk e manter contexto.
 */
function extractLastHeader(text: string): string {
  const lines = text.split("\n");
  let lastHeader = "";
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) lastHeader = line;
  }
  return lastHeader;
}

export function chunkMarkdown(
  filepath: string,
  chunkSize = 500,
  chunkOverlap = 50
): Chunk[] {
  const content = fs.readFileSync(filepath, "utf-8");
  const sourceFile = path.basename(filepath);
  const collection = path.basename(path.dirname(filepath));

  // Divide em parágrafos (blocos separados por linha em branco)
  const paragraphs = content.split(/\n\n+/);

  const chunks: Chunk[] = [];
  let currentParts: string[] = [];
  let currentTokens = 0;
  let lastHeader = "";
  let chunkIndex = 0;

  const flush = () => {
    if (currentParts.length === 0) return;
    const text = currentParts.join("\n\n").trim();
    if (text) {
      chunks.push({ text, sourceFile, collection, chunkIndex, type: "markdown" });
      chunkIndex++;
    }
  };

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Rastreia o último header para contexto
    if (/^#{1,3}\s/.test(trimmed)) lastHeader = trimmed;

    const paraTokens = countTokens(trimmed);

    // Se o parágrafo sozinho ultrapassa o limite, divide por linhas
    if (paraTokens > chunkSize) {
      flush();
      currentParts = [];
      currentTokens = 0;

      const lines = trimmed.split("\n");
      for (const line of lines) {
        const lineTokens = countTokens(line);
        if (currentTokens + lineTokens > chunkSize && currentParts.length > 0) {
          flush();
          // Começa próximo chunk com o header de contexto se existir
          currentParts = lastHeader ? [lastHeader] : [];
          currentTokens = lastHeader ? countTokens(lastHeader) : 0;
          chunkIndex++;
        }
        currentParts.push(line);
        currentTokens += lineTokens;
      }
      continue;
    }

    // Flush se adicionar este parágrafo ultrapassaria o limite
    if (currentTokens + paraTokens > chunkSize && currentParts.length > 0) {
      flush();
      // Overlap: mantém o header de contexto no próximo chunk
      currentParts = lastHeader ? [lastHeader] : [];
      currentTokens = lastHeader ? countTokens(lastHeader) : 0;
    }

    currentParts.push(trimmed);
    currentTokens += paraTokens;
  }

  flush();
  return chunks;
}
