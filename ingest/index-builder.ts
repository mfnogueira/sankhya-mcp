/**
 * Constrói (ou reconstrói) o índice sqlite-vec a partir dos chunks com embeddings.
 */

import fs from "fs";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";
import { fileURLToPath } from "url";
import type { ChunkWithEmbedding, ImageChunkWithEmbedding } from "./embedder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "src", "data", "index.db");

type AnyChunkWithEmbedding = ChunkWithEmbedding | ImageChunkWithEmbedding;

function toFloat32Buffer(embedding: number[]): Buffer {
  const buf = Buffer.allocUnsafe(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buf.writeFloatLE(embedding[i], i * 4);
  }
  return buf;
}

export function buildIndex(chunks: AnyChunkWithEmbedding[]): void {
  if (chunks.length === 0) {
    process.stderr.write("[index-builder] Nenhum chunk para indexar.\n");
    return;
  }

  const dim = chunks[0].embedding.length;
  process.stderr.write(
    `[index-builder] Construindo índice: ${chunks.length} chunks, dim=${dim}\n`
  );

  // Garante que o diretório existe
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  sqliteVec.load(db);

  // Rebuild completo — garante consistência
  db.exec(`
    DROP TABLE IF EXISTS embeddings;
    DROP TABLE IF EXISTS chunks;

    CREATE TABLE chunks (
      id           INTEGER PRIMARY KEY,
      text         TEXT NOT NULL,
      source_file  TEXT NOT NULL,
      collection   TEXT NOT NULL,
      chunk_index  INTEGER NOT NULL,
      type         TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE embeddings USING vec0(
      embedding FLOAT[${dim}]
    );
  `);

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, text, source_file, collection, chunk_index, type)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertEmbedding = db.prepare(`
    INSERT INTO embeddings (rowid, embedding)
    VALUES (?, ?)
  `);

  const insertAll = db.transaction((items: AnyChunkWithEmbedding[]) => {
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      const id = i + 1;
      insertChunk.run(id, c.text, c.sourceFile, c.collection, c.chunkIndex, c.type);
      insertEmbedding.run(id, toFloat32Buffer(c.embedding));
    }
  });

  insertAll(chunks);
  db.close();

  // Estatísticas por coleção
  const statsDb = new Database(DB_PATH, { readonly: true });
  const stats = statsDb
    .prepare(
      "SELECT collection, type, COUNT(*) as total FROM chunks GROUP BY collection, type ORDER BY collection"
    )
    .all() as Array<{ collection: string; type: string; total: number }>;
  statsDb.close();

  process.stderr.write("\n[index-builder] Índice construído:\n");
  let totalChunks = 0;
  for (const { collection, type, total } of stats) {
    process.stderr.write(`  ${collection} / ${type}: ${total} chunks\n`);
    totalChunks += total;
  }
  process.stderr.write(`  TOTAL: ${totalChunks} chunks\n`);
  process.stderr.write(`[index-builder] DB salvo em: ${DB_PATH}\n`);
}
