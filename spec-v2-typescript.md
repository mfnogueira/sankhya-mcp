# SPEC v2 — Migração para TypeScript/npm Puro

## Contexto e Motivação

O projeto atual funciona perfeitamente em Linux/macOS, mas apresenta **sérias dificuldades de instalação no Windows**:

- `sqlite-vec` é uma extensão C que exige compilação ou wheel pré-compilado específico
- `fastembed` embute o ONNX Runtime, que no Windows requer o **Microsoft C++ Redistributable**
- `uv` funciona no Windows, mas adiciona uma etapa de instalação manual para o usuário final
- Em conjunto, esses requisitos resultam em instalação de vários GB de ferramentas antes do `npx` funcionar

**Solução:** reescrever o servidor e o pipeline de ingestão inteiramente em **TypeScript/Node.js**, usando apenas pacotes npm que distribuem binários pré-compilados para Windows/Mac/Linux.

---

## Comparação de Stacks

| Componente | v1 (Python/UV) | v2 (TypeScript/npm) |
|---|---|---|
| Linguagem runtime | Python 3.12 | Node.js (TypeScript) |
| Servidor MCP | `mcp[cli]` + FastMCP | `@modelcontextprotocol/sdk` |
| SQLite | `sqlite3` (stdlib) | `better-sqlite3` |
| Extensão vetorial | `sqlite-vec` (Python) | `sqlite-vec` (npm) |
| Embeddings runtime | `fastembed` (ONNX) | `@huggingface/transformers` (ONNX) |
| Embeddings ingestão | `fastembed` (local) | `@huggingface/transformers` (local) |
| Visão — imagens | `openai` Python SDK | `openai` npm SDK |
| Gerenciador | `uv` | `npm` |
| Distribuição | `npx` (chama `uv run`) | `npx` (Node.js nativo) |
| Instalação no Windows | Requer MSVC, C++ Build Tools | `npm install` — zero configuração extra |

---

## Arquitetura (mantida)

```
VOCÊ (mantenedor)                        USUÁRIO (consumidor)
─────────────────────────────            ────────────────────────────
docs/*.md + images/                      .mcp.json aponta para npx
      ↓
Pipeline de ingestão (local, TS)         npx sankhya-mcp
  • chunking dos .md                           ↓
  • GPT-4o Vision nas imagens           Node.js sobe localmente
  • @huggingface/transformers                  ↓
      ↓                                  Busca no índice local
Gera: src/data/index.db (sqlite-vec)           ↓
      ↓                                  Retorna contexto para o Claude
npm publish
(índice embutido no pacote)
```

---

## Estrutura de Pastas

```
sankhya-mcp/
│
├── docs/                          # Documentos fonte (Markdown + imagens)
│   └── <colecao>/
│       ├── arquivo.md
│       └── images/
│           └── tela.png
│
├── ingest/                        # Pipeline de ingestão (só o mantenedor usa)
│   ├── index.ts                   # Script principal (CLI)
│   ├── chunker.ts                 # Chunking de markdowns
│   ├── image-describer.ts         # Descreve imagens com GPT-4o Vision
│   └── embedder.ts                # Gera embeddings com @huggingface/transformers
│
├── src/
│   ├── server.ts                  # Servidor MCP principal (STDIO)
│   └── data/
│       └── index.db               # Índice vetorial gerado (vai no pacote npm)
│
├── bin/
│   └── sankhya-mcp.js             # Entry point npm (chama src/server via tsx/node)
│
├── package.json
├── tsconfig.json
├── .env                           # Chaves locais (não versionar)
├── .gitignore
├── .npmignore
└── README.md
```

---

## Variáveis de Ambiente

Usadas **apenas durante a ingestão**. O usuário final não precisa de nenhuma.

```env
OPENAI_API_KEY=sk-...         # Usado apenas para GPT-4o Vision (imagens)
DOCS_PATH=./docs              # Caminho para os documentos
CHUNK_SIZE=500                # Tamanho máximo do chunk em tokens
CHUNK_OVERLAP=50              # Sobreposição entre chunks
TOP_K=5                       # Número de resultados por busca
```

> Embeddings são gerados localmente com `@huggingface/transformers` — sem custo de API, sem chave necessária.

---

## Dependências

