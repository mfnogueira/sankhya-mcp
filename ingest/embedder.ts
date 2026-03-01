/**
 * Gerador de embeddings locais via @huggingface/transformers.
 *
 * Usa o mesmo modelo que o servidor de runtime para garantir
 * compatibilidade dos vetores com o índice sqlite-vec.
 */

import { pipeline } from "@huggingface/transformers";
import type { Chunk } from "./chunker.js";
import type { ImageChunk } from "./image-describer.js";

const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const BATCH_SIZE = 64;

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export interface ImageChunkWithEmbedding extends ImageChunk {
  embedding: number[];
}

type AnyChunk = Chunk | ImageChunk;
type AnyChunkWithEmbedding = ChunkWithEmbedding | ImageChunkWithEmbedding;

type FeatureExtractionPipeline = Awaited<
  ReturnType<typeof pipeline<"feature-extraction">>
>;

let _model: FeatureExtractionPipeline | null = null;

async function getModel(): Promise<FeatureExtractionPipeline> {
  if (!_model) {
    process.stderr.write(`[embedder] Carregando modelo: ${MODEL_NAME}\n`);
    _model = await pipeline("feature-extraction", MODEL_NAME);
    process.stderr.write(`[embedder] Modelo carregado.\n`);
  }
  return _model;
}

export async function embedChunks(
  chunks: AnyChunk[]
): Promise<AnyChunkWithEmbedding[]> {
  if (chunks.length === 0) return [];

  const model = await getModel();
  const result: AnyChunkWithEmbedding[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);

    process.stderr.write(
      `[embedder] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${batch.length} chunks)\n`
    );

    const outputs = await model(texts, { pooling: "mean", normalize: true });
    // outputs.data é Float32Array com shape [batchSize * 384]
    const floats = outputs.data as Float32Array;
    const dim = floats.length / batch.length;

    for (let j = 0; j < batch.length; j++) {
      const embedding = Array.from(floats.slice(j * dim, (j + 1) * dim));
      result.push({ ...batch[j], embedding } as AnyChunkWithEmbedding);
    }
  }

  return result;
}
