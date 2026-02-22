# SPEC — Servidor MCP com RAG para Documentação de App

## Visão Geral

Este projeto implementa um **servidor MCP (Model Context Protocol)** distribuído via **npm**, que permite a qualquer pessoa conectar seu Claude (VS Code, Claude Desktop, etc.) e obter respostas precisas sobre um app específico — sem precisar de nenhuma chave de API, sem configuração de infraestrutura, sem latência de rede.

O modelo é inspirado no **n8n-MCP**: o conhecimento fica **embutido no pacote** como um índice vetorial local. O dono do projeto roda o pipeline de ingestão localmente, gera o índice e publica uma nova versão npm. Os usuários sempre consomem a versão mais recente automaticamente via `npx`.

---

## Arquitetura

```
VOCÊ (mantenedor)                        USUÁRIO (consumidor)
─────────────────────────────            ────────────────────────────
docs/*.md + images/                      .mcp.json aponta para npx
      ↓
Pipeline de ingestão (local)             npx seu-pacote
  • chunking dos .md                           ↓
  • GPT-4o Vision nas imagens           Servidor MCP sobe localmente
  • OpenAI embeddings                          ↓
      ↓                                  Busca no índice local
Gera: data/index.db (sqlite-vec)               ↓
      ↓                                  Retorna contexto para o Claude
npm publish                                    ↓
(índice embutido no pacote)             Claude responde com precisão
      ↓
Usuários com npx recebem
a versão atualizada automaticamente
```

---

## Como o Usuário Final Usa

Zero instalação, zero chaves de API, zero configuração de infraestrutura. Basta adicionar ao `.mcp.json` do projeto:

```json
{
  "mcpServers": {
    "app-docs": {
      "command": "npx",
      "args": ["seu-pacote-npm"]
    }
  }
}
```

Ou no `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "app-docs": {
      "command": "npx",
      "args": ["seu-pacote-npm"]
    }
  }
}
```

---

## Fluxo de Atualização de Conteúdo

```
Você edita/adiciona docs
        ↓
python ingest/ingest.py        ← roda localmente, usa suas chaves
        ↓
data/index.db atualizado       ← índice vetorial regenerado
        ↓
npm version patch              ← bump de versão
npm publish                    ← publica no npm com o novo índice
        ↓
Usuários com npx pegam         ← automático na próxima execução
a versão mais recente
```

---

## Estrutura de Pastas do Projeto

```
mcp-app-docs/
│
├── docs/                          # Documentos fonte (Markdown + imagens)
│   ├── dashboards/
│   │   ├── criar_dashboard.md
│   │   ├── tipos_de_grafico.md
│   │   └── images/
│   │       └── tela_novo_dashboard.png
│   ├── rastreamento_erros/
│   │   ├── como_rastrear.md
│   │   └── images/
│   │       └── tela_logs.png
│   └── <nova_colecao>/            # Basta criar pasta e rodar ingest
│
├── ingest/                        # Pipeline de ingestão (só você usa)
│   ├── ingest.py                  # Script principal (CLI)
│   ├── chunker.py                 # Chunking dos markdowns
│   ├── image_describer.py         # Descreve imagens com GPT-4o Vision
│   └── embedder.py                # Gera embeddings com OpenAI
│
├── data/
│   └── index.db                   # Índice vetorial gerado (sqlite-vec)
│                                  # Este arquivo é empacotado no npm
│
├── src/
│   └── server.py                  # Servidor MCP principal (STDIO)
│
├── pyproject.toml                 # Configuração do pacote Python
├── requirements.txt               # Dependências Python
├── .env                           # Chaves de API locais (não versionar)
├── .gitignore
├── .npmignore                     # Exclui docs/ e ingest/ do pacote
└── README.md                      # Instruções para a comunidade
```

---

## Stack Tecnológica

| Componente | Tecnologia |
|---|---|
| Linguagem | Python 3.11+ |
| Servidor MCP | `mcp` (Python SDK oficial) + FastMCP |
| Transporte | STDIO (local, via npx/uvx) |
| Distribuição | npm ou PyPI |
| Índice vetorial embutido | `sqlite-vec` (arquivo .db no pacote) |
| Embeddings (ingestão) | OpenAI `text-embedding-3-small` |
| Visão — imagens (ingestão) | OpenAI GPT-4o |
| Busca em runtime | sqlite-vec (sem API externa) |
| Gerenciador de pacotes | `uv` |

