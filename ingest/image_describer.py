import base64
import logging
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

logger = logging.getLogger(__name__)

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client

SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

_PROMPT = (
    "Você está analisando um print de tela de um sistema de software chamado Sankhya ERP. "
    "Descreva detalhadamente o que está visível: elementos de interface, botões, menus, "
    "campos de formulário, dados exibidos, mensagens de erro (se houver), e o contexto "
    "geral da tela. Seja específico e técnico. Mencione rótulos, nomes de campos e "
    "valores visíveis que possam ser úteis para responder dúvidas de usuários."
)


def describe_image(filepath: str | Path) -> dict:
    """
    Envia uma imagem para GPT-4o Vision e retorna um chunk com a descrição gerada.

    A imagem deve estar dentro de uma pasta 'images/' que fica dentro de uma
    pasta de coleção. Exemplo: docs/dashboards-html5/images/tela.png

    Retorna dict com:
      text, source_file, collection, chunk_index, type
    """
    filepath = Path(filepath)

    if filepath.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Formato não suportado: {filepath.suffix}. Use: {SUPPORTED_EXTENSIONS}")

    # Infere a coleção: a pasta pai de 'images/' é a coleção
    # docs/<colecao>/images/<arquivo>
    source_file = filepath.name
    collection = filepath.parent.parent.name

    logger.info(f"Descrevendo imagem: {source_file} (coleção: {collection})")

    # Codifica a imagem em base64
    image_data = base64.standard_b64encode(filepath.read_bytes()).decode("utf-8")
    mime_type = _get_mime_type(filepath.suffix.lower())

    response = _get_client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{image_data}",
                            "detail": "high",
                        },
                    },
                    {"type": "text", "text": _PROMPT},
                ],
            }
        ],
        max_tokens=1024,
    )

    description = response.choices[0].message.content.strip()
    logger.info(f"  → {len(description)} caracteres gerados")

    return {
        "text": description,
        "source_file": source_file,
        "collection": collection,
        "chunk_index": 0,
        "type": "image_description",
    }


def _get_mime_type(ext: str) -> str:
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/png")
