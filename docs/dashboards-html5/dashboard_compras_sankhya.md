# Dashboard de Necessidade de Compras — Sankhya ERP
**Documentação Técnica Completa**

> **Projeto:** Dashboard de Necessidade de Compras  
> **ERP:** Sankhya (Oracle Database)  
> **Data:** Fevereiro/2026  
> **Responsável:** Márcio — Data Scientist / RankMyApp  

---

## Índice

1. [Objetivo](#1-objetivo)
2. [Estrutura de Dados Mapeada](#2-estrutura-de-dados-mapeada)
3. [Diagnóstico — Problema de Duplicação](#3-diagnóstico--problema-de-duplicação)
4. [Correção da Duplicação](#4-correção-da-duplicação)
5. [Auditoria das Queries do Dashboard](#5-auditoria-das-queries-do-dashboard)
6. [Parâmetros do Dashboard](#6-parâmetros-do-dashboard)
7. [Fluxo de Desenvolvimento com Parâmetros](#7-fluxo-de-desenvolvimento-com-parâmetros)
8. [Query Principal — Versão de Teste](#8-query-principal--versão-de-teste)
9. [Query Principal — Versão Final com Parâmetros](#9-query-principal--versão-final-com-parâmetros)
10. [Queries Auxiliares do Dashboard](#10-queries-auxiliares-do-dashboard)
11. [Débitos Técnicos Registrados](#11-débitos-técnicos-registrados)
12. [Pendências de Processo](#12-pendências-de-processo)
13. [Resultado Validado](#13-resultado-validado)

---

## 1. Objetivo

Desenvolver um dashboard de necessidade de compras dentro do ERP Sankhya para apoiar o time de suprimentos na tomada de decisão, exibindo:

- Estoque atual vs estoque mínimo
- Necessidade de compra por produto
- Pedidos pendentes de fornecedores
- Cobertura de estoque projetada
- Ruptura estimada em dias
- Alertas visuais por cor para produtos críticos

---

## 2. Estrutura de Dados Mapeada

### Tabelas Principais Utilizadas

| Tabela | Descrição | Chave Principal |
|---|---|---|
| `TGFCAB` | Cabeçalho de notas fiscais e pedidos | `NUNOTA` |
| `TGFITE` | Itens das notas e pedidos | `NUNOTA + SEQUENCIA` |
| `TGFPRO` | Cadastro de produtos | `CODPROD` |
| `TGFEST` | Estoque por local e lote | `CODEMP + CODLOCAL + CODPROD + CONTROLE` |
| `TGFTOP` | Tipos de operação (histórica) | `CODTIPOPER + DHALTER` |
| `TGFGRU` | Grupos de produtos | `CODGRUPOPROD` |
| `TGFLOC` | Locais de estoque | `CODLOCAL` |
| `TGFPAR` | Parceiros / fornecedores | `CODPARC` |
| `TGFVAR` | Variações entre documentos (pedido → NF) | `NUNOTA + SEQUENCIA` |
| `TGFFIN` | Financeiro / títulos | `NUFIN` |
| `TGFVOA` | Volumes alternativos (conversão de unidades) | `CODPROD + CODVOL` |
| `AD_PARPROD` | Tabela customizada — parceiros por produto | `CODPARC + CODPROD` |
| `TDDOPC` | Dicionário de opções (descrições de campos) | `NUCAMPO + VALOR` |
| `TDDCAM` | Dicionário de campos | `NUCAMPO` |

### Campos Críticos

**TGFCAB:**
- `TIPMOV` — tipo de movimento: `'O'` = Pedido, `'C'` = Compra, `'V'` = Venda
- `STATUSNOTA` — status: `'L'` = Liberado
- `DTNEG` — data de negociação
- `DTENTSAI` — data de entrada/saída física
- `DHTIPOPER` — versão histórica da TOP usada na nota

**TGFITE:**
- `CODVOL` — unidade de medida do item lançado
- `QTDNEG` — quantidade negociada
- `QTDENTREGUE` — quantidade já entregue
- `PENDENTE` — `'S'` = item com saldo pendente

**TGFTOP:**
- `DHALTER` — chave histórica — **sempre usar com `CAB.DHTIPOPER` para evitar multiplicação de linhas**

**TGFEST:**
- `CODPARC` — quando diferente de 0, indica estoque em poder de terceiros
- `CONTROLE` — identificador de lote

### Funções UDF Utilizadas

| Função | Descrição |
|---|---|
| `GUT_QTDEVOL_COM(codprod, qtd, codvol)` | Converte quantidade para a unidade padrão do produto |
| `EVO_GET_CONSUMO_PROD(codprod, meses)` | Retorna consumo total nos últimos N meses |
| `FC_GETAVGSAIDA_EVO(codprod, meses)` | Retorna média de saída mensal nos últimos N meses |

---

## 3. Diagnóstico — Problema de Duplicação

### Sintoma
O produto **50904 (RÓTULO PO TERMODEN 250G/500G)** aparecia em duas linhas no dashboard.

### Investigação

**Query de diagnóstico executada:**
```sql
SELECT
    ITE.CODPROD,
    PRO.DESCRPROD,
    COUNT(DISTINCT ITE.CODVOL) AS QTD_UNIDADES,
    LISTAGG(DISTINCT ITE.CODVOL, ' | ') AS UNIDADES,
    COUNT(DISTINCT CAB.NUNOTA) AS QTD_PEDIDOS
FROM TGFITE ITE
INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
INNER JOIN TGFPRO PRO ON PRO.CODPROD = ITE.CODPROD
WHERE CAB.TIPMOV = 'O'
  AND ITE.PENDENTE = 'S'
  AND CAB.STATUSNOTA = 'L'
GROUP BY ITE.CODPROD, PRO.DESCRPROD
HAVING COUNT(DISTINCT ITE.CODVOL) > 1
```

**Resultado:**
```
CODPROD  DESCRPROD                        QTD_UN  UNIDADES   QTD_PEDIDOS
26827    ROTULO PO EVOLAY 50G             2       MI | UN    1001
31854    ROTULO CREATE - VEIA             2       MI | UN    2002
50904    ROTULO PO TERMODEN 250G/500G     2       MI | UN    48010
```

### Causa Raiz

A CTE `PEDIDO_PENDENTE` agrupava por `ITE.CODPROD, ITE.CODVOL`. Produtos com pedidos lançados em **MI (Milheiro)** e **UN (Unidade)** geravam duas linhas separadas. O `LEFT JOIN` principal por `CODPROD` retornava ambas, duplicando o produto no dashboard.

### Análise dos Pedidos em UN

Pedidos identificados com lançamento incorreto em UN:

| Produto | NUNOTA | CODVOL | QTDNEG | Fornecedor | Data |
|---|---|---|---|---|---|
| 26827 | 212479 | UN | 1 | — | 2025-01-03 |
| 50904 | 205008 | UN | 4 | J Andrade's | 2024-12-03 |
| 50904 | 205001 | UN | 6 | J Andrade's | 2024-12-03 |

**Conclusão:** pedidos de 1, 4 e 6 unidades de rótulo são erros de lançamento — o operador digitou a quantidade em MI mas selecionou UN como unidade.

### Mapeamento de Unidades — Universo Afetado

- 24 produtos do grupo Embalagem (`USOPROD = 'E'`) com pedidos em MI mas cadastro em UN
- 23 desses produtos possuem fator de conversão cadastrado na `TGFVOA`: `1 MI = 1.000 UN`
- **Produto 50904: SEM fator de conversão cadastrado na TGFVOA** — débito de cadastro

---

## 4. Correção da Duplicação

### Decisão Adotada
Exibir apenas a linha em UN, ocultando pedidos lançados em MI.

### Alterações na CTE `PEDIDO_PENDENTE`

**Antes:**
```sql
PEDIDO_PENDENTE AS (
    SELECT
        ITE.CODPROD,
        ITE.CODVOL,  -- causava duplicação
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDNEG, ITE.CODVOL))
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END AS QTD_ORIGINAL_PEDIDO,
        ...
    FROM TGFITE ITE
    INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
    WHERE CAB.TIPMOV = 'O'
      AND ITE.PENDENTE = 'S'
      AND CAB.STATUSNOTA = 'L'
    GROUP BY ITE.CODPROD, ITE.CODVOL  -- agrupamento por unidade gerava duas linhas
)
```

**Depois — duas correções simultâneas:**
```sql
PEDIDO_PENDENTE AS (
    SELECT
        ITE.CODPROD,
        -- CASE WHEN movido para DENTRO do SUM() — corrige ORA-00979
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDNEG, ITE.CODVOL)
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END) AS QTD_ORIGINAL_PEDIDO,
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDENTREGUE, ITE.CODVOL)
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END) AS QTD_ENTREGUE,
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDNEG - ITE.QTDENTREGUE, ITE.CODVOL)
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END) AS QTD_PENDENTE
    FROM TGFITE ITE
    INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
    WHERE CAB.TIPMOV = 'O'
      AND ITE.PENDENTE = 'S'
      AND CAB.STATUSNOTA = 'L'
      AND ITE.CODVOL != 'MI'  -- exclui pedidos lançados em MI — elimina duplicação
    GROUP BY ITE.CODPROD       -- agrupamento apenas por produto
)
```

### Erro ORA-00979 — Origem e Solução

Ao remover `ITE.CODVOL` do `GROUP BY`, o Oracle passou a reclamar do `CASE WHEN ITE.CODVOL` que estava **fora** do `SUM()`. O campo `CODVOL` não estava mais agrupado e não pode ser referenciado fora de uma função de agregação.

**Regra:** quando um campo não está no `GROUP BY`, ele só pode aparecer dentro de funções de agregação como `SUM()`, `MAX()`, `COUNT()` etc.

```sql
-- ERRADO — CODVOL fora do SUM sem estar no GROUP BY
SUM(GUT_QTDEVOL_COM(...)) * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END

-- CORRETO — CODVOL dentro do SUM
SUM(GUT_QTDEVOL_COM(...) * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END)
```

---

## 5. Auditoria das Queries do Dashboard

O dashboard é composto por 4 queries. Todas foram auditadas.

### 5.1 Query Principal — NECESSIDADE_COMPRAS_V4

| Ponto | Status |
|---|---|
| Estrutura de CTEs | Correto |
| Conversão de unidades MI/UN | Correto após correção |
| Duplicação por CODVOL | **Corrigido** |
| ORA-00979 CASE WHEN fora do SUM | **Corrigido** |

### 5.2 Query Estoque por Local

**Correção aplicada:** remoção da tabela `TGFPRO` que era desnecessária — o filtro foi movido diretamente para `TGFEST`.

```sql
-- Antes
FROM TGFPRO PRO
LEFT JOIN TGFEST EST ON PRO.CODPROD = EST.CODPROD AND EST.ESTOQUE > 0
LEFT JOIN TGFLOC LOC ON EST.CODLOCAL = LOC.CODLOCAL
WHERE PRO.CODPROD = :A_CODPROD

-- Depois
FROM TGFEST EST
LEFT JOIN TGFLOC LOC ON LOC.CODLOCAL = EST.CODLOCAL
WHERE EST.CODPROD = :A_CODPROD
  AND EST.ESTOQUE > 0
```

**Débitos registrados** (não aplicados — risco nulo, aguardando acompanhamento):
- `ESTFINAL` sem `NVL` em `RESERVADO` — pode retornar NULL
- `EST_TERCEIRO` sem `NVL` em `CODPARC` — comportamento inconsistente com NULL

### 5.3 Query Pedidos Pendentes

**Débitos registrados:**
- JOIN `TGFTOP` sem `DHALTER` na parte COMPRA — risco de duplicação futura se TOP for reparametrizada
- CTE `VAR_ORIGEM` sem filtro de `TIPMOV` — impacto de performance
- `GUT_QTDEVOL_COM` via `SELECT FROM DUAL` — overhead desnecessário por linha

### 5.4 Query Parceiros do Produto

**Débitos registrados:**
- JOIN `TGFTOP` sem `DHALTER` — mesmo risco da query anterior
- CTE `FIN_PENDENTE` sem filtro de parceiro — processa `TGFFIN` inteira
- `SUM(DISTINCT)` em `QTDENTREGUE` — pode subavaliar total em entregas com quantidades iguais

---

## 6. Parâmetros do Dashboard

### Como Funcionam

No Sankhya, parâmetros são variáveis declaradas na interface do dashboard e injetadas diretamente na query SQL em tempo de execução. Na query usa-se a notação `:NOME_PARAMETRO` e o Sankhya substitui pelo valor selecionado pelo usuário no filtro.

### Parâmetros da Query Principal

| Id | Descrição | Tipo Sankhya | Uso na Query | Obrigatório |
|---|---|---|---|---|
| `P_PERC` | % Ajuste Necessidade | Número Decimal (2 casas) | `= :P_PERC` | Sim |
| `P_MESES` | Meses anteriores para Análise | Número Inteiro (1 a 30) | `= :P_MESES` | Sim |
| `P_MESES_COBERTURA` | Meses para projeção de Cobertura | Número Inteiro | `= :P_MESES_COBERTURA` | Não |
| `P_USOPROD` | Uso do Produto | Multi List SQL | `IN :P_USOPROD` | Sim |
| `P_LOCAIS` | Locais de estoque | Multi List SQL | `IN :P_LOCAIS` | Sim |
| `P_CODPROD` | Código do Produto | Número Inteiro | `= :P_CODPROD` | Não |
| `P_GRUPOPROD` | Código do Grupo | Número Inteiro | `= :P_GRUPOPROD` | Não |
| `P_EST_BAIXO` | Estoque abaixo do mínimo? | Verdadeiro/Falso | `= :P_EST_BAIXO` | Não |

### SQL dos Parâmetros Multi List

**P_LOCAIS:**
```sql
SELECT CODLOCAL AS VALUE,
       CODLOCAL || ' - ' || DESCRLOCAL AS LABEL
FROM TGFLOC
WHERE ANALITICO = 'S'
UNION ALL
SELECT NULL AS VALUE, NULL AS LABEL FROM DUAL
ORDER BY 1
```

**P_USOPROD:**
```sql
SELECT VALOR AS VALUE,
       OPCAO AS LABEL
FROM TDDOPC
WHERE NUCAMPO = (
    SELECT NUCAMPO FROM TDDCAM
    WHERE NOMETAB = 'TGFPRO' AND NOMECAMPO = 'USOPROD'
)
ORDER BY 1
```

### Tabela de Equivalência — Query vs Teste Manual

| Parâmetro | Na query | No teste manual | Observação |
|---|---|---|---|
| `P_MESES` | `:P_MESES` | `3` | Valor direto |
| `P_PERC` | `:P_PERC` | `10` | Valor direto |
| `P_USOPROD` | `IN :P_USOPROD` | `IN ('E')` | Multi List — exige parênteses |
| `P_LOCAIS` | `IN :P_LOCAIS` | `IN (1001,5001,...)` | Multi List — exige parênteses |
| `P_EST_BAIXO` | `:P_EST_BAIXO` | `0` | 1 = verdadeiro / 0 = falso |
| `P_CODPROD` | `(:P_CODPROD IS NULL)` | `50904` ou omitir | Opcional |
| `P_GRUPOPROD` | `(:P_GRUPOPROD IS NULL)` | `NULL` ou omitir | Opcional |

### Parâmetros Opcionais — Padrão de Escrita

Parâmetros opcionais usam o padrão `OR :PARAM IS NULL` para retornar todos os registros quando o usuário não preenche o filtro:

```sql
AND ((PRO.CODPROD = :P_CODPROD) OR (:P_CODPROD IS NULL))
```

- **Com valor preenchido:** filtra apenas o produto informado
- **Sem valor preenchido:** `NULL IS NULL = TRUE` — sem filtro, retorna todos

---

## 7. Fluxo de Desenvolvimento com Parâmetros

Este é o padrão recomendado para desenvolvimento de queries no Sankhya. Elimina erros antes de entrar na interface do ERP, que tem debugging limitado.

```
ETAPA 1 — Escrever a query com valores fixos
    └── Usar dados reais conhecidos
    └── Ex: AND PRO.CODPROD = 50904

ETAPA 2 — Testar e validar no DBExplorer
    └── Executar CTE por CTE em caso de erro
    └── Validar resultado linha a linha
    └── Garantir ausência de duplicações

ETAPA 3 — Substituir valores fixos por :PARAMETROS
    └── Ex: AND PRO.CODPROD = :P_CODPROD
    └── Atentar ao tipo: Multi List exige IN :PARAM (sem parênteses na query)

ETAPA 4 — Criar os parâmetros no Sankhya
    └── Definir tipo correto (Inteiro, Decimal, Multi List, Verdadeiro/Falso)
    └── Definir SQL para Multi List
    └── Marcar Requerido conforme necessidade

ETAPA 5 — Salvar e testar no dashboard
    └── Testar com cada combinação de parâmetros
    └── Validar alertas de cor
    └── Validar produtos com e sem pedidos pendentes
```

**Vantagem:** na Etapa 3 a query já está comprovadamente correta. A substituição pelos parâmetros é mecânica e não introduz novos erros de lógica.

---

## 8. Query Principal — Versão de Teste

Versão com valores fixos para execução direta no DBExplorer. Produto de referência: **50904**.

```sql
WITH
BASE_PRODUTO AS (
    SELECT
        PRO.CODPROD,
        PRO.DESCRPROD,
        PRO.USOPROD,
        PRO.ESTMIN,
        PRO.ESTMAX,
        PRO.CODVOL,
        GRU.CODGRUPOPROD,
        GRU.DESCRGRUPOPROD,
        SUM(NVL(EST.ESTOQUE,  0))                       AS ESTOQUE_ATUAL,
        SUM(NVL(EST.RESERVADO,0))                       AS RESERVADO,
        SUM(NVL(EST.ESTOQUE,0) - NVL(EST.RESERVADO,0)) AS ESTOQUE_FINAL,
        CASE
            WHEN SUM(NVL(EST.ESTOQUE,0)) >= NVL(PRO.ESTMIN,0) THEN 0
            ELSE NVL(PRO.ESTMIN,0) - SUM(NVL(EST.ESTOQUE,0))
        END AS NECESSIDADE_EMIN
    FROM TGFPRO PRO
    LEFT JOIN TGFEST EST ON  PRO.CODPROD  = EST.CODPROD
                         AND EST.CODPARC  = 0
                         AND EST.ESTOQUE  > 0
                         AND EST.CODLOCAL IN (1001,5001,6001,7001,8001,9001,15005)
    LEFT JOIN TGFGRU GRU ON PRO.CODGRUPOPROD = GRU.CODGRUPOPROD
    WHERE PRO.ATIVO   = 'S'
      AND PRO.USOPROD IN ('E')
      AND PRO.CODPROD = 50904
    GROUP BY
        PRO.CODPROD, PRO.DESCRPROD, PRO.USOPROD,
        PRO.ESTMIN,  PRO.ESTMAX,    PRO.CODVOL,
        GRU.CODGRUPOPROD, GRU.DESCRGRUPOPROD
),

ESTOQUE_CALCULADO AS (
    SELECT
        B.CODPROD, B.DESCRPROD, B.USOPROD,
        (
            SELECT O.OPCAO FROM TDDOPC O
            WHERE O.VALOR   = B.USOPROD
              AND O.NUCAMPO = (SELECT CAM.NUCAMPO FROM TDDCAM CAM
                               WHERE CAM.NOMETAB = 'TGFPRO' AND CAM.NOMECAMPO = 'USOPROD')
        ) AS DESCRUSOPROD,
        B.ESTMIN, B.ESTMAX, B.CODVOL,
        (
            SELECT ROUND(AVG(CAB.DTENTSAI - ORIG.DTNEG), 0) * 1.0
            FROM TGFVAR VAR
            INNER JOIN TGFCAB ORIG ON VAR.NUNOTAORIG = ORIG.NUNOTA AND ORIG.TIPMOV = 'O'
            INNER JOIN TGFCAB CAB  ON VAR.NUNOTA = CAB.NUNOTA AND CAB.TIPMOV = 'C'
                                   AND CAB.DTENTSAI IS NOT NULL AND CAB.CODEMP = 1
            INNER JOIN TGFITE ITE  ON CAB.NUNOTA = ITE.NUNOTA AND ITE.CODPROD = B.CODPROD
            WHERE VAR.NUNOTA <> VAR.NUNOTAORIG
        ) AS LEADTIME,
        B.CODGRUPOPROD, B.DESCRGRUPOPROD,
        B.ESTOQUE_ATUAL, B.RESERVADO, B.ESTOQUE_FINAL, B.NECESSIDADE_EMIN
    FROM BASE_PRODUTO B
),

CALCULOS_SAIDA AS (
    SELECT
        ESTPRO.CODPROD,
        ROUND(EVO_GET_CONSUMO_PROD(ESTPRO.CODPROD, 3), 2) AS QT_TOTAL_SAIDA,
        ROUND(FC_GETAVGSAIDA_EVO(ESTPRO.CODPROD, 3), 2)   AS QT_MEDIA_SAIDA
    FROM TGFPRO ESTPRO
    WHERE ESTPRO.ATIVO   = 'S'
      AND ESTPRO.USOPROD IN ('E')
      AND ESTPRO.CODPROD = 50904
),

PEDIDO_PENDENTE AS (
    SELECT
        ITE.CODPROD,
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDNEG, ITE.CODVOL)
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END) AS QTD_ORIGINAL_PEDIDO,
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDENTREGUE, ITE.CODVOL)
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END) AS QTD_ENTREGUE,
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDNEG - ITE.QTDENTREGUE, ITE.CODVOL)
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END) AS QTD_PENDENTE
    FROM TGFITE ITE
    INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
    WHERE CAB.TIPMOV = 'O' AND ITE.PENDENTE = 'S' AND CAB.STATUSNOTA = 'L'
      AND ITE.CODVOL != 'MI'
    GROUP BY ITE.CODPROD
),

ULTIMO_RECEBIMENTO AS (
    SELECT
        PP.CODPROD,
        SUM((
            SELECT DISTINCT SUM(NVL(ITE2.QTDENTREGUE,0))
            FROM AD_PARPROD PP_INNER
            LEFT JOIN TGFITE ITE  ON ITE.CODPROD   = PP_INNER.CODPROD
            LEFT JOIN TGFCAB CAB  ON ITE.NUNOTA     = CAB.NUNOTA AND PP_INNER.CODPARC = CAB.CODPARC
            LEFT JOIN TGFTOP TOP  ON CAB.CODTIPOPER = TOP.CODTIPOPER
            LEFT JOIN TGFVAR VAR  ON VAR.NUNOTA     = CAB.NUNOTA AND VAR.SEQUENCIA = ITE.SEQUENCIA
            LEFT JOIN TGFITE ITE2 ON ITE2.NUNOTA    = VAR.NUNOTAORIG AND ITE2.SEQUENCIA = VAR.SEQUENCIAORIG
            WHERE PP_INNER.CODPARC = PP.CODPARC AND PP_INNER.CODPROD = PP.CODPROD
              AND TOP.TIPMOV = 'C' AND CAB.AD_DTCONFIRM IS NULL
              AND CAB.DTNEG = (
                    SELECT MAX(CAB_MAX.DTNEG) FROM TGFCAB CAB_MAX
                    INNER JOIN TGFITE ITE_MAX ON ITE_MAX.NUNOTA     = CAB_MAX.NUNOTA
                    INNER JOIN TGFTOP TOP_MAX ON CAB_MAX.CODTIPOPER = TOP_MAX.CODTIPOPER
                    WHERE CAB_MAX.CODPARC = PP_INNER.CODPARC
                      AND ITE_MAX.CODPROD = PP_INNER.CODPROD AND TOP_MAX.TIPMOV = 'C')
        )) AS QTD_ULTIMO_RECEBIMENTO
    FROM AD_PARPROD PP
    WHERE PP.CODPARC <> 296
    GROUP BY PP.CODPROD
)

SELECT
    E.CODPROD,
    E.DESCRPROD                                                                          AS PRODUTO,
    E.USOPROD                                                                            AS COD_USO,
    E.DESCRUSOPROD                                                                       AS USO,
    E.CODVOL                                                                             AS COD_VOLUME,
    E.LEADTIME,
    E.ESTMIN           * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                 AS EST_MINIMO,
    E.ESTMAX           * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                 AS EST_MAXIMO,
    E.ESTOQUE_ATUAL    * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                 AS ESTOQUE_ATUAL,
    E.RESERVADO        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                 AS RESERVADO,
    E.ESTOQUE_FINAL    * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                 AS ESTOQUE_FINAL,
    E.NECESSIDADE_EMIN * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                 AS NECESSIDADE_EMIN,
    E.CODGRUPOPROD,
    E.DESCRGRUPOPROD,
    E.NECESSIDADE_EMIN + (E.NECESSIDADE_EMIN * (10 / 100))
        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                                AS NECESSIDADE_AJUSTE,
    '3 Meses'                                                                            AS PERIODO_ANALISADO,
    '6 Meses'                                                                            AS PERIODO_COBERTURA,
    C.QT_TOTAL_SAIDA   * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                 AS QT_TOTAL_SAIDA,
    C.QT_MEDIA_SAIDA   * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                 AS QT_MEDIA_SAIDA,
    ROUND((C.QT_TOTAL_SAIDA / (3 * 22)), 2)
        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                                AS QT_MEDIA_DIA,
    ROUND((C.QT_TOTAL_SAIDA / (3 * 22)) * (6 * 22), 2)
        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                                AS NECESSIDADE_COBERTURA,
    ROUND(E.ESTOQUE_FINAL / NULLIF((C.QT_TOTAL_SAIDA / (3 * 22)), 0), 0)                AS RUPTURA_EM_DIAS,
    PP.QTD_ORIGINAL_PEDIDO * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END             AS QTD_ORIGINAL_PEDIDO,
    PP.QTD_ENTREGUE        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END             AS QTD_ENTREGUE,
    PP.QTD_PENDENTE        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END             AS QTD_PENDENTE,
    CASE WHEN (E.ESTOQUE_FINAL + NVL(PP.QTD_PENDENTE,0) + NVL(UR.QTD_ULTIMO_RECEBIMENTO,0)) < E.ESTMIN
        THEN '#FFCCCC' END AS BKCOLOR,
    CASE WHEN (E.ESTOQUE_FINAL + NVL(PP.QTD_PENDENTE,0) + NVL(UR.QTD_ULTIMO_RECEBIMENTO,0)) < E.ESTMIN
        THEN '#990000' END AS FGCOLOR
FROM ESTOQUE_CALCULADO E
INNER JOIN CALCULOS_SAIDA C      ON E.CODPROD = C.CODPROD
LEFT JOIN  PEDIDO_PENDENTE PP    ON E.CODPROD = PP.CODPROD
LEFT JOIN  ULTIMO_RECEBIMENTO UR ON E.CODPROD = UR.CODPROD
WHERE NVL(E.ESTMIN, 0) >= CASE WHEN 0 = 1
    THEN (E.ESTOQUE_FINAL + NVL(PP.QTD_PENDENTE,0) + NVL(UR.QTD_ULTIMO_RECEBIMENTO,0))
    ELSE 0 END
ORDER BY E.CODPROD
```

---

## 9. Query Principal — Versão Final com Parâmetros

Versão para uso no Sankhya com todos os parâmetros dinâmicos restaurados.

```sql
----------------------------------------------------------------------------------
-- NECESSIDADE DE COMPRAS - V4 - OTIMIZADO
-- Data de Otimização: 10/11/2025
-- Correção duplicação MI/UN: 13/02/2026
----------------------------------------------------------------------------------

/*
  Parâmetros:
  :P_PERC              - Percentual de Ajuste (ex: 10 para 10%)
  :P_MESES             - Meses para Análise de Saída (Histórico)
  :P_MESES_COBERTURA   - Meses para Cobertura de Estoque (Meta)
  :P_USOPROD           - Uso do Produto (Filtro Multi List)
  :P_LOCAIS            - Locais de Estoque (Filtro Multi List)
  :P_CODPROD           - Código do Produto (Filtro opcional)
  :P_GRUPOPROD         - Código do Grupo de Produto (Filtro opcional)
  :P_EST_BAIXO         - Exibir apenas estoque abaixo do mínimo (S/N)
*/

WITH
BASE_PRODUTO AS (
    SELECT
        PRO.CODPROD,
        PRO.DESCRPROD,
        PRO.USOPROD,
        PRO.ESTMIN,
        PRO.ESTMAX,
        PRO.CODVOL,
        GRU.CODGRUPOPROD,
        GRU.DESCRGRUPOPROD,
        SUM(NVL(EST.ESTOQUE,  0))                       AS ESTOQUE_ATUAL,
        SUM(NVL(EST.RESERVADO,0))                       AS RESERVADO,
        SUM(NVL(EST.ESTOQUE,0) - NVL(EST.RESERVADO,0)) AS ESTOQUE_FINAL,
        CASE
            WHEN SUM(NVL(EST.ESTOQUE,0)) >= NVL(PRO.ESTMIN,0) THEN 0
            ELSE NVL(PRO.ESTMIN,0) - SUM(NVL(EST.ESTOQUE,0))
        END AS NECESSIDADE_EMIN
    FROM TGFPRO PRO
    LEFT JOIN TGFEST EST ON  PRO.CODPROD  = EST.CODPROD
                         AND EST.CODPARC  = 0
                         AND EST.ESTOQUE  > 0
                         AND EST.CODLOCAL IN :P_LOCAIS
    LEFT JOIN TGFGRU GRU ON PRO.CODGRUPOPROD = GRU.CODGRUPOPROD
    WHERE PRO.ATIVO   = 'S'
      AND PRO.USOPROD IN :P_USOPROD
      AND ((PRO.CODPROD = :P_CODPROD) OR (:P_CODPROD IS NULL))
      AND ((PRO.CODGRUPOPROD = :P_GRUPOPROD) OR (:P_GRUPOPROD IS NULL))
    GROUP BY
        PRO.CODPROD, PRO.DESCRPROD, PRO.USOPROD,
        PRO.ESTMIN,  PRO.ESTMAX,    PRO.CODVOL,
        GRU.CODGRUPOPROD, GRU.DESCRGRUPOPROD
),

ESTOQUE_CALCULADO AS (
    SELECT
        B.CODPROD, B.DESCRPROD, B.USOPROD,
        (
            SELECT O.OPCAO FROM TDDOPC O
            WHERE O.VALOR   = B.USOPROD
              AND O.NUCAMPO = (SELECT CAM.NUCAMPO FROM TDDCAM CAM
                               WHERE CAM.NOMETAB = 'TGFPRO' AND CAM.NOMECAMPO = 'USOPROD')
        ) AS DESCRUSOPROD,
        B.ESTMIN, B.ESTMAX, B.CODVOL,
        (
            SELECT ROUND(AVG(CAB.DTENTSAI - ORIG.DTNEG), 0) * 1.0
            FROM TGFVAR VAR
            INNER JOIN TGFCAB ORIG ON VAR.NUNOTAORIG = ORIG.NUNOTA AND ORIG.TIPMOV = 'O'
            INNER JOIN TGFCAB CAB  ON VAR.NUNOTA = CAB.NUNOTA AND CAB.TIPMOV = 'C'
                                   AND CAB.DTENTSAI IS NOT NULL AND CAB.CODEMP = 1
            INNER JOIN TGFITE ITE  ON CAB.NUNOTA = ITE.NUNOTA AND ITE.CODPROD = B.CODPROD
            WHERE VAR.NUNOTA <> VAR.NUNOTAORIG
        ) AS LEADTIME,
        B.CODGRUPOPROD, B.DESCRGRUPOPROD,
        B.ESTOQUE_ATUAL, B.RESERVADO, B.ESTOQUE_FINAL, B.NECESSIDADE_EMIN
    FROM BASE_PRODUTO B
),

CALCULOS_SAIDA AS (
    SELECT
        ESTPRO.CODPROD,
        ROUND(EVO_GET_CONSUMO_PROD(ESTPRO.CODPROD, :P_MESES), 2) AS QT_TOTAL_SAIDA,
        ROUND(FC_GETAVGSAIDA_EVO(ESTPRO.CODPROD, :P_MESES), 2)   AS QT_MEDIA_SAIDA
    FROM TGFPRO ESTPRO
    WHERE ESTPRO.ATIVO   = 'S'
      AND ESTPRO.USOPROD IN :P_USOPROD
      AND ((ESTPRO.CODPROD = :P_CODPROD) OR (:P_CODPROD IS NULL))
      AND ((ESTPRO.CODGRUPOPROD = :P_GRUPOPROD) OR (:P_GRUPOPROD IS NULL))
),

-- Correção 13/02/2026: removido ITE.CODVOL do GROUP BY e do SELECT
-- CASE WHEN movido para dentro do SUM() para evitar ORA-00979
-- Adicionado filtro AND ITE.CODVOL != 'MI' para eliminar duplicação
PEDIDO_PENDENTE AS (
    SELECT
        ITE.CODPROD,
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDNEG, ITE.CODVOL)
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END) AS QTD_ORIGINAL_PEDIDO,
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDENTREGUE, ITE.CODVOL)
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END) AS QTD_ENTREGUE,
        SUM(GUT_QTDEVOL_COM(ITE.CODPROD, ITE.QTDNEG - ITE.QTDENTREGUE, ITE.CODVOL)
            * CASE WHEN ITE.CODVOL = 'MI' THEN 1000 ELSE 1 END) AS QTD_PENDENTE
    FROM TGFITE ITE
    INNER JOIN TGFCAB CAB ON CAB.NUNOTA = ITE.NUNOTA
    WHERE CAB.TIPMOV = 'O' AND ITE.PENDENTE = 'S' AND CAB.STATUSNOTA = 'L'
      AND ITE.CODVOL != 'MI'
    GROUP BY ITE.CODPROD
),

ULTIMO_RECEBIMENTO AS (
    SELECT
        PP.CODPROD,
        SUM((
            SELECT DISTINCT SUM(NVL(ITE2.QTDENTREGUE,0))
            FROM AD_PARPROD PP_INNER
            LEFT JOIN TGFITE ITE  ON ITE.CODPROD   = PP_INNER.CODPROD
            LEFT JOIN TGFCAB CAB  ON ITE.NUNOTA     = CAB.NUNOTA AND PP_INNER.CODPARC = CAB.CODPARC
            LEFT JOIN TGFTOP TOP  ON CAB.CODTIPOPER = TOP.CODTIPOPER
            LEFT JOIN TGFVAR VAR  ON VAR.NUNOTA     = CAB.NUNOTA AND VAR.SEQUENCIA = ITE.SEQUENCIA
            LEFT JOIN TGFITE ITE2 ON ITE2.NUNOTA    = VAR.NUNOTAORIG AND ITE2.SEQUENCIA = VAR.SEQUENCIAORIG
            WHERE PP_INNER.CODPARC = PP.CODPARC AND PP_INNER.CODPROD = PP.CODPROD
              AND TOP.TIPMOV = 'C' AND CAB.AD_DTCONFIRM IS NULL
              AND CAB.DTNEG = (
                    SELECT MAX(CAB_MAX.DTNEG) FROM TGFCAB CAB_MAX
                    INNER JOIN TGFITE ITE_MAX ON ITE_MAX.NUNOTA     = CAB_MAX.NUNOTA
                    INNER JOIN TGFTOP TOP_MAX ON CAB_MAX.CODTIPOPER = TOP_MAX.CODTIPOPER
                    WHERE CAB_MAX.CODPARC = PP_INNER.CODPARC
                      AND ITE_MAX.CODPROD = PP_INNER.CODPROD AND TOP_MAX.TIPMOV = 'C')
        )) AS QTD_ULTIMO_RECEBIMENTO
    FROM AD_PARPROD PP
    WHERE PP.CODPARC <> 296
    GROUP BY PP.CODPROD
)

SELECT DISTINCT
    E.CODPROD,
    E.DESCRPROD                                                                                      AS PRODUTO,
    E.USOPROD                                                                                        AS COD_USO,
    E.DESCRUSOPROD                                                                                   AS USO,
    E.CODVOL                                                                                         AS COD_VOLUME,
    E.LEADTIME,
    E.ESTMIN           * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                             AS EST_MINIMO,
    E.ESTMAX           * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                             AS EST_MAXIMO,
    E.ESTOQUE_ATUAL    * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                             AS ESTOQUE_ATUAL,
    E.RESERVADO        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                             AS RESERVADO,
    E.ESTOQUE_FINAL    * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                             AS ESTOQUE_FINAL,
    E.NECESSIDADE_EMIN * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                             AS NECESSIDADE_EMIN,
    E.CODGRUPOPROD,
    E.DESCRGRUPOPROD,
    E.NECESSIDADE_EMIN + (E.NECESSIDADE_EMIN * (:P_PERC / 100))
        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                                            AS NECESSIDADE_AJUSTE,
    :P_MESES || ' Meses'                                                                             AS PERIODO_ANALISADO,
    :P_MESES_COBERTURA || ' Meses'                                                                   AS PERIODO_COBERTURA,
    C.QT_TOTAL_SAIDA   * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                             AS QT_TOTAL_SAIDA,
    C.QT_MEDIA_SAIDA   * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                             AS QT_MEDIA_SAIDA,
    ROUND((C.QT_TOTAL_SAIDA / (:P_MESES * 22)), 2)
        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                                            AS QT_MEDIA_DIA,
    ROUND((C.QT_TOTAL_SAIDA / (:P_MESES * 22)) * (:P_MESES_COBERTURA * 22), 2)
        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                                            AS NECESSIDADE_COBERTURA,
    ROUND(E.ESTOQUE_FINAL / NULLIF((C.QT_TOTAL_SAIDA / (:P_MESES * 22)), 0), 0)                     AS RUPTURA_EM_DIAS,
    PP.QTD_ORIGINAL_PEDIDO * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                         AS QTD_ORIGINAL_PEDIDO,
    PP.QTD_ENTREGUE        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                         AS QTD_ENTREGUE,
    PP.QTD_PENDENTE        * CASE WHEN E.CODVOL = 'MI' THEN 1000 ELSE 1 END                         AS QTD_PENDENTE,
    CASE WHEN (E.ESTOQUE_FINAL + NVL(PP.QTD_PENDENTE,0) + NVL(UR.QTD_ULTIMO_RECEBIMENTO,0)) < E.ESTMIN
        THEN '#FFCCCC' END AS BKCOLOR,
    CASE WHEN (E.ESTOQUE_FINAL + NVL(PP.QTD_PENDENTE,0) + NVL(UR.QTD_ULTIMO_RECEBIMENTO,0)) < E.ESTMIN
        THEN '#990000' END AS FGCOLOR
FROM ESTOQUE_CALCULADO E
INNER JOIN CALCULOS_SAIDA C      ON E.CODPROD = C.CODPROD
LEFT JOIN  PEDIDO_PENDENTE PP    ON E.CODPROD = PP.CODPROD
LEFT JOIN  ULTIMO_RECEBIMENTO UR ON E.CODPROD = UR.CODPROD
WHERE NVL(E.ESTMIN, 0) >= CASE WHEN :P_EST_BAIXO = 'S'
    THEN (E.ESTOQUE_FINAL + NVL(PP.QTD_PENDENTE,0) + NVL(UR.QTD_ULTIMO_RECEBIMENTO,0))
    ELSE 0 END
ORDER BY E.CODPROD
```

---

## 10. Queries Auxiliares do Dashboard

### 10.1 Estoque por Local

Exibida ao clicar em um produto na query principal.

```sql
SELECT
    EST.CONTROLE,
    EST.CODLOCAL,
    LOC.DESCRLOCAL,
    NVL(EST.ESTOQUE,0)                          AS ESTOQUE,
    EST.RESERVADO,
    EST.ESTOQUE - EST.RESERVADO                 AS ESTFINAL,
    CASE WHEN EST.CODPARC <> 0 THEN 'Terceiro' ELSE NULL END AS EST_TERCEIRO
FROM TGFEST EST
LEFT JOIN TGFLOC LOC ON LOC.CODLOCAL = EST.CODLOCAL
WHERE EST.CODPROD = :A_CODPROD
  AND EST.ESTOQUE > 0
ORDER BY EST.CODLOCAL, EST.CONTROLE
```

**Correção aplicada:** removida tabela `TGFPRO` desnecessária.

### 10.2 Pedidos Pendentes

Exibe pedidos em aberto e histórico de compras para o produto selecionado.

**Estrutura:** UNION ALL entre pedidos pendentes (`TIPMOV = 'O'`) e compras (`TIPMOV = 'C'`), com CTEs `VAR_ORIGEM` e `MAX_DTNEG_COMPRA`.

**Débitos técnicos registrados:**
- JOIN `TGFTOP` sem `DHALTER` na parte COMPRA
- CTE `VAR_ORIGEM` sem filtro de `TIPMOV`
- `GUT_QTDEVOL_COM` via `SELECT FROM DUAL`

### 10.3 Parceiros do Produto

Exibe fornecedores com informações financeiras e histórico de compra.

**Estrutura:** CTEs `FIN_PENDENTE` e `ULTIMA_COMPRA_MAX_DTNEG` com JOIN na `AD_PARPROD`.

**Débitos técnicos registrados:**
- JOIN `TGFTOP` sem `DHALTER`
- `FIN_PENDENTE` sem filtro de parceiro
- `SUM(DISTINCT)` em `QTDENTREGUE`

---

## 11. Débitos Técnicos Registrados

Itens identificados durante a auditoria mas não corrigidos — aguardam implementação com acompanhamento.

| # | Query | Ponto | Impacto | Risco de alterar |
|---|---|---|---|---|
| 1 | Pedidos Pendentes | JOIN TGFTOP sem DHALTER na parte COMPRA | Duplicação futura se TOP reparametrizada | Nenhum |
| 2 | Pedidos Pendentes | CTE VAR_ORIGEM sem filtro TIPMOV | Performance | Nenhum |
| 3 | Pedidos Pendentes | GUT_QTDEVOL_COM via FROM DUAL | Performance | Nenhum |
| 4 | Parceiros do Produto | JOIN TGFTOP sem DHALTER | Duplicação futura se TOP reparametrizada | Nenhum |
| 5 | Parceiros do Produto | FIN_PENDENTE sem filtro de parceiro | Performance em base com alto volume financeiro | Nenhum |
| 6 | Parceiros do Produto | SUM(DISTINCT) em QTDENTREGUE | Possível valor incorreto em entregas com quantidades iguais | Baixo |
| 7 | Estoque por Local | ESTFINAL sem NVL em RESERVADO | Pode retornar NULL | Nenhum |
| 8 | Estoque por Local | EST_TERCEIRO sem NVL em CODPARC | Comportamento inconsistente com NULL | Nenhum |

---

## 12. Pendências de Processo

### Correção de Dados no ERP

Pedidos com erro de lançamento — unidade selecionada incorretamente:

| Produto | NUNOTA | Unidade atual | Deveria ser | Fornecedor |
|---|---|---|---|---|
| 26827 | 212479 | UN (1) | MI (1) | — |
| 50904 | 205008 | UN (4) | MI (4) | J Andrade's |
| 50904 | 205001 | UN (6) | MI (6) | J Andrade's |

### Cadastro

- Produto **50904** sem fator de conversão na `TGFVOA`. Cadastrar: `1 MI = 1.000 UN` (igual aos demais 23 produtos do grupo Embalagem).
- Produto **50904** com `ESTMIN = 0` — gestor deve definir estoque mínimo.

### Regra de Processo

Definir e comunicar regra clara: **pedidos de rótulos e etiquetas devem sempre ser lançados em MI**, nunca em UN.

---

## 13. Resultado Validado

### Produto 50904 — Resultado do Teste

| Campo | Valor | Observação |
|---|---|---|
| ESTOQUE_FINAL | 652 UN | Locais filtrados |
| EST_MINIMO | 0 | ESTMIN não cadastrado |
| NECESSIDADE_EMIN | 0 | Estoque >= mínimo |
| QTD_PENDENTE | 10 UN | 4 + 6 = notas 205008 e 205001 |
| DUPLICAÇÃO | Eliminada | Uma única linha retornada |
| BKCOLOR / FGCOLOR | NULL | Sem alerta de cor |
| LEADTIME | 175 dias | Calculado por histórico pedido→NF |

### Processo de Isolamento do Erro ORA-00979

| CTE Testada | Resultado |
|---|---|
| BASE_PRODUTO isolada | ✅ OK |
| BASE_PRODUTO + ESTOQUE_CALCULADO | ✅ OK |
| + CALCULOS_SAIDA | ✅ OK |
| + PEDIDO_PENDENTE | ❌ ORA-00979 |
| PEDIDO_PENDENTE isolada | ❌ ORA-00979 |
| PEDIDO_PENDENTE com CASE dentro do SUM | ✅ OK |
| Query completa corrigida | ✅ OK — resultado validado |

---

*Documentação gerada em 13/02/2026*