> **Por que sqlite-vec?** É um arquivo único `.db` que pode ser empacotado junto com o código no npm/PyPI. Não requer servidor externo, não requer chaves de API em runtime. O usuário final não precisa de nada além do Python instalado.

---

## Variáveis de Ambiente

Usadas **apenas por você**, durante a ingestão. O usuário final não precisa de nenhuma.

```env
# .env (nunca versionar)
OPENAI_API_KEY=sk-...         # Para embeddings e GPT-4o Vision
DOCS_PATH=./docs              # Caminho para os documentos
CHUNK_SIZE=500                # Tamanho máximo do chunk em tokens
CHUNK_OVERLAP=50              # Sobreposição entre chunks
TOP_K=5                       # Número de resultados por busca
```

---

## O que é Empacotado no npm

```
.npmignore define o que FICA FORA do pacote:
  - docs/          (seus arquivos fonte — privados)
  - ingest/        (pipeline de ingestão — privado)
  - .env           (suas chaves — privadas)

O que VAI no pacote:
  - src/server.py  (servidor MCP)
  - data/index.db  (índice vetorial com todo o conhecimento)
  - requirements.txt
  - pyproject.toml
  - README.md
```

---

## Etapas de Desenvolvimento

---

### ETAPA 1 — Setup do Projeto

**Objetivo:** Criar a estrutura base com todas as dependências configuradas.

**Tarefas:**
1. Criar estrutura de pastas conforme definida acima
2. Criar `requirements.txt`:
   ```
   mcp[cli]>=1.2.0
   sqlite-vec
   openai
   python-dotenv
   tiktoken
   numpy
   ```
3. Criar `pyproject.toml` com metadados do pacote:
   ```toml
   [project]
   name = "seu-pacote-npm"
   version = "0.1.0"
   description = "MCP server for <nome do app> documentation"
   requires-python = ">=3.11"

   [project.scripts]
   seu-pacote = "src.server:main"
   ```
4. Criar `.env` com as suas chaves (não versionar)
5. Criar `.gitignore`:
   ```
   .env
   __pycache__/
   .venv/
   *.pyc
   data/index.db    # gerado pelo ingest, não versionar no git
                    # mas DEVE ir no pacote npm
   ```
6. Criar `.npmignore`:
   ```
   docs/
   ingest/
   .env
   .gitignore
   ```
7. Inicializar com `uv` e instalar dependências

**Critério de conclusão:** Projeto instalado sem erros.

---

### ETAPA 2 — Pipeline de Ingestão: Chunking dos Markdowns

**Objetivo:** Processar arquivos `.md` e dividi-los em chunks semânticos.

**Arquivo:** `ingest/chunker.py`

**Comportamento esperado:**
- Recebe o caminho de um arquivo `.md`
- Preserva o nome da coleção (nome da pasta pai) como metadado
- Divide o conteúdo em chunks respeitando `CHUNK_SIZE` e `CHUNK_OVERLAP` em tokens (usando `tiktoken`)
- Quebra preferencialmente em `\n\n` antes de cortar no meio
- Preserva o header da seção no início de cada chunk
- Cada chunk retorna:
  ```python
  {
    "text": "...",
    "source_file": "criar_dashboard.md",
    "collection": "dashboards",
    "chunk_index": 0,
    "type": "markdown"
  }
  ```

**Critério de conclusão:** Função `chunk_markdown(filepath) -> list[dict]` funcionando corretamente.

---

### ETAPA 3 — Pipeline de Ingestão: Descrição de Imagens com GPT-4o

**Objetivo:** Converter imagens (prints de tela) em descrições textuais indexáveis.

**Arquivo:** `ingest/image_describer.py`

