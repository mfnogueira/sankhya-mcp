import logging
from typing import Generator

from fastembed import TextEmbedding

logger = logging.getLogger(__name__)

MODEL_NAME = "intfloat/multilingual-e5-small"
BATCH_SIZE = 100

_model: TextEmbedding | None = None


def _get_model() -> TextEmbedding:
    global _model
    if _model is None:
        logger.info(f"Carregando modelo de embedding: {MODEL_NAME}")
        _model = TextEmbedding(model_name=MODEL_NAME)
        logger.info("Modelo carregado.")
    return _model


def _batches(lst: list, size: int) -> Generator[list, None, None]:
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def embed_chunks(chunks: list[dict]) -> list[dict]:
    """
    Gera embeddings para cada chunk usando fastembed (multilingual-e5-small, 384 dims).

    Recebe lista de dicts com campo 'text'.
    Retorna a mesma lista com campo 'embedding: list[float]' adicionado.
    """
    if not chunks:
        return []

    model = _get_model()
    result = list(chunks)  # cópia para não mutar o input

    total = len(result)
    logger.info(f"Gerando embeddings para {total} chunks em batches de {BATCH_SIZE}...")

    processed = 0
    for batch in _batches(result, BATCH_SIZE):
        texts = [c["text"] for c in batch]
        embeddings = list(model.embed(texts))

        for chunk, embedding in zip(batch, embeddings):
            chunk["embedding"] = embedding.tolist()

        processed += len(batch)
        logger.info(f"  {processed}/{total} chunks processados")

    return result
