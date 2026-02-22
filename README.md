# sankhya-mcp

> **Projeto em fase inicial — novas versões e funcionalidades em breve.**

Servidor MCP (Model Context Protocol) para documentação do **Sankhya ERP**, com busca semântica local via RAG. Permite que o Claude (VS Code, Claude Desktop, etc.) responda perguntas precisas sobre o sistema Sankhya — sem chaves de API, sem configuração de infraestrutura, sem latência de rede.

---

## Como funciona

O conhecimento fica embutido no pacote como um índice vetorial local (`sqlite-vec`). O servidor roda localmente via STDIO e responde às queries do Claude com os trechos de documentação mais relevantes.

```
Você pergunta ao Claude sobre o Sankhya
              ↓
Claude chama search_docs (MCP tool)
              ↓
Servidor busca no índice local (sem API externa)
              ↓
Claude responde com base na documentação do Sankhya
```

---

## Instalação

### Pré-requisito

É necessário ter o `uv` instalado na sua máquina:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

> O `uv` é um gerenciador de pacotes Python moderno e ultrarrápido. Ele será usado automaticamente pelo `npx` para instalar as dependências do servidor.

---

### VS Code / Claude Code

Crie ou edite o arquivo `.mcp.json` na raiz do seu projeto:

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

### Claude Desktop

Edite o arquivo `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

Reinicie o Claude Desktop após salvar.

---

### Uso pessoal (instalação global)

Se preferir instalar globalmente na sua máquina em vez de usar `npx`:

```bash
npm install -g sankhya-mcp
```

E no arquivo de configuração do Claude, use:

```json
{
  "mcpServers": {
    "sankhya-docs": {
      "command": "sankhya-mcp"
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
- *Como emitir boletos em lote?*
- *O que fazer quando uma OP está com quantidade incorreta?*

---

## Stack

- Python 3.12+
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) + FastMCP
- [sqlite-vec](https://github.com/asg017/sqlite-vec) — índice vetorial embutido
- [fastembed](https://github.com/qdrant/fastembed) — embeddings locais (sem API externa)
- Modelo: `paraphrase-multilingual-MiniLM-L12-v2` (384 dims, multilingual)

---

## Contribuindo

Este projeto é uma **iniciativa livre e aberta**. Qualquer pessoa pode contribuir — seja adicionando documentação, melhorando a qualidade da busca, corrigindo erros ou sugerindo novas funcionalidades.

**Como contribuir:**

- Abra uma [Issue](https://github.com/mfnogueira/sankhya-mcp/issues) para reportar erros ou sugerir melhorias
- Envie um Pull Request com novos documentos ou correções
- Compartilhe o projeto com outros usuários do Sankhya

---

## Status

Este projeto está em **fase inicial de desenvolvimento**. Em breve:

- Novas coleções de documentação
- Melhorias na qualidade da busca
- Suporte a mais módulos do Sankhya ERP

---

## Achou útil?

Se este projeto te ajudou, considere dar uma **estrela no GitHub** — isso ajuda outras pessoas a encontrarem o projeto!

[dar uma estrela no GitHub](https://github.com/mfnogueira/sankhya-mcp)