**Comportamento esperado:**
- Recebe o caminho de uma imagem (`.png`, `.jpg`, `.jpeg`)
- Envia em base64 para GPT-4o com o prompt:
  ```
  Você está analisando um print de tela de um sistema de software.
  Descreva detalhadamente o que está visível: elementos de interface,
  botões, menus, dados exibidos, mensagens de erro (se houver),
  e o contexto geral da tela. Seja específico e técnico.
  ```
- Retorna chunk com metadados:
  ```python
  {
    "text": "<descrição gerada pelo GPT-4o>",
    "source_file": "tela_novo_dashboard.png",
    "collection": "dashboards",
    "chunk_index": 0,
    "type": "image_description"
  }
  ```

**Critério de conclusão:** Função `describe_image(filepath) -> dict` retornando descrição detalhada.

---

### ETAPA 4 — Pipeline de Ingestão: Geração de Embeddings

**Objetivo:** Gerar vetores de embedding para cada chunk.

**Arquivo:** `ingest/embedder.py`

**Comportamento esperado:**
- Recebe lista de chunks (dicts com campo `text`)
- Chama OpenAI com modelo `text-embedding-3-small` (dimensão: 1536)
- Faz batching de até 100 textos por chamada
- Retorna cada chunk enriquecido com `embedding: list[float]`

**Critério de conclusão:** Função `embed_chunks(chunks: list[dict]) -> list[dict]` funcionando com batching.

---

### ETAPA 5 — Pipeline de Ingestão: Construção do Índice sqlite-vec

**Objetivo:** Salvar os chunks com embeddings no arquivo `data/index.db`.

**Arquivo:** `ingest/ingest.py` (função de build do índice)

**Comportamento esperado:**
- Cria (ou recria) o arquivo `data/index.db`
- Cria duas tabelas:
  - `chunks` — metadados: id, text, source_file, collection, chunk_index, type
  - `embeddings` — tabela virtual sqlite-vec com os vetores (dimensão 1536)
- Para cada chunk com embedding, insere nas duas tabelas
- A reconstrução é sempre completa (apaga e recria o índice do zero)
- Ao final exibe estatísticas: total de chunks por coleção

**Estrutura do banco:**
```sql
CREATE TABLE chunks (
    id INTEGER PRIMARY KEY,
    text TEXT,
    source_file TEXT,
    collection TEXT,
    chunk_index INTEGER,
    type TEXT
);

CREATE VIRTUAL TABLE embeddings USING vec0(
    embedding FLOAT[1536]
);
```

**Critério de conclusão:** Arquivo `data/index.db` gerado com todos os chunks indexados e consultável via SQL.

---

### ETAPA 6 — Script Principal de Ingestão (CLI)

**Objetivo:** Orquestrar todo o pipeline via linha de comando.

**Arquivo:** `ingest/ingest.py` (função main + CLI)

**Interface de uso:**
```bash
# Rebuild completo do índice (mais comum)
python ingest/ingest.py

# Rebuild apenas de uma coleção
python ingest/ingest.py --collection dashboards

# Ver estatísticas do índice atual
python ingest/ingest.py --stats
```

**Comportamento esperado:**
- Percorre `DOCS_PATH` recursivamente
- Para cada `.md` → chunker → embedder
- Para cada imagem em `images/` → image_describer → embedder
- Constrói o índice sqlite-vec com todos os chunks
- Exibe progresso: arquivo processado, chunks gerados
- Ao final: total de arquivos, total de chunks por coleção, tempo total

> O rebuild é sempre completo para garantir consistência do índice empacotado.

**Critério de conclusão:** Script roda do início ao fim, `data/index.db` gerado com todos os documentos indexados.

---

### ETAPA 7 — Servidor MCP (STDIO)

**Objetivo:** Implementar o servidor MCP que roda localmente via STDIO.

**Arquivo:** `src/server.py`

**Tools a implementar:**

#### Tool 1: `search_docs`
- **Descrição:** Busca documentação relevante sobre o app com base em uma query semântica
- **Parâmetros:**
  - `query: str` — a pergunta ou termo a buscar
  - `collection: str | None` — filtrar por coleção específica (opcional)
  - `top_k: int` — número de resultados (default: 5)
