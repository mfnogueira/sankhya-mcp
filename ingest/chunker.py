import os
import re
from pathlib import Path

import tiktoken
from dotenv import load_dotenv

load_dotenv()

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))

_encoder = tiktoken.get_encoding("cl100k_base")
_HEADER_RE = re.compile(r"^#{1,3} .+", re.MULTILINE)


def _count(text: str) -> int:
    return len(_encoder.encode(text))


def chunk_markdown(filepath: str | Path) -> list[dict]:
    """
    Divide um arquivo .md em chunks semânticos.

    Retorna lista de dicts com:
      text, source_file, collection, chunk_index, type
    """
    filepath = Path(filepath)
    source_file = filepath.name
    collection = filepath.parent.name

    text = filepath.read_text(encoding="utf-8")
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    result: list[dict] = []
    chunk_index = 0
    current_header = ""   # último header visto
    chunk_header = ""     # header ativo quando o chunk atual começou
    buf: list[str] = []
    buf_tokens = 0

    def emit():
        nonlocal chunk_index
        if not buf:
            return
        body = "\n\n".join(buf)
        # Garante contexto do header no início do chunk
        if chunk_header and not body.startswith(chunk_header):
            full = f"{chunk_header}\n\n{body}"
        else:
            full = body
        result.append(
            {
                "text": full.strip(),
                "source_file": source_file,
                "collection": collection,
                "chunk_index": chunk_index,
                "type": "markdown",
            }
        )
        chunk_index += 1

    def rollover():
        """Mantém os últimos CHUNK_OVERLAP tokens no buffer para o próximo chunk."""
        nonlocal buf, buf_tokens
        new_buf: list[str] = []
        new_tokens = 0
        for part in reversed(buf):
            t = _count(part)
            if new_tokens + t > CHUNK_OVERLAP:
                break
            new_buf.insert(0, part)
            new_tokens += t
        buf = new_buf
        buf_tokens = new_tokens

    for para in paragraphs:
        # Rastreia o header da seção atual
        if _HEADER_RE.match(para):
            current_header = para.splitlines()[0]

        para_tokens = _count(para)

        # Parágrafo maior que CHUNK_SIZE (ex: bloco de código longo): split por linha
        if para_tokens > CHUNK_SIZE:
            if buf:
                emit()
                rollover()
                chunk_header = current_header
            for line in para.splitlines():
                line = line.strip()
                if not line:
                    continue
                line_tokens = _count(line)
                if buf_tokens + line_tokens > CHUNK_SIZE and buf:
                    emit()
                    rollover()
                    chunk_header = current_header
                buf.append(line)
                buf_tokens += line_tokens
        else:
            if buf_tokens + para_tokens > CHUNK_SIZE:
                emit()
                rollover()
                chunk_header = current_header
            buf.append(para)
            buf_tokens += para_tokens

    if buf:
        emit()

    return result