### Runtime (vão no pacote npm)

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^9.0.0",
    "sqlite-vec": "^0.1.0",
    "@huggingface/transformers": "^3.0.0"
  }
}
```

### Ingestão (devDependencies — não vão no pacote)

```json
{
  "devDependencies": {
    "openai": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "tsx": "^4.0.0"
  }
}
```

> `openai` fica em `devDependencies` porque é usado apenas no pipeline de ingestão, que roda localmente. O pacote publicado não precisa dele.

---

## Etapas de Desenvolvimento

---

### ETAPA 1 — Setup do Projeto TypeScript

**Objetivo:** Configurar a estrutura base, `package.json`, `tsconfig.json` e dependências.

**Tarefas:**

1. Atualizar `package.json` com todas as dependências e scripts:
   ```json
   {
     "name": "sankhya-mcp",
     "version": "0.1.0",
     "description": "MCP server for Sankhya ERP documentation — semantic search via sqlite-vec",
     "bin": { "sankhya-mcp": "./bin/sankhya-mcp.js" },
     "scripts": {
       "build": "tsc",
       "start": "node dist/server.js",
       "dev": "tsx src/server.ts",
       "ingest": "tsx ingest/index.ts"
     },
     "dependencies": {
       "@modelcontextprotocol/sdk": "^1.0.0",
       "better-sqlite3": "^9.0.0",
       "sqlite-vec": "^0.1.0",
       "@huggingface/transformers": "^3.0.0"
     },
     "devDependencies": {
       "openai": "^4.0.0",
       "typescript": "^5.0.0",
       "@types/node": "^20.0.0",
       "@types/better-sqlite3": "^7.0.0",
       "tsx": "^4.0.0"
     }
   }
   ```

2. Criar `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "commonjs",
       "lib": ["ES2022"],
       "outDir": "dist",
       "rootDir": "src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "resolveJsonModule": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

3. Remover arquivos Python não mais necessários no runtime:
   - `pyproject.toml`
   - `uv.lock`
   - `.python-version`
   - Atualizar `bin/sankhya-mcp.js` para chamar Node.js diretamente

4. Atualizar `.gitignore`:
   ```
   node_modules/
   dist/
   .env
   src/data/index.db
   data/index.db
   ```

5. Atualizar `.npmignore`:
   ```
   docs/
   ingest/
   .env
   .gitignore
   tsconfig.json
   **/*.ts
   !dist/**
   ```

6. Rodar `npm install`

**Critério de conclusão:** `npm install` roda sem erros no Windows, Mac e Linux. Sem dependências de compilação C++.

---

### ETAPA 2 — Entry Point (`bin/sankhya-mcp.js`)

**Objetivo:** Substituir o wrapper que chamava `uv run` por uma chamada direta ao Node.js.

**Arquivo:** `bin/sankhya-mcp.js`

**Comportamento esperado:**
- Chama `node dist/server.js` (versão compilada para produção/npm)
- Em desenvolvimento, `tsx src/server.ts` funciona direto
- Sem dependência de Python ou uv

```js
#!/usr/bin/env node
require("../dist/server.js");
```

> O `dist/server.js` é gerado pelo `tsc` antes do `npm publish`. Os usuários finais recebem o JS compilado.

**Critério de conclusão:** `npx sankhya-mcp` inicia o servidor sem erros em qualquer plataforma.

---

### ETAPA 3 — Servidor MCP (`src/server.ts`)

**Objetivo:** Reimplementar o servidor MCP em TypeScript usando `@modelcontextprotocol/sdk`.

**Arquivo:** `src/server.ts`

**Comportamento esperado:**
- Carrega `src/data/index.db` via `better-sqlite3`
- Carrega extensão `sqlite-vec` no banco
- Inicializa o modelo de embedding `paraphrase-multilingual-MiniLM-L12-v2` via `@huggingface/transformers` sob demanda
- Expõe duas tools via MCP STDIO:
  - `search_docs(query, collection?, top_k?)` — busca vetorial
  - `list_collections()` — lista coleções com contagem

**Estrutura base:**
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { pipeline } from "@huggingface/transformers";
import { z } from "zod";
import path from "path";

const DB_PATH = path.join(__dirname, "data", "index.db");
const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