- **Comportamento:**
  - Gera embedding da query via OpenAI

  > ⚠️ **Ponto de atenção:** esta é a única chamada de API em runtime. O usuário precisará fornecer `OPENAI_API_KEY` no `.mcp.json` para que a busca funcione. Avaliar alternativa de embedding local (ex: `fastembed`) para eliminar essa dependência completamente.

  - Consulta `data/index.db` via sqlite-vec (busca por similaridade de cosseno)
  - Aplica filtro SQL por `collection` se fornecido
  - Retorna os chunks mais relevantes formatados como texto legível

#### Tool 2: `list_collections`
- **Descrição:** Lista todas as coleções de documentação disponíveis
- **Parâmetros:** nenhum
- **Comportamento:**
  - Consulta `SELECT DISTINCT collection, COUNT(*) FROM chunks GROUP BY collection`
  - Retorna lista formatada com nome e contagem de cada coleção

**Estrutura do servidor:**
```python
from mcp.server.fastmcp import FastMCP
import sqlite_vec
import sqlite3

DB_PATH = Path(__file__).parent.parent / "data" / "index.db"

mcp = FastMCP("app-docs")

@mcp.tool()
def search_docs(query: str, collection: str = None, top_k: int = 5) -> str:
    """Busca documentação do app. Use quando o usuário perguntar sobre
    funcionalidades, erros, configurações ou qualquer aspecto do app."""
    ...

@mcp.tool()
def list_collections() -> str:
    """Lista as coleções de documentação disponíveis sobre o app."""
    ...

def main():
    mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
```

**Logging — CRÍTICO para STDIO:**
```python
import sys
import logging

# NUNCA usar print() — corrompe o protocolo JSON-RPC
logging.basicConfig(stream=sys.stderr, level=logging.INFO)
logger = logging.getLogger(__name__)
```

**Critério de conclusão:** Servidor inicia sem erros, tools respondem corretamente quando testadas via MCP Inspector.

---

### ETAPA 8 — Decisão: Embedding em Runtime

**Objetivo:** Definir como o embedding da query do usuário será gerado em runtime.

**Opção A — OpenAI API (mais simples, requer chave do usuário):**
```json
{
  "mcpServers": {
    "app-docs": {
      "command": "npx",
      "args": ["seu-pacote"],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

**Opção B — Embedding local com `fastembed` (zero dependência externa):**
- Usa modelo leve rodando localmente (ex: `BAAI/bge-small-en`)
- Primeira execução faz download do modelo (~130MB)
- Execuções seguintes são instantâneas (modelo fica em cache)
- Usuário não precisa de nenhuma chave
- Tradeoff: qualidade de busca ligeiramente inferior ao OpenAI

> **Recomendação:** implementar Opção B com `fastembed` para máxima simplicidade para o usuário final, alinhado com o modelo do n8n-MCP. O índice pode ser gerado com OpenAI (sua ingestão) e a busca em runtime com fastembed usando um modelo compatível.

**Critério de conclusão:** Decisão tomada e implementada antes de publicar no npm.

---

### ETAPA 9 — Testes com MCP Inspector

**Objetivo:** Validar o servidor antes de publicar.

**Tarefas:**
1. Garantir que `data/index.db` foi gerado pelo pipeline de ingestão
2. Instalar MCP Inspector: `npx @modelcontextprotocol/inspector`
3. Conectar ao servidor via STDIO: `python src/server.py`
4. Testar `list_collections` — verificar coleções indexadas
5. Testar `search_docs` com queries reais — verificar relevância
6. Testar filtro por `collection`
7. Verificar que nenhum `print()` vaza para stdout

**Critério de conclusão:** Ambas as tools retornam resultados corretos e o protocolo STDIO não é corrompido.

---

### ETAPA 10 — Empacotamento e Publicação no npm

**Objetivo:** Publicar o pacote no npm para distribuição via `npx`.

**Tarefas:**

1. Confirmar que `data/index.db` está **fora** do `.gitignore` do npm (deve ir no pacote):
   ```
   # .gitignore — exclui do git mas não do npm
   data/index.db

   # .npmignore — exclui do pacote npm
   docs/
   ingest/
   .env
   ```

2. Criar conta no npm (se não tiver) em `npmjs.com`

3. Fazer login:
   ```bash
   npm login
   ```

4. Verificar o que será publicado:
   ```bash
   npm pack --dry-run
   # Confirmar que index.db está incluído
   # Confirmar que docs/ e ingest/ NÃO estão incluídos
   ```

5. Publicar:
   ```bash
   npm publish
   ```

6. Testar o pacote publicado:
   ```bash
   npx seu-pacote
   ```

**Critério de conclusão:** `npx seu-pacote` funciona em uma máquina limpa sem nenhuma configuração adicional (exceto chave OpenAI se opção A).

---

### ETAPA 11 — Workflow de Atualização de Conteúdo

**Objetivo:** Documentar e validar o ciclo de manutenção da base de conhecimento.

**Fluxo padrão:**

```bash
# 1. Edite, adicione ou remova arquivos em docs/

