import logging
import sqlite3
import struct
from pathlib import Path

import sqlite_vec

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "src" / "data" / "index.db"
EMBEDDING_DIM = 384  # paraphrase-multilingual-MiniLM-L12-v2


def _serialize(embedding: list[float]) -> bytes:
    return struct.pack(f"{len(embedding)}f", *embedding)


def build_index(chunks: list[dict]) -> None:
    """
    Constrói (ou reconstrói do zero) o índice vetorial em data/index.db.

    Recebe lista de chunks já com campo 'embedding: list[float]'.
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Remove o banco anterior para rebuild completo
    if DB_PATH.exists():
        DB_PATH.unlink()
        logger.info("Índice anterior removido.")

    con = sqlite3.connect(DB_PATH)
    con.enable_load_extension(True)
    sqlite_vec.load(con)
    con.enable_load_extension(False)

    con.executescript(f"""
        CREATE TABLE chunks (
            id          INTEGER PRIMARY KEY,
            text        TEXT    NOT NULL,
            source_file TEXT    NOT NULL,
            collection  TEXT    NOT NULL,
            chunk_index INTEGER NOT NULL,
            type        TEXT    NOT NULL
        );

        CREATE VIRTUAL TABLE embeddings USING vec0(
            embedding FLOAT[{EMBEDDING_DIM}]
        );
    """)

    logger.info(f"Inserindo {len(chunks)} chunks no índice...")

    for chunk in chunks:
        cur = con.execute(
            """
            INSERT INTO chunks (text, source_file, collection, chunk_index, type)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                chunk["text"],
                chunk["source_file"],
                chunk["collection"],
                chunk["chunk_index"],
                chunk["type"],
            ),
        )
        row_id = cur.lastrowid

        con.execute(
            "INSERT INTO embeddings (rowid, embedding) VALUES (?, ?)",
            (row_id, _serialize(chunk["embedding"])),
        )

    con.commit()
    con.close()

    logger.info(f"Índice salvo em: {DB_PATH}")


def index_stats() -> list[dict]:
    """Retorna estatísticas do índice atual por coleção."""
    if not DB_PATH.exists():
        return []

    con = sqlite3.connect(DB_PATH)
    rows = con.execute(
        "SELECT collection, COUNT(*) as total FROM chunks GROUP BY collection ORDER BY collection"
    ).fetchall()
    con.close()

    return [{"collection": row[0], "total": row[1]} for row in rows]