// CRÍTICO: nunca usar console.log() — corrompe o protocolo JSON-RPC
// Todo log vai para process.stderr
```

**Critério de conclusão:** Servidor inicia, carrega o modelo e responde às tools corretamente.

---

### ETAPA 4 — Ingestão: Chunking (`ingest/chunker.ts`)

**Objetivo:** Processar arquivos `.md` e dividir em chunks semânticos.

**Arquivo:** `ingest/chunker.ts`

**Comportamento esperado:**
- Recebe caminho de um `.md`
- Preserva o nome da coleção (pasta pai) como metadado
- Divide em chunks respeitando `CHUNK_SIZE` tokens
- Quebra preferencialmente em `\n\n` antes de cortar
- Mantém o header da seção no início de cada chunk

**Interface:**
```typescript
interface Chunk {
  text: string;
  sourceFile: string;
  collection: string;
  chunkIndex: number;
  type: "markdown";
}

export function chunkMarkdown(filepath: string): Chunk[];
```

> Para tokenização, usar contagem simples de palavras (estimativa: 1 palavra ≈ 1.3 tokens) ou `gpt-tokenizer` se precisar de precisão.

**Critério de conclusão:** `chunkMarkdown(filepath)` retorna array de chunks com metadados corretos.

---

### ETAPA 5 — Ingestão: Descrição de Imagens (`ingest/image-describer.ts`)

**Objetivo:** Gerar descrições textuais de prints de tela via GPT-4o Vision.

**Arquivo:** `ingest/image-describer.ts`

**Comportamento esperado:**
- Recebe caminho de imagem (`.png`, `.jpg`, `.jpeg`)
- Envia em base64 para GPT-4o com prompt descritivo
- Retorna chunk com `type: "image_description"`

**Interface:**
```typescript
interface ImageChunk {
  text: string;
  sourceFile: string;
  collection: string;
  chunkIndex: 0;
  type: "image_description";
}

export async function describeImage(filepath: string): Promise<ImageChunk>;
```

**Prompt:**
```
Você está analisando um print de tela de um sistema de software.
Descreva detalhadamente o que está visível: elementos de interface,
botões, menus, dados exibidos, mensagens de erro (se houver),
e o contexto geral da tela. Seja específico e técnico.
```

**Critério de conclusão:** Função retorna descrição detalhada e útil para busca semântica.

---

### ETAPA 6 — Ingestão: Geração de Embeddings (`ingest/embedder.ts`)

**Objetivo:** Gerar vetores de embedding para os chunks usando `@huggingface/transformers`.

**Arquivo:** `ingest/embedder.ts`

**Comportamento esperado:**
- Carrega `paraphrase-multilingual-MiniLM-L12-v2` (dim: 384)
- Processa chunks em batches de até 64
- Retorna chunks enriquecidos com `embedding: number[]`
- Exibe progresso no stderr

**Interface:**
```typescript
interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export async function embedChunks(
  chunks: Chunk[]
): Promise<ChunkWithEmbedding[]>;
```

> Usar o **mesmo modelo** tanto na ingestão quanto no servidor de runtime — isso é obrigatório para que a busca vetorial funcione corretamente.

**Critério de conclusão:** Embeddings gerados com dimensão 384, compatíveis com o índice sqlite-vec.

---

### ETAPA 7 — Ingestão: Construção do Índice (`ingest/index-builder.ts`)

**Objetivo:** Salvar chunks com embeddings no arquivo `src/data/index.db`.

**Arquivo:** `ingest/index-builder.ts`

**Estrutura do banco (idêntica à v1):**
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
    embedding FLOAT[384]
);
```

**Comportamento esperado:**
- Apaga e recria o índice do zero (rebuild sempre completo)
- Insere em transação para performance
- Ao final: exibe estatísticas por coleção

**Critério de conclusão:** `src/data/index.db` gerado com todos os chunks e consultável via sqlite-vec.

---

### ETAPA 8 — Script Principal de Ingestão (`ingest/index.ts`)

**Objetivo:** Orquestrar o pipeline de ingestão via CLI.

**Arquivo:** `ingest/index.ts`

**Interface:**
```bash
# Rebuild completo
npm run ingest

# Rebuild de uma coleção específica
npm run ingest -- --collection dashboards

# Estatísticas do índice atual
npm run ingest -- --stats
```

**Fluxo:**
1. Carrega `.env`
2. Percorre `DOCS_PATH` recursivamente
3. Para cada `.md` → `chunkMarkdown` → `embedChunks`
4. Para cada imagem em `images/` → `describeImage` → `embedChunks`
5. `buildIndex(allChunks)`
6. Exibe progresso e estatísticas finais

**Critério de conclusão:** Pipeline completo roda do início ao fim, índice gerado corretamente.