# 2. Regenere o índice
python ingest/ingest.py

# 3. Teste localmente
npx @modelcontextprotocol/inspector python src/server.py

# 4. Publique nova versão
npm version patch   # ou minor / major
npm publish

# Usuários com npx recebem automaticamente na próxima execução
```

**Tabela de cenários:**

| Ação | Comando |
|---|---|
| Adicionar novo documento | Criar `.md` na pasta → `python ingest/ingest.py` |
| Atualizar documento existente | Editar `.md` → `python ingest/ingest.py` |
| Adicionar nova coleção | Criar nova pasta em `docs/` → `python ingest/ingest.py` |
| Adicionar imagem | Colocar em `docs/<colecao>/images/` → `python ingest/ingest.py` |
| Publicar atualização | `npm version patch && npm publish` |

**Critério de conclusão:** Ciclo completo testado — editar doc → regenerar índice → publicar → usuário recebe atualização.

---

### ETAPA 12 — README para a Comunidade

**Objetivo:** Documentar como qualquer pessoa pode usar o servidor.

**Arquivo:** `README.md`

**Seções obrigatórias:**
1. **O que é este projeto** — descrição do app documentado
2. **Instalação — VS Code** — snippet do `.mcp.json` com `npx`
3. **Instalação — Claude Desktop** — snippet do `claude_desktop_config.json`
4. **Coleções disponíveis** — lista com descrição de cada coleção
5. **Exemplos de perguntas** — 5 a 10 exemplos práticos
6. **Como contribuir** — Issues/PR para sugerir melhorias na documentação

**Critério de conclusão:** Qualquer pessoa sem conhecimento técnico consegue configurar seguindo apenas o README.

---

## Considerações Importantes

### Custos

| Item | Quem paga | Quando |
|---|---|---|
| OpenAI embeddings (ingestão) | Você | Só ao gerar o índice |
| GPT-4o Vision (imagens) | Você | Só ao gerar o índice |
| npm (distribuição) | Gratuito | — |
| Runtime do servidor | Ninguém | Roda local, sem API |
| Embedding em runtime (Opção B) | Ninguém | fastembed local |

> Com a Opção B (fastembed), o custo para o usuário final é **zero** e o custo para você é **apenas na ingestão**.

### Segurança
- `docs/` e `ingest/` nunca vão no pacote npm (`.npmignore`)
- Suas chaves de API ficam apenas no `.env` local
- O `data/index.db` contém apenas os textos e vetores dos documentos públicos do app

### Versionamento do índice
- `data/index.db` vai no pacote npm mas **não no git** (arquivo binário grande)
- Usar `.gitignore` para excluir do git e `.npmignore` para garantir que vai no pacote
- Cada `npm publish` representa um snapshot do conhecimento naquele momento

### Comparação final com n8n-MCP

| Aspecto | n8n-MCP | Nosso projeto |
|---|---|---|
| Linguagem | TypeScript | Python |
| Índice embutido | SQLite (documentação estática) | sqlite-vec (vetorial semântico) |
| Busca | Full-text SQL | Similaridade semântica |
| Atualização | Nova versão npm | Nova versão npm |
| Distribuição | `npx n8n-mcp` | `npx seu-pacote` |
| Chaves necessárias | Nenhuma | Nenhuma (Opção B) |
| Latência | Zero (local) | Zero (local) |
