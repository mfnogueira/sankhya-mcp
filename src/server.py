"""
Servidor MCP para documentação do Sankhya — transporte STDIO.

IMPORTANTE: nunca usar print() — corrompe o protocolo JSON-RPC.
Todo output de log vai para sys.stderr.
"""

import logging
import sqlite3
import struct
import sys
from pathlib import Path

import sqlite_vec
from fastembed import TextEmbedding
from mcp.server.fastmcp import FastMCP

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Constantes ───────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent.parent / "data" / "index.db"
MODEL_NAME = "intfloat/multilingual-e5-small"
EMBEDDING_DIM = 384

# ── Modelo de embedding (carregado sob demanda) ───────────────────────────────
_model: TextEmbedding | None = None


def _get_model() -> TextEmbedding:
    global _model
    if _model is None:
        logger.info(f"Carregando modelo de embedding: {MODEL_NAME}")
        _model = TextEmbedding(model_name=MODEL_NAME)
        logger.info("Modelo carregado.")
    return _model


def _embed_query(text: str) -> bytes:
    """Gera o embedding da query e serializa para bytes (formato sqlite-vec)."""
    model = _get_model()
    vectors = list(model.embed([text]))
    vec = vectors[0].tolist()
    return struct.pack(f"{len(vec)}f", *vec)


def _get_db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.enable_load_extension(True)
    sqlite_vec.load(con)
    con.enable_load_extension(False)
    return con


# ── FastMCP ───────────────────────────────────────────────────────────────────
mcp = FastMCP("sankhya-docs")


@mcp.tool()
def search_docs(query: str, collection: str | None = None, top_k: int = 5) -> str:
    """Busca documentação do Sankhya ERP com base em uma query semântica.

    Use esta ferramenta quando o usuário perguntar sobre funcionalidades,
    configurações, erros, fluxos de trabalho ou qualquer aspecto do sistema
    Sankhya. Retorna os trechos de documentação mais relevantes.

    Args:
        query: Pergunta ou termo a buscar (em português ou inglês).
        collection: Nome da coleção para filtrar resultados (opcional).
                    Use list_collections() para ver as coleções disponíveis.
        top_k: Número de resultados a retornar (padrão: 5).
    """
    if not DB_PATH.exists():
        return "Índice de documentação não encontrado. Execute o pipeline de ingestão primeiro."

    logger.info(f"search_docs: query='{query}' collection={collection!r} top_k={top_k}")

    try:
        query_vec = _embed_query(query)
    except Exception as exc:
        logger.error(f"Erro ao gerar embedding: {exc}")
        return f"Erro ao processar a query: {exc}"

    try:
        con = _get_db()

        # Busca os k mais próximos (ampliado para filtrar por coleção depois)
        candidates = top_k * 10 if collection else top_k

        rows = con.execute(
            """
            SELECT c.text, c.source_file, c.collection, c.type, e.distance
            FROM (
                SELECT rowid, distance
                FROM embeddings
                WHERE embedding MATCH ?
                  AND k = ?
                ORDER BY distance
            ) e
            JOIN chunks c ON c.id = e.rowid
            """,
            (query_vec, candidates),
        ).fetchall()

        con.close()
    except Exception as exc:
        logger.error(f"Erro na consulta ao índice: {exc}")
        return f"Erro ao consultar o índice: {exc}"

    # Filtra por coleção se solicitado
    if collection:
        rows = [r for r in rows if r[2] == collection]

    rows = rows[:top_k]

    if not rows:
        msg = f"Nenhum resultado encontrado para '{query}'"
        if collection:
            msg += f" na coleção '{collection}'"
        return msg

    # Formata a resposta
    parts: list[str] = [f"## Resultados para: {query}\n"]

    for i, (text, source_file, coll, doc_type, distance) in enumerate(rows, 1):
        similarity = round((1 - distance) * 100, 1)
        type_label = "📷 Imagem" if doc_type == "image_description" else "📄 Documento"
        parts.append(
            f"### [{i}] {source_file} — {coll} ({type_label}, {similarity}% relevância)\n\n{text}"
        )

    return "\n\n---\n\n".join(parts)


@mcp.tool()
def list_collections() -> str:
    """Lista todas as coleções de documentação do Sankhya disponíveis no índice.

    Use esta ferramenta antes de search_docs quando quiser restringir a busca
    a uma área específica do sistema, ou para dar ao usuário uma visão geral
    do que está documentado.
    """
    if not DB_PATH.exists():
        return "Índice de documentação não encontrado. Execute o pipeline de ingestão primeiro."

    try:
        con = sqlite3.connect(DB_PATH)
        rows = con.execute(
            "SELECT collection, COUNT(*) as total FROM chunks GROUP BY collection ORDER BY collection"
        ).fetchall()
        con.close()
    except Exception as exc:
        logger.error(f"Erro ao consultar coleções: {exc}")
        return f"Erro ao consultar o índice: {exc}"

    if not rows:
        return "Índice vazio — nenhuma coleção encontrada."

    total_chunks = sum(r[1] for r in rows)
    lines = ["## Coleções de documentação disponíveis\n"]

    for collection, count in rows:
        lines.append(f"- **{collection}** — {count} trechos indexados")

    lines.append(f"\n_Total: {total_chunks} trechos em {len(rows)} coleções._")

    return "\n".join(lines)


# ── Entry point ───────────────────────────────────────────────────────────────
def main() -> None:
    logger.info(f"Iniciando servidor sankhya-docs (DB: {DB_PATH})")
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
