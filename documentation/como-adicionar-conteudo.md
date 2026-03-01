# Como adicionar conteúdo ao sankhya-mcp

Este guia explica como adicionar novos documentos e imagens ao índice vetorial do projeto.

---

## Estrutura de pastas

```
docs/
├── <nome-da-colecao>/
│   ├── documento-1.md
│   ├── documento-2.md
│   └── images/
│       ├── screenshot-1.png
│       └── screenshot-2.jpg
```

Cada subpasta dentro de `docs/` é uma **coleção** — uma categoria temática de documentos. Exemplos existentes:

| Coleção | Conteúdo |
|---|---|
| `boletos-emissao` | Emissão de boletos, XMLs de NF-e |
| `dashboards-html5` | Criação e otimização de dashboards |
| `reabertura-ops` | Reabertura de ordens de produção |
| `troubleshooting` | (vazia, reservada para uso futuro) |

---

## Pré-requisitos

Antes de rodar o ingest, garanta que:

1. O Python 3.12+ está instalado
2. O `uv` está instalado (`pip install uv` ou via script oficial)
3. O arquivo `.env` existe na raiz do projeto com a chave:

```env
OPENAI_API_KEY=sk-...   # Obrigatório apenas se houver imagens
```

> Sem a `OPENAI_API_KEY`, o ingest de imagens será ignorado ou falhará. Para documentos Markdown apenas, a chave não é necessária.

---

## Adicionando um documento Markdown

### Em uma coleção existente

```bash
# 1. Crie ou copie o arquivo .md na pasta da coleção
cp meu-documento.md docs/dashboards-html5/

# 2. Reprocesse apenas essa coleção (mais rápido)
python ingest/ingest.py --collection dashboards-html5

# 3. Verifique o resultado
python ingest/ingest.py --stats
```

### Em uma coleção nova

```bash
# 1. Crie a pasta da nova coleção
mkdir docs/nova-colecao

# 2. Adicione os arquivos .md
cp meu-documento.md docs/nova-colecao/

# 3. Reprocesse o índice inteiro
python ingest/ingest.py

# 4. Verifique o resultado
python ingest/ingest.py --stats
```

---

## Adicionando imagens

As imagens são descritas automaticamente pelo **GPT-4o Vision** durante o ingest e indexadas como texto. Formatos suportados: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`.

```bash
# 1. Crie a subpasta images/ dentro da coleção (se não existir)
mkdir docs/<colecao>/images/

# 2. Copie as imagens
cp screenshot.png docs/<colecao>/images/

# 3. Garanta que OPENAI_API_KEY está no .env

# 4. Reprocesse a coleção
python ingest/ingest.py --collection <colecao>
```

> As imagens **não são armazenadas** no índice — apenas a descrição textual gerada pelo GPT-4o é indexada. Isso mantém o arquivo `index.db` leve.

---

## O que acontece durante o ingest

```
docs/<colecao>/*.md  →  chunker.py       →  texto dividido em chunks de até 500 tokens
docs/<colecao>/images/*  →  image_describer.py  →  descrição via GPT-4o Vision
chunks + descrições  →  embedder.py      →  vetores 384 dimensões (fastembed, local)
vetores              →  index_builder.py →  src/data/index.db (SQLite + sqlite-vec)
```

O ingest **sempre reconstrói o índice do zero** — não há atualização incremental. Ao reprocessar uma coleção, todas as outras coleções são preservadas porque o script recarrega tudo antes de salvar.

---

## Comandos de referência

```bash
# Reprocessar todas as coleções
python ingest/ingest.py

# Reprocessar uma coleção específica
python ingest/ingest.py --collection <nome-da-colecao>

# Ver estatísticas do índice atual
python ingest/ingest.py --stats
```

---

## Após adicionar conteúdo

Se for publicar uma nova versão no npm (para distribuir o índice atualizado):

```bash
# 1. Bump de versão
npm version patch   # ou minor / major

# 2. Publicar
npm publish
```

> O arquivo `src/data/index.db` é incluído no pacote npm automaticamente (configurado via `pyproject.toml`). Os arquivos em `docs/` e `ingest/` **não são publicados**.

---

## Formatos suportados

| Formato | Suportado | Observação |
|---|---|---|
| `.md` (Markdown) | Sim | Formato principal |
| `.png / .jpg / .jpeg / .webp / .gif` | Sim | Via GPT-4o Vision |
| `.pdf` | Não | Converter para `.md` antes |
| `.docx` / `.xlsx` | Não | Converter para `.md` antes |

Para PDFs ou Word, uma opção é usar ferramentas como [markitdown](https://github.com/microsoft/markitdown) para converter antes de adicionar à pasta da coleção.
