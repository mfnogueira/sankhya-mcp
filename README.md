# sankhya-mcp

> **Projeto em fase inicial — novas versões e funcionalidades em breve.**

Servidor MCP (Model Context Protocol) para documentação do **Sankhya ERP**, com busca semântica local via RAG. Permite que o Claude (VS Code, Claude Desktop, etc.) responda perguntas precisas sobre o sistema Sankhya sem necessidade de chaves de API em runtime.

---

## Como funciona

O conhecimento fica embutido no pacote como um índice vetorial local (`sqlite-vec`). O servidor roda localmente via STDIO e responde às queries do Claude com os trechos de documentação mais relevantes.

```
Usuário pergunta ao Claude
        ↓
Claude chama search_docs (MCP tool)
        ↓
Servidor busca no índice local (sem API externa)
        ↓
Claude responde com base na documentação do Sankhya
```

---

## Instalação — VS Code

Adicione ao `.mcp.json` do seu projeto:

```json
{
  "mcpServers": {
    "sankhya-docs": {
      "command": "npx",
      "args": ["sankhya-mcp"]
    }
  }
}
```

## Instalação — Claude Desktop

Adicione ao `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sankhya-docs": {
      "command": "npx",
      "args": ["sankhya-mcp"]
    }
  }
}
```

---

## Coleções disponíveis

| Coleção | Descrição |
|---|---|
| `boletos-emissao` | Emissão de boletos e exportação de XMLs de NF-e |
| `dashboards-html5` | Criação e otimização de dashboards HTML5 |
| `reabertura-ops` | Correção e reabertura de ordens de produção |

---

## Exemplos de perguntas

- *Como exportar XMLs de NF-e no Sankhya?*
- *Como criar um dashboard HTML5?*
- *Como otimizar queries para dashboards?*
- *Como reabrir uma ordem de produção?*
- *Como corrigir apontamentos de OP com quantidade errada?*

---

## Stack

- Python 3.12+
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) + FastMCP
- [sqlite-vec](https://github.com/asg017/sqlite-vec) — índice vetorial embutido
- [fastembed](https://github.com/qdrant/fastembed) — embeddings locais (sem API externa)
- Modelo: `paraphrase-multilingual-MiniLM-L12-v2` (384 dims, multilingual)

---

## Status

Este projeto está em **fase inicial de desenvolvimento**. Em breve:

- Novas coleções de documentação
- Melhorias na qualidade da busca
- Publicação no npm para uso via `npx`

Sugestões e contribuições são bem-vindas via [Issues](https://github.com/mfnogueira/sankhya-mcp/issues).