---

### ETAPA 9 — Build e Verificação do Pacote

**Objetivo:** Garantir que o pacote npm está correto antes de publicar.

**Tarefas:**

1. Compilar TypeScript:
   ```bash
   npm run build
   ```

2. Verificar conteúdo do pacote:
   ```bash
   npm pack --dry-run
   ```
   Confirmar que:
   - `dist/server.js` está incluído
   - `src/data/index.db` está incluído
   - `docs/`, `ingest/`, `*.ts` (fontes) **não** estão incluídos
   - `node_modules/` **não** está incluído

3. Testar com MCP Inspector:
   ```bash
   npx @modelcontextprotocol/inspector node dist/server.js
   ```
   - Verificar `list_collections` retorna as coleções
   - Verificar `search_docs` retorna resultados relevantes
   - Confirmar que nenhum `console.log` vaza para stdout

**Critério de conclusão:** `npm pack --dry-run` mostra apenas os arquivos corretos e o MCP Inspector valida as tools.

---

### ETAPA 10 — Testes no Windows

**Objetivo:** Validar instalação zero-fricção no Windows.

**Tarefas:**

1. Em uma máquina Windows limpa (sem Python, sem Visual Studio):
   ```bash
   npx sankhya-mcp
   ```

2. Verificar que `npm install` (feito internamente pelo npx) não exige compilação

3. Verificar que o modelo de embedding faz download automaticamente na primeira execução

4. Conectar ao MCP Inspector e validar as tools

**Critério de conclusão:** `npx sankhya-mcp` funciona no Windows sem instalar nada além do Node.js.

---

### ETAPA 11 — Publicação no npm

**Objetivo:** Publicar a v2 do pacote.

**Tarefas:**

1. Rodar o pipeline de ingestão para gerar `src/data/index.db` atualizado
2. Compilar: `npm run build`
3. Verificar: `npm pack --dry-run`
4. Bump de versão: `npm version minor` (de 0.1.x para 0.2.0 — breaking change de stack)
5. Publicar: `npm publish`
6. Testar: `npx sankhya-mcp@latest`

**Critério de conclusão:** Nova versão publicada e funcional via npx em todas as plataformas.

---

### ETAPA 12 — Limpeza e README

**Objetivo:** Remover arquivos Python obsoletos e atualizar a documentação.

**Arquivos a remover:**
- `pyproject.toml`
- `uv.lock`
- `.python-version`
- `src/server.py`
- `ingest/*.py`

**Atualizar README:**
- Remover menção a Python/uv
- Atualizar requisito para "Node.js 18+" apenas
- Manter instruções de uso para o usuário final (inalteradas — mesmo `npx`)

**Critério de conclusão:** Repositório limpo, sem rastros de Python no runtime.

---

## Considerações Importantes

### Por que `@huggingface/transformers` em vez de API?

O runtime usa embeddings locais (sem API) pelo mesmo motivo que a v1: **o usuário final não precisa de nenhuma chave**. A diferença é que agora o download do modelo (~120MB) acontece via npm/Node.js e funciona no Windows sem compilar nada.

### Compatibilidade do índice entre v1 e v2

O modelo usado (`paraphrase-multilingual-MiniLM-L12-v2`, dim 384) é o **mesmo** da v1. Se o `src/data/index.db` já foi gerado com a v1, **ele é reutilizável diretamente** sem precisar re-ingerir.

### Custo zero em runtime

| Item | Quem paga | Quando |
|---|---|---|
| GPT-4o Vision (imagens) | Mantenedor | Só ao gerar o índice |
| Embeddings de ingestão | Ninguém | `@huggingface/transformers` local |
| Runtime do servidor | Ninguém | Node.js local, sem API |
| Embedding de query | Ninguém | `@huggingface/transformers` local |

### Comparação final v1 vs v2

| Aspecto | v1 (Python) | v2 (TypeScript) |
|---|---|---|
| Instala no Windows | Requer MSVC, C++ Build Tools | `npm install` — zero extras |
| Dependência do usuário | Python + uv | Node.js (já tem na maioria das máquinas) |
| Arquivo principal | `src/server.py` | `src/server.ts` → `dist/server.js` |
| Índice sqlite | Compatível | **Mesmo formato** — reutilizável |
| Qualidade de busca | Idêntica | Idêntica (mesmo modelo) |
| Distribuição | `npx` (via uv) | `npx` (nativo) |
