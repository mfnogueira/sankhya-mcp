"""
Pipeline de ingestão — uso exclusivo do mantenedor.

Uso:
    python ingest/ingest.py                        # rebuild completo
    python ingest/ingest.py --collection dashboards-html5  # só uma coleção
    python ingest/ingest.py --stats                # estatísticas do índice atual
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path

# Garante que o root do projeto está no path ao rodar como script direto
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

DOCS_PATH = Path(os.getenv("DOCS_PATH", "./docs"))
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def _collect_files(collection_filter: str | None) -> tuple[list[Path], list[Path]]:
    """Retorna (markdowns, imagens) a processar."""
    markdowns: list[Path] = []
    images: list[Path] = []

    for collection_dir in sorted(DOCS_PATH.iterdir()):
        if not collection_dir.is_dir():
            continue
        if collection_filter and collection_dir.name != collection_filter:
            continue

        for md in sorted(collection_dir.glob("*.md")):
            markdowns.append(md)

        images_dir = collection_dir / "images"
        if images_dir.exists():
            for img in sorted(images_dir.iterdir()):
                if img.suffix.lower() in IMAGE_EXTENSIONS:
                    images.append(img)

    return markdowns, images


def _run_ingest(collection_filter: str | None) -> None:
    from ingest.chunker import chunk_markdown
    from ingest.embedder import embed_chunks
    from ingest.image_describer import describe_image
    from ingest.index_builder import build_index, index_stats

    start = time.perf_counter()

    markdowns, images = _collect_files(collection_filter)

    if not markdowns and not images:
        logger.error(f"Nenhum arquivo encontrado em '{DOCS_PATH}'.")
        sys.exit(1)

    logger.info(f"Arquivos encontrados: {len(markdowns)} markdowns, {len(images)} imagens")

    all_chunks: list[dict] = []

    # ── Markdowns ────────────────────────────────────────────────────────────
    for md in markdowns:
        logger.info(f"  [md] {md.parent.name}/{md.name}")
        chunks = chunk_markdown(md)
        logger.info(f"       → {len(chunks)} chunks")
        all_chunks.extend(chunks)

    # ── Imagens ──────────────────────────────────────────────────────────────
    for img in images:
        logger.info(f"  [img] {img.parent.parent.name}/{img.name}")
        try:
            chunk = describe_image(img)
            all_chunks.append(chunk)
            logger.info(f"        → descrição gerada ({len(chunk['text'])} chars)")
        except Exception as exc:
            logger.warning(f"        ✗ Falha ao descrever imagem: {exc}")

    if not all_chunks:
        logger.error("Nenhum chunk gerado. Abortando.")
        sys.exit(1)

    logger.info(f"\nTotal de chunks antes do embedding: {len(all_chunks)}")

    # ── Embeddings ───────────────────────────────────────────────────────────
    logger.info("Gerando embeddings...")
    all_chunks = embed_chunks(all_chunks)

    # ── Índice ───────────────────────────────────────────────────────────────
    logger.info("Construindo índice sqlite-vec...")
    build_index(all_chunks)

    elapsed = time.perf_counter() - start

    # ── Relatório final ──────────────────────────────────────────────────────
    stats = index_stats()
    logger.info("")
    logger.info("─" * 50)
    logger.info("INGESTÃO CONCLUÍDA")
    logger.info("─" * 50)
    for s in stats:
        logger.info(f"  {s['collection']:<30} {s['total']:>4} chunks")
    logger.info(f"  {'TOTAL':<30} {sum(s['total'] for s in stats):>4} chunks")
    logger.info(f"  Tempo total: {elapsed:.1f}s")
    logger.info("─" * 50)


def _show_stats() -> None:
    from ingest.index_builder import DB_PATH, index_stats

    if not DB_PATH.exists():
        print("Índice não encontrado. Execute 'python ingest/ingest.py' primeiro.")
        sys.exit(1)

    stats = index_stats()
    if not stats:
        print("Índice vazio.")
        return

    print("\nEstatísticas do índice atual:")
    print("─" * 40)
    for s in stats:
        print(f"  {s['collection']:<28} {s['total']:>4} chunks")
    print(f"  {'TOTAL':<28} {sum(s['total'] for s in stats):>4} chunks")
    print(f"\n  Arquivo: {DB_PATH}")
    print(f"  Tamanho: {DB_PATH.stat().st_size / 1024 / 1024:.1f} MB")
    print("─" * 40)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pipeline de ingestão do sankhya-mcp"
    )
    parser.add_argument(
        "--collection",
        metavar="NOME",
        help="Processa apenas a coleção especificada (nome da pasta em docs/)",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Exibe estatísticas do índice atual e sai",
    )
    args = parser.parse_args()

    if args.stats:
        _show_stats()
        return

    _run_ingest(args.collection)


if __name__ == "__main__":
    main()
