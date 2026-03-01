/**
 * Servidor MCP para documentação do Sankhya — transporte STDIO.
 *
 * IMPORTANTE: nunca usar console.log() — corrompe o protocolo JSON-RPC.
 * Todo output de log vai para process.stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { pipeline } from "@huggingface/transformers";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";

// ── Constantes ────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Funciona tanto em dev (tsx src/server.ts → __dirname = src/)
// quanto em prod (node dist/server.js → __dirname = dist/)
// O index.db fica sempre em src/data/index.db
const DB_PATH = path.join(__dirname, "..", "src", "data", "index.db");

const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

// ── Logging ───────────────────────────────────────────────────────────────────
const log = (msg: string) => process.stderr.write(`[sankhya-mcp] ${msg}\n`);

// ── Modelo de embedding (lazy load) ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _model: any = null;

async function getModel() {
  if (!_model) {
    log(`Carregando modelo: ${MODEL_NAME}`);
    // A tipagem genérica do pipeline é muito complexa; usamos any para evitar
    // union type explosion no compilador TypeScript.
    _model = await (pipeline as Function)("feature-extraction", MODEL_NAME);
    log("Modelo carregado.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return _model;
}

async function embedQuery(text: string): Promise<Buffer> {
  const model = await getModel();
  const output = await model(text, { pooling: "mean", normalize: true });
  // output.data é Float32Array com 384 dimensões
  const floats = output.data as Float32Array;
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
}

// ── SQLite ────────────────────────────────────────────────────────────────────
function getDb(): Database.Database {
  const db = new Database(DB_PATH, { readonly: true });
  sqliteVec.load(db);
  return db;
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "sankhya-docs",
  version: "0.1.0",
});

server.tool(
  "search_docs",
  `Busca documentação do Sankhya ERP com base em uma query semântica.
Use esta ferramenta quando o usuário perguntar sobre funcionalidades,
configurações, erros, fluxos de trabalho ou qualquer aspecto do sistema
Sankhya. Retorna os trechos de documentação mais relevantes.`,
  {
    query: z
      .string()
      .describe("Pergunta ou termo a buscar (português ou inglês)"),
    collection: z
      .string()
      .optional()
      .describe(
        "Nome da coleção para filtrar resultados. Use list_collections() para ver as opções."
      ),
    top_k: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("Número de resultados a retornar (padrão: 5)"),
  },
  async ({ query, collection, top_k }) => {
    log(
      `search_docs: query="${query}" collection=${collection ?? "all"} top_k=${top_k}`
    );

    let queryVec: Buffer;
    try {
      queryVec = await embedQuery(query);
    } catch (err) {
      return {
        content: [{ type: "text", text: `Erro ao gerar embedding: ${err}` }],
      };
    }

    try {
      const db = getDb();
      const candidates = collection ? top_k * 10 : top_k;

      const rows = db
        .prepare(
          `SELECT c.text, c.source_file, c.collection, c.type, e.distance
           FROM (
             SELECT rowid, distance
             FROM embeddings
             WHERE embedding MATCH ?
               AND k = ?
             ORDER BY distance
           ) e
           JOIN chunks c ON c.id = e.rowid`
        )
        .all(queryVec, candidates) as Array<{
        text: string;
        source_file: string;
        collection: string;
        type: string;
        distance: number;
      }>;

      db.close();

      const filtered = collection
        ? rows.filter((r) => r.collection === collection).slice(0, top_k)
        : rows;

      if (filtered.length === 0) {
        const msg = collection
          ? `Nenhum resultado para "${query}" na coleção "${collection}".`
          : `Nenhum resultado encontrado para "${query}".`;
        return { content: [{ type: "text", text: msg }] };
      }

      const parts = [`## Resultados para: ${query}\n`];
      for (let i = 0; i < filtered.length; i++) {
        const { text, source_file, collection: coll, type, distance } =
          filtered[i];
        const similarity = ((1 - distance) * 100).toFixed(1);
        const label = type === "image_description" ? "Imagem" : "Documento";
        parts.push(
          `### [${i + 1}] ${source_file} — ${coll} (${label}, ${similarity}% relevância)\n\n${text}`
        );
      }

      return {
        content: [{ type: "text", text: parts.join("\n\n---\n\n") }],
      };
    } catch (err) {
      log(`Erro na consulta: ${err}`);
      return {
        content: [{ type: "text", text: `Erro ao consultar o índice: ${err}` }],
      };
    }
  }
);

server.tool(
  "list_collections",
  `Lista todas as coleções de documentação do Sankhya disponíveis no índice.
Use antes de search_docs quando quiser restringir a busca a uma área específica,
ou para dar ao usuário uma visão geral do que está documentado.`,
  {},
  async () => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          "SELECT collection, COUNT(*) as total FROM chunks GROUP BY collection ORDER BY collection"
        )
        .all() as Array<{ collection: string; total: number }>;
      db.close();

      if (rows.length === 0) {
        return {
          content: [
            { type: "text", text: "Índice vazio — nenhuma coleção encontrada." },
          ],
        };
      }

      const totalChunks = rows.reduce((sum, r) => sum + r.total, 0);
      const lines = ["## Coleções de documentação disponíveis\n"];
      for (const { collection, total } of rows) {
        lines.push(`- **${collection}** — ${total} trechos indexados`);
      }
      lines.push(`\n_Total: ${totalChunks} trechos em ${rows.length} coleções._`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      log(`Erro ao listar coleções: ${err}`);
      return {
        content: [{ type: "text", text: `Erro ao consultar o índice: ${err}` }],
      };
    }
  }
);

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  log(`Iniciando sankhya-docs (DB: ${DB_PATH})`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
