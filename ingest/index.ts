/**
 * Pipeline de ingestão — CLI principal.
 *
 * Uso:
 *   npm run ingest                         # rebuild completo
 *   npm run ingest -- --collection nome    # rebuild de uma coleção
 *   npm run ingest -- --stats             # exibe estatísticas do índice atual
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { chunkMarkdown } from "./chunker.js";
import { describeImage } from "./image-describer.js";
import { embedChunks } from "./embedder.js";
import { buildIndex } from "./index-builder.js";
import Database from "better-sqlite3";

// Carrega .env da raiz do projeto
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const DOCS_PATH = process.env.DOCS_PATH ?? path.join(__dirname, "..", "docs");
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE ?? "500", 10);
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP ?? "50", 10);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const collectionFilter = args.includes("--collection")
  ? args[args.indexOf("--collection") + 1]
  : null;
const statsOnly = args.includes("--stats");

// ── Stats ─────────────────────────────────────────────────────────────────────
function showStats() {
  const dbPath = path.join(__dirname, "..", "src", "data", "index.db");
  if (!fs.existsSync(dbPath)) {
    console.error("Índice não encontrado. Execute npm run ingest primeiro.");
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare(
      "SELECT collection, type, COUNT(*) as total FROM chunks GROUP BY collection, type ORDER BY collection"
    )
    .all() as Array<{ collection: string; type: string; total: number }>;
  const totalChunks = (
    db.prepare("SELECT COUNT(*) as n FROM chunks").get() as { n: number }
  ).n;
  db.close();

  console.log("\n=== Estatísticas do índice ===");
  for (const { collection, type, total } of rows) {
    console.log(`  ${collection.padEnd(30)} ${type.padEnd(20)} ${total} chunks`);
  }
  console.log(`  ${"TOTAL".padEnd(51)} ${totalChunks} chunks`);
}

// ── Coleta de arquivos ────────────────────────────────────────────────────────
function collectFiles(docsPath: string): {
  markdowns: string[];
  images: string[];
} {
  const markdowns: string[] = [];
  const images: string[] = [];

  if (!fs.existsSync(docsPath)) {
    console.error(`DOCS_PATH não encontrado: ${docsPath}`);
    process.exit(1);
  }

  const collections = fs
    .readdirSync(docsPath, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const collection of collections) {
    if (collectionFilter && collection !== collectionFilter) continue;

    const collPath = path.join(docsPath, collection);
    const entries = fs.readdirSync(collPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(collPath, entry.name);
      if (entry.isFile() && entry.name.endsWith(".md")) {
        markdowns.push(fullPath);
      } else if (entry.isDirectory() && entry.name === "images") {
        const imgs = fs
          .readdirSync(fullPath)
          .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
          .map((f) => path.join(fullPath, f));
        images.push(...imgs);
      }
    }
  }

  return { markdowns, images };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (statsOnly) {
    showStats();
    return;
  }

  const startTime = Date.now();
  console.log(`\n=== Pipeline de ingestão ===`);
  console.log(`DOCS_PATH: ${DOCS_PATH}`);
  if (collectionFilter) console.log(`Coleção: ${collectionFilter}`);
  console.log();

  const { markdowns, images } = collectFiles(DOCS_PATH);
  console.log(
    `Arquivos encontrados: ${markdowns.length} markdowns, ${images.length} imagens\n`
  );

  // ── Processa markdowns ────────────────────────────────────────────────────
  const allChunks = [];

  for (const mdPath of markdowns) {
    const rel = path.relative(DOCS_PATH, mdPath);
    process.stderr.write(`[ingest] Chunking: ${rel}\n`);
    const chunks = chunkMarkdown(mdPath, CHUNK_SIZE, CHUNK_OVERLAP);
    process.stderr.write(`[ingest]   → ${chunks.length} chunks\n`);
    allChunks.push(...chunks);
  }

  // ── Processa imagens ──────────────────────────────────────────────────────
  for (const imgPath of images) {
    const rel = path.relative(DOCS_PATH, imgPath);
    process.stderr.write(`[ingest] Descrevendo imagem: ${rel}\n`);
    try {
      const chunk = await describeImage(imgPath);
      allChunks.push(chunk);
      process.stderr.write(`[ingest]   → descrição gerada (${chunk.text.length} chars)\n`);
    } catch (err) {
      process.stderr.write(`[ingest]   ⚠ Erro ao descrever imagem: ${err}\n`);
    }
  }

  if (allChunks.length === 0) {
    console.error("Nenhum chunk gerado. Verifique o DOCS_PATH e os arquivos.");
    process.exit(1);
  }

  console.log(`\nTotal de chunks antes do embedding: ${allChunks.length}`);

  // ── Gera embeddings ───────────────────────────────────────────────────────
  const chunksWithEmbeddings = await embedChunks(allChunks);

  // ── Constrói índice ───────────────────────────────────────────────────────
  buildIndex(chunksWithEmbeddings);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Ingestão concluída em ${elapsed}s`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
