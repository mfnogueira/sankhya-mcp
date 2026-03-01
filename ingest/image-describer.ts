/**
 * Descreve imagens (prints de tela) usando GPT-4o Vision.
 * Requer OPENAI_API_KEY no ambiente.
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";

export interface ImageChunk {
  text: string;
  sourceFile: string;
  collection: string;
  chunkIndex: 0;
  type: "image_description";
}

const VISION_PROMPT = `Você está analisando um print de tela de um sistema de software (Sankhya ERP).
Descreva detalhadamente o que está visível: elementos de interface, botões, menus,
campos de formulário, dados exibidos, mensagens de erro (se houver) e o contexto
geral da tela. Seja específico e técnico — a descrição será usada para busca semântica.`;

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY não definida no ambiente.");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export async function describeImage(filepath: string): Promise<ImageChunk> {
  const ext = path.extname(filepath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };

  const mime = mimeMap[ext];
  if (!mime) throw new Error(`Formato de imagem não suportado: ${ext}`);

  const imageData = fs.readFileSync(filepath);
  const base64 = imageData.toString("base64");

  const client = getClient();
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${base64}`, detail: "high" },
          },
        ],
      },
    ],
    max_tokens: 1024,
  });

  const text = response.choices[0]?.message?.content ?? "";
  if (!text) throw new Error(`GPT-4o não retornou descrição para ${filepath}`);

  return {
    text,
    sourceFile: path.basename(filepath),
    collection: path.basename(path.dirname(path.dirname(filepath))), // docs/<colecao>/images/img.png
    chunkIndex: 0,
    type: "image_description",
  };
}
