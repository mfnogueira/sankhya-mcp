# Fluxo de Decisão: Edição/Exclusão de Apontamento de OP

## 📋 Sumário
1. [Contexto](#contexto)
2. [Pré-requisitos](#pré-requisitos)
3. [Fluxo de Decisão](#fluxo-de-decisão)
4. [Etapa 1: Reabrir OP](#etapa-1-reabrir-op)
5. [Etapa 2: Análise de Movimentações](#etapa-2-análise-de-movimentações)
6. [Etapa 3: Decisão e Ação](#etapa-3-decisão-e-ação)
7. [Queries de Referência](#queries-de-referência)
8. [Casos Práticos](#casos-práticos)
9. [Troubleshooting](#troubleshooting)

---

## 📖 Contexto

**Objetivo:** Definir procedimento padronizado para editar ou excluir apontamentos de Ordens de Produção (OP) no Sankhya ERP, considerando integridade de estoque e aspectos fiscais.

**Sistema:** Sankhya ERP - Oracle Database  
**Cliente:** EVODEN  
**Data de criação:** 09/02/2026  
**Autor:** Márcio - IT Specialist  
**Versão:** 1.0

---

## ✅ Pré-requisitos

### Conhecimentos Necessários
- ✅ Procedure `STP_REABRE_OP_EVO_V2` corrigida (ref: `Correcao_STP_REABRE_OP.md`)
- ✅ Estrutura de tabelas de produção (TPRIPROC, TPRIATV, TPRAPO, TPRAPA)
- ✅ Estrutura de notas fiscais (TGFCAB, TGFITE)
- ✅ SQL Oracle básico

### Documentos Relacionados
- `Correcao_STP_REABRE_OP.md` - Correção da procedure de reabertura
- `Sankhya_Guia_Correcao_Quantidades_OP_Apontamento_NotaFiscal.md` - Correção de valores

---

## 🔄 Fluxo de Decisão

```
┌─────────────────────────────────┐
│  Precisa editar/excluir         │
│  apontamento de OP?             │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  OP está Finalizada?            │
└────┬───────────────────┬────────┘
     │ NÃO               │ SIM
     │                   │
     ▼                   ▼
┌──────────┐      ┌─────────────────┐
│ Pode     │      │ ETAPA 1:        │
│ editar   │      │ Reabrir OP      │
│ direto   │      └────────┬────────┘
└──────────┘               │
                           ▼
                  ┌─────────────────┐
                  │ ETAPA 2:        │
                  │ Analisar        │
                  │ Movimentações   │
                  └────────┬────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ Houve movimentação     │
              │ de estoque depois?     │
              └────┬──────────────┬────┘
                   │ NÃO          │ SIM
                   │              │
                   ▼              ▼
           ┌──────────────┐  ┌──────────────┐
           │ CENÁRIO A    │  │ Verificar    │
           │ PODE EXCLUIR │  │ Status SEFAZ │
           └──────────────┘  └───┬──────┬───┘
                                 │      │
                            NULL │      │ 'A'
                                 │      │
                                 ▼      ▼
                         ┌──────────┐ ┌─────────┐
                         │CENÁRIO B │ │CENÁRIO C│
                         │Inventário│ │ Fiscal  │
                         └──────────┘ └─────────┘
```

---

## 🔓 Etapa 1: Reabrir OP

### Verificar Status da OP

```sql
SELECT 
    IDIPROC AS "OP",
    STATUSPROC AS "Status",
    DHTERMINO AS "Data Término",
    NUNOTA AS "Nota Vinculada"
FROM TPRIPROC 
WHERE IDIPROC = [NUMERO_OP];
```

**Status possíveis:**
- **A** = Aberta → Pode editar direto
- **F** = Finalizada → Precisa reabrir
- **C** = Cancelada → Não pode reabrir

---

### Reabrir OP (se necessário)

**Pré-requisito:** Procedure `STP_REABRE_OP_EVO_V2` deve estar corrigida conforme documento `Correcao_STP_REABRE_OP.md`

**Pelo sistema Sankhya:**
```
Menu → Produção → Ordens de Produção
→ Localizar a OP
→ Botão "Reabrir OP"
```

**Ou via SQL:**
```sql
-- Executar procedure de reabertura
CALL STP_REABRE_OP_EVO_V2([NUMERO_OP]);

-- Verificar se reabriu
SELECT IDIPROC, STATUSPROC, DHTERMINO 
FROM TPRIPROC 
WHERE IDIPROC = [NUMERO_OP];
-- Resultado esperado: STATUSPROC = 'A', DHTERMINO = NULL
```

---

## 🔍 Etapa 2: Análise de Movimentações

### Query de Análise Completa

```sql
-- ========================================
-- ANÁLISE DE APONTAMENTO PARA EDIÇÃO/EXCLUSÃO
-- ========================================
SELECT 
    'APONTAMENTO' AS SECAO,
    TO_CHAR(APO.NUAPO) AS INFO1,
    APO.SITUACAO AS INFO2,
    TO_CHAR(APO.DHAPO, 'DD/MM/YYYY HH24:MI') AS INFO3
FROM TPRAPO APO
WHERE APO.NUAPO = [NUMERO_APONTAMENTO]

UNION ALL

SELECT 
    'PRODUTO',
    TO_CHAR(APA.CODPRODPA) AS INFO1,
    TO_CHAR(APA.QTDAPONTADA) AS INFO2,
    APA.CONTROLEPA AS INFO3
FROM TPRAPA APA
WHERE APA.NUAPO = [NUMERO_APONTAMENTO]

UNION ALL

SELECT 
    'MOVIMENTAÇÕES',
    'Qtd Movimentada Depois' AS INFO1,
    TO_CHAR(NVL((SELECT SUM(ITE.QTDNEG) 
                 FROM TGFITE ITE 
                 INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
                 WHERE ITE.CODPROD = APA.CODPRODPA 
                   AND ITE.CONTROLE = APA.CONTROLEPA
                   AND CAB.DTNEG > APO.DHAPO), 0)) AS INFO2,
    NVL((SELECT MAX(CAB.STATUSNFE)
         FROM TGFITE ITE 
         INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
         WHERE ITE.CODPROD = APA.CODPRODPA 
           AND ITE.CONTROLE = APA.CONTROLEPA
           AND CAB.DTNEG > APO.DHAPO), 'NULL') AS INFO3
FROM TPRAPO APO
INNER JOIN TPRAPA APA ON APA.NUAPO = APO.NUAPO
WHERE APO.NUAPO = [NUMERO_APONTAMENTO]

UNION ALL

SELECT 
    'DECISÃO',
    CASE 
        WHEN (SELECT SUM(ITE.QTDNEG) 
              FROM TGFITE ITE 
              INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
              WHERE ITE.CODPROD = APA.CODPRODPA 
                AND ITE.CONTROLE = APA.CONTROLEPA
                AND CAB.DTNEG > APO.DHAPO) IS NULL 
        THEN 'CENÁRIO A - PODE EXCLUIR'
        WHEN (SELECT MAX(CAB.STATUSNFE)
              FROM TGFITE ITE 
              INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
              WHERE ITE.CODPROD = APA.CODPRODPA 
                AND ITE.CONTROLE = APA.CONTROLEPA
                AND CAB.DTNEG > APO.DHAPO) = 'A'
        THEN 'CENÁRIO C - SEFAZ/FISCAL'
        ELSE 'CENÁRIO B - INVENTÁRIO'
    END AS INFO1,
    '' AS INFO2,
    '' AS INFO3
FROM TPRAPO APO
INNER JOIN TPRAPA APA ON APA.NUAPO = APO.NUAPO
WHERE APO.NUAPO = [NUMERO_APONTAMENTO];
```

---

### Interpretação dos Resultados

| Resultado | Significado | Ação |
|-----------|-------------|------|
| **Qtd Movimentada = 0 ou NULL** | Produto não foi movimentado depois | → CENÁRIO A |
| **Qtd Movimentada > 0 + Status SEFAZ = NULL** | Movimentações internas (sem NFe) | → CENÁRIO B |
| **Qtd Movimentada > 0 + Status SEFAZ = 'A'** | Nota fiscal autorizada SEFAZ | → CENÁRIO C |

---

## 🎯 Etapa 3: Decisão e Ação

### CENÁRIO A: Pode Excluir/Editar ✅

**Condição:**
- Nenhuma movimentação posterior do produto
- OU movimentações apenas da própria OP

**Procedimento:**
```
Menu → Produção → Ordens de Produção
→ Localizar a OP
→ Aba "Apontamentos"
→ Selecionar o apontamento
→ Botão "Remover apontamentos selecionados"
```

**Validação:**
```sql
-- Confirmar que foi excluído
SELECT COUNT(*) 
FROM TPRAPO 
WHERE NUAPO = [NUMERO_APONTAMENTO];
-- Resultado esperado: 0
```

---

### CENÁRIO B: Ajuste por Inventário 📦

**Condição:**
- Produto foi movimentado em notas posteriores
- Notas **NÃO transmitidas à SEFAZ** (STATUSNFE = NULL ou ausente)

**Situação:**
- Sistema bloqueia exclusão do apontamento
- Produto já saiu do estoque (vendas, transferências, etc.)

**Opções de resolução:**

#### **Opção 1: Ajuste via Inventário** (Recomendado)
- Deixar apontamento original intacto
- Fazer ajuste de inventário para corrigir estoque
- Documentar motivo do ajuste

**Procedimento de inventário:**
```
[A DEFINIR - Procedimento específico da empresa]
Menu → Estoque → Inventário → [...]
- Registrar diferença
- Documentar causa raiz
- Obter aprovação necessária
```

#### **Opção 2: Nova OP para Saldo**
- Finalizar OP atual
- Abrir nova OP para consumir saldo remanescente
- Manter histórico correto

**Query para calcular saldo:**
```sql
SELECT 
    APA.CODPRODPA AS "Produto",
    APA.QTDAPONTADA AS "Qtd Apontada",
    (SELECT SUM(ITE.QTDNEG) 
     FROM TGFITE ITE 
     INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
     WHERE ITE.CODPROD = APA.CODPRODPA 
       AND ITE.CONTROLE = APA.CONTROLEPA
       AND CAB.DTNEG > APO.DHAPO) AS "Qtd Movimentada",
    APA.QTDAPONTADA - NVL((SELECT SUM(ITE.QTDNEG) 
                           FROM TGFITE ITE 
                           INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
                           WHERE ITE.CODPROD = APA.CODPRODPA 
                             AND ITE.CONTROLE = APA.CONTROLEPA
                             AND CAB.DTNEG > APO.DHAPO), 0) AS "Saldo Disponível"
FROM TPRAPO APO
INNER JOIN TPRAPA APA ON APA.NUAPO = APO.NUAPO
WHERE APO.NUAPO = [NUMERO_APONTAMENTO];
```

#### **Opção 3: Devolver para Controladoria**
- Finalizar OP novamente
- Documentar situação
- Deixar para controladoria decidir ajuste

---

### CENÁRIO C: Procedimento Fiscal 🚨

**Condição:**
- Produto foi movimentado em notas posteriores
- Notas **AUTORIZADAS na SEFAZ** (STATUSNFE = 'A')

**⚠️ ATENÇÃO:** Este cenário requer tratamento fiscal/contábil!

**NÃO PODE:**
- ❌ Excluir apontamento diretamente
- ❌ Alterar valores no banco sem autorização
- ❌ Cancelar notas autorizadas sem processo formal

**DEVE:**
1. **Parar o procedimento**
2. **Documentar a situação:**
   - Número do apontamento
   - Quantidade e produto envolvidos
   - Notas fiscais afetadas
   - Motivo da necessidade de ajuste

3. **Encaminhar para responsável fiscal/contábil**
   - [A DEFINIR: Nome/setor responsável]
   - [A DEFINIR: E-mail/telefone]
   - [A DEFINIR: Sistema de chamados?]

**Possíveis soluções fiscais:**
- Carta de Correção Eletrônica (CC-e) - para erros específicos
- Nota Complementar - para ajustes de valor
- Cancelamento formal da NFe (dentro do prazo legal)
- Nota de ajuste - conforme orientação do contador

**Query para documentação:**
```sql
-- Relatório completo para fiscal
SELECT 
    'APONTAMENTO' AS TIPO,
    TO_CHAR(APO.NUAPO) AS CODIGO,
    TO_CHAR(APO.DHAPO, 'DD/MM/YYYY HH24:MI') AS DATA,
    TO_CHAR(APA.QTDAPONTADA) AS QUANTIDADE
FROM TPRAPO APO
INNER JOIN TPRAPA APA ON APA.NUAPO = APO.NUAPO
WHERE APO.NUAPO = [NUMERO_APONTAMENTO]

UNION ALL

SELECT 
    'PRODUTO',
    TO_CHAR(APA.CODPRODPA),
    PRO.DESCRPROD,
    APA.CONTROLEPA
FROM TPRAPA APA
INNER JOIN TGFPRO PRO ON PRO.CODPROD = APA.CODPRODPA
WHERE APA.NUAPO = [NUMERO_APONTAMENTO]

UNION ALL

SELECT 
    'NFE AUTORIZADA',
    TO_CHAR(CAB.NUMNOTA),
    CAB.CHAVENFE,
    TO_CHAR(CAB.DTNEG, 'DD/MM/YYYY')
FROM TGFITE ITE
INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
WHERE ITE.CODPROD = (SELECT CODPRODPA FROM TPRAPA WHERE NUAPO = [NUMERO_APONTAMENTO])
  AND ITE.CONTROLE = (SELECT CONTROLEPA FROM TPRAPA WHERE NUAPO = [NUMERO_APONTAMENTO])
  AND CAB.DTNEG > (SELECT DHAPO FROM TPRAPO WHERE NUAPO = [NUMERO_APONTAMENTO])
  AND CAB.STATUSNFE = 'A'
ORDER BY TIPO;
```

---

## 📚 Queries de Referência

### Query 1: Listar Notas Vinculadas ao Apontamento

```sql
SELECT 
    APO.NUAPO AS "Apontamento",
    ITE.NUNOTA AS "Num Nota",
    CAB.NUMNOTA AS "NFe",
    CAB.STATUSNOTA AS "Status Nota",
    CAB.STATUSNFE AS "Status SEFAZ",
    CAB.DTNEG AS "Data",
    ITE.QTDNEG AS "Quantidade"
FROM TPRAPO APO
INNER JOIN TPRAPA APA ON APA.NUAPO = APO.NUAPO
INNER JOIN TGFITE ITE ON ITE.CODPROD = APA.CODPRODPA 
                     AND ITE.CONTROLE = APA.CONTROLEPA
INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
WHERE APO.NUAPO = [NUMERO_APONTAMENTO]
  AND CAB.DTNEG >= APO.DHAPO
ORDER BY CAB.DTNEG;
```

---

### Query 2: Verificar se OP Pode Ser Reaberta

```sql
SELECT 
    IPROC.IDIPROC AS "OP",
    IPROC.STATUSPROC AS "Status",
    IPROC.DHTERMINO AS "Finalizada Em",
    COUNT(IATV.IDIATV) AS "Qtd Atividades",
    SUM(CASE WHEN IATV.DHFINAL IS NOT NULL THEN 1 ELSE 0 END) AS "Atividades Finalizadas"
FROM TPRIPROC IPROC
LEFT JOIN TPRIATV IATV ON IATV.IDIPROC = IPROC.IDIPROC
WHERE IPROC.IDIPROC = [NUMERO_OP]
GROUP BY IPROC.IDIPROC, IPROC.STATUSPROC, IPROC.DHTERMINO;
```

---

### Query 3: Histórico Completo do Produto Apontado

```sql
SELECT 
    'Apontamento Original' AS ORIGEM,
    TO_CHAR(APO.DHAPO, 'DD/MM/YYYY HH24:MI') AS DATA,
    APA.QTDAPONTADA AS QUANTIDADE,
    'NUAPO: ' || APO.NUAPO AS REFERENCIA
FROM TPRAPO APO
INNER JOIN TPRAPA APA ON APA.NUAPO = APO.NUAPO
WHERE APO.NUAPO = [NUMERO_APONTAMENTO]

UNION ALL

SELECT 
    'Movimentação Posterior',
    TO_CHAR(CAB.DTNEG, 'DD/MM/YYYY'),
    ITE.QTDNEG,
    'NF: ' || CAB.NUMNOTA || ' (' || NVL(CAB.STATUSNFE, 'SEM SEFAZ') || ')'
FROM TGFITE ITE
INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
WHERE ITE.CODPROD = (SELECT CODPRODPA FROM TPRAPA WHERE NUAPO = [NUMERO_APONTAMENTO])
  AND ITE.CONTROLE = (SELECT CONTROLEPA FROM TPRAPA WHERE NUAPO = [NUMERO_APONTAMENTO])
  AND CAB.DTNEG > (SELECT DHAPO FROM TPRAPO WHERE NUAPO = [NUMERO_APONTAMENTO])
ORDER BY DATA;
```

---

## 💼 Casos Práticos

### Caso 1: Apontamento 120925 (Fevereiro/2026)

**Situação inicial:**
- OP finalizada, precisava editar apontamento
- Apontamento NUAPO = 120925
- Produto 3415, quantidade 20 unidades

**Análise realizada:**
```sql
-- Resultado da análise
SEÇÃO: APONTAMENTO | 120925 | C | 06/02/2026 15:04
SEÇÃO: PRODUTO | 3415 | 20 | (sem lote)
SEÇÃO: MOVIMENTAÇÕES | Qtd Movimentada Depois | 10 | NULL
SEÇÃO: DECISÃO | CENÁRIO B - INVENTÁRIO
```

**Interpretação:**
- ✅ OP foi reaberta com sucesso
- ❌ 10 unidades já foram movimentadas (notas 457370 e 457255)
- ✅ Notas não transmitidas à SEFAZ (STATUSNFE = NULL)
- 📊 **Cenário B aplicado**

**Resolução:**
- OP foi finalizada novamente
- Devolvida para produção
- Opções definidas:
  - Controladoria fará ajuste via inventário (se necessário)
  - OU abrir nova OP para consumir saldo de 10 unidades

**Lições aprendidas:**
- Sempre verificar movimentações ANTES de tentar excluir
- Consulta às movimentações é obrigatória no processo
- Inventário é solução para casos com notas internas

---

### Caso 2: Template para Novos Casos

**[TÍTULO DO CASO - Data]**

**Situação inicial:**
- [Descrever problema]
- OP: [número]
- Apontamento: [número]
- Produto: [código] - [quantidade]

**Análise realizada:**
```sql
-- Resultado da query de análise
[colar resultado aqui]
```

**Interpretação:**
- [Cenário identificado: A, B ou C]
- [Movimentações encontradas]
- [Status SEFAZ]

**Resolução:**
- [Ação tomada]
- [Responsável]
- [Data de conclusão]

**Lições aprendidas:**
- [Pontos importantes]

---

## 🔧 Troubleshooting

### Problema 1: OP Não Reabre

**Sintoma:** Procedure STP_REABRE_OP_EVO_V2 retorna erro

**Causa provável:** Procedure não foi corrigida

**Solução:**
1. Verificar se procedure foi atualizada conforme `Correcao_STP_REABRE_OP.md`
2. Verificar filtros `APONTAPA = 'S'` foram removidos
3. Recompilar procedure

**Query de verificação:**
```sql
-- Ver código da procedure
SELECT TEXT 
FROM USER_SOURCE 
WHERE NAME = 'STP_REABRE_OP_EVO_V2' 
  AND TYPE = 'PROCEDURE'
ORDER BY LINE;
```

---

### Problema 2: Sistema Bloqueia Exclusão Sem Erro Claro

**Sintoma:** Botão "Remover" não funciona ou não aparece

**Causa provável:** Movimentações posteriores do produto

**Solução:**
1. Executar query de análise de movimentações
2. Identificar cenário (A, B ou C)
3. Seguir procedimento do cenário correto

---

### Problema 3: Query de Movimentações Retorna Erro

**Sintoma:** `ORA-00904: identificador inválido` em campos de estoque

**Causa:** Tentativa de usar TGFEST.DTMOV que não existe

**Solução:** Usar TGFITE + TGFCAB.DTNEG ao invés de TGFEST.DTMOV

**Query corrigida:**
```sql
-- ❌ ERRADO
SELECT EST.DTMOV FROM TGFEST EST...

-- ✅ CORRETO
SELECT CAB.DTNEG 
FROM TGFITE ITE
INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA...
```

---

### Problema 4: Não Sabe Qual Cenário Aplicar

**Sintoma:** Dúvida entre Cenário B e C

**Solução:** Verificar coluna STATUSNFE

```sql
-- Verificação rápida
SELECT 
    ITE.NUNOTA,
    CAB.NUMNOTA,
    CAB.STATUSNFE,
    CASE 
        WHEN CAB.STATUSNFE = 'A' THEN 'CENÁRIO C - FISCAL'
        WHEN CAB.STATUSNFE IS NULL THEN 'CENÁRIO B - INVENTÁRIO'
        ELSE 'VERIFICAR'
    END AS CENARIO
FROM TGFITE ITE
INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
WHERE ITE.CODPROD = [CODIGO_PRODUTO]
  AND ITE.CONTROLE = [LOTE]
ORDER BY CAB.DTNEG DESC;
```

---

## 📊 Resumo - Tabela de Decisão Rápida

| Situação | Movim. Posterior? | Status SEFAZ | Cenário | Ação |
|----------|------------------|--------------|---------|------|
| OP Aberta | N/A | N/A | - | Editar direto |
| OP Finalizada + Sem movim. | Não | N/A | A | Reabrir → Excluir |
| OP Finalizada + Com movim. | Sim | NULL | B | Inventário |
| OP Finalizada + Com movim. | Sim | 'A' | C | Fiscal |

---

## ⚠️ Avisos Importantes

### Segurança de Dados
- ✅ Sempre fazer backup antes de alterações críticas
- ✅ Usar ROLLBACK para testes, COMMIT só após verificação
- ✅ Documentar todas as alterações realizadas

### Integridade Fiscal
- 🚨 **NUNCA alterar notas autorizadas na SEFAZ sem orientação fiscal**
- 🚨 **SEMPRE consultar contador antes de cenário C**
- 🚨 **Documentar motivo de todos os ajustes de inventário**

### Boas Práticas
- 📋 Executar query de análise ANTES de qualquer ação
- 📋 Seguir fluxo de decisão rigorosamente
- 📋 Documentar casos especiais para referência futura
- 📋 Manter comunicação com produção e controladoria

---

## 📝 Histórico de Versões

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 09/02/2026 | Márcio | Criação inicial do documento |

---

## 🔗 Referências

- `Correcao_STP_REABRE_OP.md` - Correção da procedure de reabertura de OP
- `Sankhya_Guia_Correcao_Quantidades_OP_Apontamento_NotaFiscal.md` - Guia de correção de valores
- `documentacao_correcao_valorerradoOP_sankhya.md` - Documentação de caso real de correção

---

**Documento criado em:** 09/02/2026  
**Empresa:** EVODEN  
**Sistema:** Sankhya ERP - Oracle Database  
**Responsável:** Márcio - IT Specialist  
**Status:** ✅ Ativo
