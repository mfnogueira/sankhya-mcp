# Documentação Técnica: Correção de Valores de Apontamento no Sankhya (Oracle)

## 📋 Sumário
1. [Contexto do Problema](#contexto-do-problema)
2. [Metodologia de Investigação](#metodologia-de-investigação)
3. [Identificação das Tabelas](#identificação-das-tabelas)
4. [Processo de Correção](#processo-de-correção)
5. [Verificação Final](#verificação-final)
6. [Glossário de Campos](#glossário-de-campos)
7. [Queries de Referência](#queries-de-referência)

---

## 📝 Contexto do Problema

### Situação Inicial
- **Ordem de Produção (OP):** 127126
- **Produto:** 56572 (RESINA DIL. EVOBLOCK MULTI - BL)
- **Problema:** Valor apontado incorretamente como **9830 kg** (9 toneladas e 830 kg)
- **Valor Correto:** **9,83 kg** (9 quilos e 830 gramas)
- **Causa:** Erro de digitação da operadora que inseriu 9830 ao invés de 9.83

### Objetivo
Identificar todas as tabelas que armazenam a quantidade apontada e corrigir o valor de 9830 para 9.83.

---

## 🔍 Metodologia de Investigação

### Passo 1: Análise do Log do Sistema

O log do sistema (Monitor_Consulta.log) forneceu a primeira pista:

```
##ID_6## 
SELECT ... FROM TPRROPE
WHERE IDIATV = ? AND NUAPO = ?
Params:
  1 = 328135  (IDIATV - ID da Atividade)
  2 = 119438  (NUAPO - Número do Apontamento)
```

**Informações extraídas:**
- **NUAPO = 119438** → Número único do apontamento
- **IDIATV = 328135** → ID da instância da atividade

### Passo 2: Identificação da Tabela de Cabeçalho da OP

Query inicial para encontrar a OP:

```sql
SELECT * 
FROM TPRIPROC 
WHERE IDIPROC = 127126;
```

**Resultado importante:**
- **IDIPROC = 127126** → ID da instância do processo (número da OP)
- **STATUSPROC = A** → Status: **A**berta/Em **A**ndamento
- **DHTERMINO = NULL** → Data/Hora de término vazia (OP não finalizada)
- **NUNOTA = NULL** → Número da nota fiscal vazio (ainda não gerou nota)

### Passo 3: Descoberta do Dicionário de Dados do Sankhya

O Sankhya possui um **dicionário de dados** que mapeia todos os relacionamentos entre tabelas através das seguintes tabelas:

- **TDDTAB** → Tabelas do sistema
- **TDDCAM** → Campos das tabelas
- **TDDLGC** → Ligações entre campos
- **TDDLIG** → Ligações entre instâncias
- **TDDINS** → Instâncias (entidades)

**Query Fundamental para Descobrir Relacionamentos:**

```sql
SELECT 
    TAB_ORIG.NOMETAB || ' - ' || TAB_ORIG.DESCRTAB TABELA_ORIGEM, 
    CAM_ORIG.NOMECAMPO || ' - ' || CAM_ORIG.DESCRCAMPO CAMPO_ORIGEM,
    INS_ORIG.NOMEINSTANCIA INSTANCIA_ORIGEM,
    TAB_DEST.NOMETAB || ' - ' || TAB_DEST.DESCRTAB TABELA_DESTINO, 
    CAM_DEST.NOMECAMPO || ' - ' || CAM_DEST.DESCRCAMPO CAMPO_DESTINO,
    INS_DEST.NOMEINSTANCIA INSTANCIA_DESTINO
FROM
    TDDTAB TAB_ORIG 
    INNER JOIN TDDCAM CAM_ORIG ON TAB_ORIG.NOMETAB = CAM_ORIG.NOMETAB
    INNER JOIN TDDLGC LGC ON LGC.NUCAMPOORIG = CAM_ORIG.NUCAMPO
    INNER JOIN TDDCAM CAM_DEST ON CAM_DEST.NUCAMPO = LGC.NUCAMPODEST 
    INNER JOIN TDDTAB TAB_DEST ON TAB_DEST.NOMETAB = CAM_DEST.NOMETAB 
    INNER JOIN TDDLIG LIG ON LIG.NUINSTORIG = LGC.NUINSTORIG AND LIG.NUINSTDEST = LGC.NUINSTDEST
    INNER JOIN TDDINS INS_ORIG ON INS_ORIG.NUINSTANCIA = LIG.NUINSTORIG 
    INNER JOIN TDDINS INS_DEST ON INS_DEST.NUINSTANCIA = LIG.NUINSTDEST
WHERE 
    (TAB_ORIG.NOMETAB = 'TPRIPROC' OR TAB_DEST.NOMETAB = 'TPRIPROC');
```

**Resultado: Tabelas relacionadas à TPRIPROC:**

| Tabela | Descrição | Campo de Ligação |
|--------|-----------|------------------|
| TPRIATV | Instância de atividade de usuário | IDIPROC |
| TPRIPA | PAs a serem produzidos na instância | IDIPROC |
| TPRESR | Estoque por repositório de PA | IDIPROC |
| TPRICCQ | Item do Ciclo de Controle de Qualidade | IDIPROC |
| TPRIDEP | Dependência entre OPs | IDIPROC |
| TPRTXAT | Terceiro por Atividade | IDIPROC |
| TPRICOP | Instância Co-produtos na OP | IDIPROC |
| TPRISP | Tabela Instância Subproduto | IDIPROC |
| TPRINOTA | Instância Item Nota | IDIPROC |

---

## 🎯 Identificação das Tabelas

### Hierarquia de Dados Identificada

```
TPRIPROC (Cabeçalho da OP)
    ├─ IDIPROC = 127126
    │
    ├─ TPRIPA (Produtos Acabados a Produzir)
    │   ├─ CODPRODPA = 56572
    │   └─ QTDPRODUZIR = 4.564 kg
    │
    ├─ TPRIATV (Atividades da OP)
    │   └─ IDIATV = 328135
    │
    └─ TPRAPO (Cabeçalho do Apontamento)
        ├─ NUAPO = 119438
        ├─ SITUACAO = C (Confirmado)
        │
        ├─ TPRAPA (Apontamento de Produto Acabado) ⚠️ VALOR ERRADO AQUI
        │   ├─ QTDAPONTADA = 9830 ❌
        │   ├─ QTDFAT = 9830 ❌
        │   └─ CODPRODPA = 56572
        │
        ├─ TPRAPF (Faturamento do Apontamento) ⚠️ VALOR ERRADO AQUI
        │   ├─ QTD = 9830 ❌
        │   └─ NUNOTA = 451117 (vincula à nota fiscal)
        │
        ├─ TPRAMP (Apontamento de Matérias-Primas)
        │   └─ Várias MPs com quantidades corretas
        │
        └─ NOTA FISCAL (quando gerada) ⚠️ VALOR ERRADO AQUI
            │
            ├─ TGFCAB (Cabeçalho da Nota)
            │   ├─ NUNOTA = 451117
            │   ├─ NUMNOTA = 44617
            │   ├─ STATUSNOTA = L (Liberada)
            │   ├─ STATUSNFE = NULL (Não transmitida à SEFAZ)
            │   └─ VLRNOTA = 440414.74 ❌
            │
            └─ TGFITE (Itens da Nota)
                ├─ Item 1 (Produto Acabado da OP) ⚠️ VALOR ERRADO AQUI
                │   ├─ SEQUENCIA = 1
                │   ├─ CODPROD = 56572
                │   ├─ CONTROLE = 0126000110 (lote da OP)
                │   ├─ QTDNEG = 9830 ❌
                │   └─ VLRTOT = 440085.77746 ❌
                │
                └─ Item 4 (Matéria-Prima consumida)
                    ├─ SEQUENCIA = 4
                    ├─ CODPROD = 56572
                    ├─ CONTROLE = 0725000110
                    ├─ QTDNEG = 5.443 ✅
                    └─ VLRTOT = 243.68 ✅
```

### Query para Identificar a Tabela TPRIPA

```sql
SELECT * 
FROM TPRIPA 
WHERE IDIPROC = 127126;
```

**Resultado:**
```
IDIPROC  | CODPRODPA | QTDPRODUZIR | NROLOTE
127126   | 56572     | 4.564       | 0126000110
```

### Query para Identificar a Tabela TPRAPA (Onde estava o erro)

```sql
SELECT 
    APA.*
FROM TPRAPA APA
WHERE APA.NUAPO IN (
    SELECT APO.NUAPO 
    FROM TPRAPO APO
    INNER JOIN TPRIATV IATV ON IATV.IDIATV = APO.IDIATV
    WHERE IATV.IDIPROC = 127126
);
```

**Resultado (ANTES da correção):**
```
NUAPO  | SEQAPA | CODPRODPA | QTDAPONTADA | QTDFAT | QTDPERDA
119438 | 1      | 56572     | 9830        | 9830   | 0.138
```

### Descoberta dos Relacionamentos da TPRAPA

```sql
SELECT 
    TAB_ORIG.NOMETAB || ' - ' || TAB_ORIG.DESCRTAB TABELA_ORIGEM, 
    CAM_ORIG.NOMECAMPO || ' - ' || CAM_ORIG.DESCRCAMPO CAMPO_ORIGEM,
    TAB_DEST.NOMETAB || ' - ' || TAB_DEST.DESCRTAB TABELA_DESTINO, 
    CAM_DEST.NOMECAMPO || ' - ' || CAM_DEST.DESCRCAMPO CAMPO_DESTINO
FROM
    TDDTAB TAB_ORIG 
    INNER JOIN TDDCAM CAM_ORIG ON TAB_ORIG.NOMETAB = CAM_ORIG.NOMETAB
    INNER JOIN TDDLGC LGC ON LGC.NUCAMPOORIG = CAM_ORIG.NUCAMPO
    INNER JOIN TDDCAM CAM_DEST ON CAM_DEST.NUCAMPO = LGC.NUCAMPODEST 
    INNER JOIN TDDTAB TAB_DEST ON TAB_DEST.NOMETAB = CAM_DEST.NOMETAB 
    INNER JOIN TDDLIG LIG ON LIG.NUINSTORIG = LGC.NUINSTORIG AND LIG.NUINSTDEST = LGC.NUINSTDEST
    INNER JOIN TDDINS INS_ORIG ON INS_ORIG.NUINSTANCIA = LIG.NUINSTORIG 
    INNER JOIN TDDINS INS_DEST ON INS_DEST.NUINSTANCIA = LIG.NUINSTDEST
WHERE 
    (TAB_ORIG.NOMETAB = 'TPRAPA' OR TAB_DEST.NOMETAB = 'TPRAPA');
```

**Tabelas identificadas que precisam de correção:**

| Tabela | Descrição | Campo a Corrigir | Ligação |
|--------|-----------|------------------|---------|
| TPRAPA | Apontamento de PA | QTDAPONTADA, QTDFAT | NUAPO + SEQAPA |
| TPRAPF | Faturamento de Apontamento | QTD | NUAPO + SEQAPA |
| TGFITE | Itens da Nota Fiscal | QTDNEG, VLRTOT | NUNOTA + SEQUENCIA |
| TGFCAB | Cabeçalho da Nota Fiscal | VLRNOTA | NUNOTA |
| TPRAPO | Cabeçalho de Apontamento | (apenas leitura) | NUAPO |
| TPRARW | Apontamento Recursos de Work Center | (verificar) | NUAPO + SEQAPA |
| TPRASP | Apontamento de Sub-produto | (verificar) | NUAPO + SEQAPA |
| TPRAMP | Apontamento de Materiais | (verificar) | NUAPO + SEQAPA |

### Verificação das Tabelas Relacionadas

```sql
-- Verificar se há dados nas tabelas relacionadas
SELECT 'TPRAPO' AS TABELA, COUNT(*) AS REGISTROS FROM TPRAPO WHERE NUAPO = 119438
UNION ALL
SELECT 'TPRAPF' AS TABELA, COUNT(*) AS REGISTROS FROM TPRAPF WHERE NUAPO = 119438
UNION ALL
SELECT 'TPRARW' AS TABELA, COUNT(*) AS REGISTROS FROM TPRARW WHERE NUAPO = 119438
UNION ALL
SELECT 'TPRASP' AS TABELA, COUNT(*) AS REGISTROS FROM TPRASP WHERE NUAPO = 119438
UNION ALL
SELECT 'TPRAMP' AS TABELA, COUNT(*) AS REGISTROS FROM TPRAMP WHERE NUAPO = 119438;
```

**Resultado:**
- **TPRAPO:** 1 registro (cabeçalho)
- **TPRAPF:** 1 registro ⚠️ (precisa correção)
- **TPRARW:** 0 registros
- **TPRASP:** 0 registros
- **TPRAMP:** 3 registros (MPs - valores corretos)

---

## 🔧 Processo de Correção

### 4.1. Correção de Apontamento (TPRAPA/TPRAPF)

#### Problema Identificado: Trigger Automático

Ao tentar fazer o UPDATE simples, descobrimos que existe um **TRIGGER** que recalcula valores automaticamente:

```sql
-- Identificar triggers na tabela
SELECT 
    TRIGGER_NAME,
    TRIGGER_TYPE,
    TRIGGERING_EVENT,
    STATUS
FROM USER_TRIGGERS
WHERE TABLE_NAME = 'TPRAPA';
```

**Resultado:**
```
TRIGGER_NAME: TRG_INC_UPD_DLT_TPRAPA
TRIGGER_TYPE: BEFORE EACH ROW
TRIGGERING_EVENT: INSERT OR UPDATE
STATUS: ENABLED
```

**Problema encontrado:**
- Ao atualizar `QTDAPONTADA = 9.83`
- O trigger recalculava `QTDFAT = 9.83 - 9820.17 = -9810.34` ❌

### Solução: Desabilitar Trigger Temporariamente

```sql
-- 1. DESABILITAR O TRIGGER
ALTER TRIGGER TRG_INC_UPD_DLT_TPRAPA DISABLE;

-- 2. ATUALIZAR TPRAPA (Apontamento de PA)
UPDATE TPRAPA 
SET QTDAPONTADA = 9.83,
    QTDFAT = 9.83
WHERE NUAPO = 119438
  AND SEQAPA = 1
  AND CODPRODPA = 56572;

-- 3. ATUALIZAR TPRAPF (Faturamento do Apontamento)
UPDATE TPRAPF 
SET QTD = 9.83
WHERE NUAPO = 119438
  AND SEQAPA = 1;

-- 4. COMMIT
COMMIT;

-- 5. REABILITAR O TRIGGER
ALTER TRIGGER TRG_INC_UPD_DLT_TPRAPA ENABLE;
```

### Explicação dos Campos no WHERE

- **NUAPO = 119438** → Número único do apontamento (identifica o apontamento específico)
- **SEQAPA = 1** → Sequência do produto acabado no apontamento (caso tenha múltiplos produtos)
- **CODPRODPA = 56572** → Código do produto acabado (segurança adicional para garantir que é o produto correto)

### Observação sobre Separadores Decimais

**IMPORTANTE:** No Oracle com SQL, sempre use **PONTO (.)** como separador decimal:
- No SQL: `9.83`
- Na tela brasileira do Sankhya: `9,830` ou `9.830,0000`

**Interpretação:**
- `9.83` no SQL = 9 quilos e 830 gramas
- `9830` no SQL = 9.830 quilos = 9 toneladas e 830 quilos

---

### 4.2. Correção de Nota Fiscal (TGFITE/TGFCAB)

#### Contexto da Nota Fiscal

Após corrigir o apontamento (TPRAPA/TPRAPF), descobrimos que a OP já havia gerado uma **Nota Fiscal**:

**Nota 451117:**
- NUMNOTA: 44617
- STATUSNOTA: L (Liberada)
- STATUSNFE: NULL (NÃO transmitida à SEFAZ) ✅
- TIPMOV: F (Faturamento/Produção)
- Data: 16/01/2026

**Itens da Nota (TGFITE):**
- **Item 1 (SEQ 1):** Produto acabado da OP - QTDNEG = 9830 ❌
- **Item 4 (SEQ 4):** Matéria-prima consumida - QTDNEG = 5.443 ✅

#### Verificação de Status da Nota

**CRÍTICO:** Antes de alterar qualquer nota fiscal, SEMPRE verificar o status:

```sql
SELECT 
    NUNOTA,
    NUMNOTA,
    STATUSNOTA,
    STATUSNFE,
    TIPMOV,
    DTNEG
FROM TGFCAB 
WHERE NUNOTA = 451117;
```

**Interpretação dos Status:**

| STATUSNOTA | Significado | Pode Alterar? |
|------------|-------------|---------------|
| P | Pendente | ✅ Sim |
| L | Liberada | ⚠️ Depende do STATUSNFE |
| A | Aprovada | ⚠️ Depende do STATUSNFE |
| C | Cancelada | ❌ Não |

| STATUSNFE | Significado | Pode Alterar? |
|-----------|-------------|---------------|
| NULL | Não transmitida | ✅ Sim |
| A | Autorizada SEFAZ | ❌ Não (precisa carta correção/cancelamento) |
| C | Cancelada SEFAZ | ❌ Não |
| I | Inutilizada | ❌ Não |
| D | Denegada | ❌ Não |

**No nosso caso:**
- STATUSNOTA = L (Liberada)
- STATUSNFE = NULL (Não transmitida) ✅
- **Conclusão:** PODE alterar com segurança!

#### Análise de Triggers

Antes de fazer UPDATE em TGFITE/TGFCAB, verificamos os triggers ativos:

```sql
SELECT 
    TRIGGER_NAME,
    TABLE_NAME,
    TRIGGERING_EVENT,
    STATUS
FROM USER_TRIGGERS
WHERE TABLE_NAME IN ('TGFITE', 'TGFCAB')
ORDER BY TABLE_NAME, TRIGGER_NAME;
```

**Resultado:** 77 triggers ativos!
- **37 triggers na TGFITE**
- **40 triggers na TGFCAB**

**Triggers Críticos Identificados:**

| Trigger | Tabela | Evento | Função | Risco |
|---------|--------|--------|--------|-------|
| TRG_UPT_TGFITE | TGFITE | UPDATE | Principal validação de item | ⚠️ ALTO - Bloqueou UPDATE |
| TRG_UPD_TGFCAB_EST | TGFCAB | UPDATE | Atualiza estoque | ⚠️ ALTO |
| WMS_TRG_IUD_TGFITE | TGFITE | UPDATE | Sistema WMS | ⚠️ MÉDIO |
| WMS_TRG_IUD_TGFCAB | TGFCAB | UPDATE | Sistema WMS | ⚠️ MÉDIO |
| TRG_UPT_TGFITE_METAS | TGFITE | UPDATE | Recalcula metas | ⚠️ MÉDIO |
| TRG_UPD_TGFCAB_METAS | TGFCAB | UPDATE | Recalcula metas | ⚠️ MÉDIO |
| TRG_INC_UPD_TGFITE_TGAMOV | TGFITE | UPDATE | Movimentações | ⚠️ MÉDIO |
| TRG_UPD_TGFCAB_TGAMOV | TGFCAB | UPDATE | Movimentações | ⚠️ MÉDIO |

#### Erro Encontrado ao Tentar UPDATE

Ao tentar fazer UPDATE direto na TGFITE:

```sql
UPDATE TGFITE 
SET QTDNEG = 9.83
WHERE NUNOTA = 451117
  AND SEQUENCIA = 1
  AND CODPROD = 56572
  AND CONTROLE = '0126000110';
```

**Erro recebido:**
```
ORA-20101: ORA-06502: PL/SQL: erro: buffer de string de caracteres pequeno demais
ORA-06512: em "SANKHYA.TRG_UPT_TGFITE", line 734
ORA-04088: erro durante a execução do gatilho 'SANKHYA.TRG_UPT_TGFITE'
```

**Causa:** O trigger **TRG_UPT_TGFITE** bloqueou o UPDATE (validação ou recálculo falhando).

#### Solução: Desabilitar Trigger Temporariamente

**Estratégia aprovada com supervisor:**
1. Desabilitar trigger problemático
2. Fazer UPDATEs
3. Verificar resultados
4. Fazer COMMIT
5. Reabilitar trigger

```sql
-- ========================================
-- PASSO 1: DESABILITAR TRIGGER
-- ========================================
ALTER TRIGGER TRG_UPT_TGFITE DISABLE;


-- ========================================
-- PASSO 2: ATUALIZAR TGFITE (Item da Nota)
-- ========================================
-- Primeiro UPDATE: apenas quantidade
UPDATE TGFITE 
SET QTDNEG = 9.83
WHERE NUNOTA = 451117
  AND SEQUENCIA = 1
  AND CODPROD = 56572
  AND CONTROLE = '0126000110';

-- Verificar se VLRTOT foi recalculado automaticamente
SELECT 
    QTDNEG, 
    VLRTOT, 
    VLRUNIT,
    (QTDNEG * VLRUNIT) AS "VLRTOT Calculado"
FROM TGFITE 
WHERE NUNOTA = 451117 AND SEQUENCIA = 1;

-- Resultado: VLRTOT NÃO foi recalculado (ainda 440085.77746)
-- Precisamos atualizar manualmente:

UPDATE TGFITE 
SET VLRTOT = ROUND(QTDNEG * VLRUNIT, 2)
WHERE NUNOTA = 451117
  AND SEQUENCIA = 1
  AND CODPROD = 56572
  AND CONTROLE = '0126000110';


-- ========================================
-- PASSO 3: ATUALIZAR TGFCAB (Valor Total da Nota)
-- ========================================
-- Calcular a diferença:
-- Valor antigo do item: 440085.77746
-- Valor novo do item: 440.09
-- Diferença: 439645.68746

UPDATE TGFCAB 
SET VLRNOTA = VLRNOTA - 439645.68
WHERE NUNOTA = 451117;


-- ========================================
-- PASSO 4: VERIFICAR CONSISTÊNCIA
-- ========================================
-- Verificar TGFITE
SELECT 
    QTDNEG, 
    VLRTOT, 
    VLRUNIT
FROM TGFITE 
WHERE NUNOTA = 451117 AND SEQUENCIA = 1;
-- Resultado: QTDNEG = 9.83, VLRTOT = 440.09 ✅

-- Verificar TGFCAB
SELECT VLRNOTA FROM TGFCAB WHERE NUNOTA = 451117;
-- Resultado: VLRNOTA = 769.06 ✅

-- Validar que a soma dos itens bate com o valor da nota
SELECT SUM(VLRTOT) AS "Soma Itens" FROM TGFITE WHERE NUNOTA = 451117;
-- Resultado: 769.0573645 ✅ (diferença de centavos é arredondamento)


-- ========================================
-- PASSO 5: COMMIT
-- ========================================
COMMIT;


-- ========================================
-- PASSO 6: REABILITAR TRIGGER
-- ========================================
ALTER TRIGGER TRG_UPT_TGFITE ENABLE;


-- ========================================
-- PASSO 7: VERIFICAÇÃO FINAL
-- ========================================
SELECT 
    TRIGGER_NAME, 
    STATUS 
FROM USER_TRIGGERS 
WHERE TRIGGER_NAME = 'TRG_UPT_TGFITE';
-- Resultado: STATUS = ENABLED ✅

SELECT 
    'TGFITE' AS TABELA,
    QTDNEG AS VALOR
FROM TGFITE 
WHERE NUNOTA = 451117 AND SEQUENCIA = 1

UNION ALL

SELECT 
    'TGFCAB' AS TABELA,
    VLRNOTA AS VALOR
FROM TGFCAB 
WHERE NUNOTA = 451117;
-- Resultado: TGFITE = 9.83, TGFCAB = 769.06 ✅
```

#### Relacionamento TGFITE ↔ TGFCAB

**Regra fundamental:**
```
TGFCAB.VLRNOTA = Σ(TGFITE.VLRTOT)
```

O valor total da nota (VLRNOTA) deve SEMPRE ser igual à **soma dos valores de todos os itens** (VLRTOT).

**Por isso:**
- Ao alterar TGFITE.QTDNEG → recalcular TGFITE.VLRTOT
- Ao alterar TGFITE.VLRTOT → atualizar TGFCAB.VLRNOTA

**Validação:**
```sql
-- A diferença deve ser zero ou centavos (arredondamento)
SELECT 
    CAB.VLRNOTA AS "Valor Nota",
    SUM(ITE.VLRTOT) AS "Soma Itens",
    (CAB.VLRNOTA - SUM(ITE.VLRTOT)) AS "Diferença"
FROM TGFCAB CAB
INNER JOIN TGFITE ITE ON ITE.NUNOTA = CAB.NUNOTA
WHERE CAB.NUNOTA = 451117
GROUP BY CAB.VLRNOTA;
```

#### Lições Aprendidas - Nota Fiscal

1. ✅ **SEMPRE verificar STATUSNFE** antes de alterar nota
2. ✅ **Nota não transmitida** (STATUSNFE = NULL) → pode alterar
3. ✅ **Nota autorizada SEFAZ** (STATUSNFE = 'A') → NÃO alterar diretamente
4. ✅ **Triggers podem bloquear** UPDATEs com validações
5. ✅ **Desabilitar trigger** é seguro se reabilitar após COMMIT
6. ✅ **VLRNOTA = Soma dos VLRTOT** → manter consistência
7. ✅ **Testar com ROLLBACK** antes de fazer COMMIT definitivo
8. ✅ **Diferenças de centavos** são normais (arredondamento)

---

### Observação sobre Separadores Decimais (repetido para ênfase)

**IMPORTANTE:** No Oracle com SQL, sempre use **PONTO (.)** como separador decimal.

---

## 🔧 Gerenciamento de Triggers

### Lista Completa de Triggers Ativos

Durante a correção, identificamos **77 triggers ativos** nas tabelas de nota fiscal:

#### Triggers na TGFITE (37 ativos)

**BEFORE UPDATE (executam antes do UPDATE):**
```
TRG_UPT_TGFITE                    ← PRINCIPAL - Foi desabilitado
TRG_INC_UPD_TGFITE
TRG_INC_UPD_TGFITE_ATIVO
TRG_INC_UPD_TGFITE_VERIFCORTE
TRG_INC_UPD_TGFITE_CERTIFIC
TRG_INC_UPD_TGFITE_RASTEST
TRG_INC_UPD_TGFITE_PRODNFE
TRG_INC_UPD_DLT_TGFITE_RASTST
TRG_INC_UPD_DLT_TGFITE_ESTTERC
TRG_INC_UPD_DLT_TGFITE_LIB41
TRG_INC_UPT_DLT_TGFITE_FEC_CTB
TRG_UPD_TGFITE_TCIBEM
TRG_IU_ITE_UVV_EVO
TRG_IU_ITE_UCC_EVO
WMS_TRG_IUD_TGFITE                ← WMS (controle de estoque)
```

**AFTER UPDATE (executam após o UPDATE):**
```
TRG_UPT_TGFITE_AFTER
TRG_UPT_TGFITE_METAS              ← Recalcula metas de vendas
TRG_UPD_TGFITE_FLEX
TRG_INC_UPD_TGFITE_TGFGXE
TRG_INC_UPD_TGFITE_TGAMOV         ← Movimentações
TRG_INC_UPD_TGFITE_TRANSG
TRG_INC_UPD_DLT_TGFITE_DAV
TRG_INC_UPD_DLT_TGFITE_ESE
TRG_INC_UPD_DLT_TGFITE_RASTEST
```

#### Triggers na TGFCAB (40 ativos)

**BEFORE UPDATE:**
```
TRG_UPD_TGFCAB                    ← Principal
TRG_UPD_TGFCAB_FLEX
TRG_UPD_TGFCAB_SERIE
TRG_UPD_TGFCAB_TRANSG
TRG_UPD_TGFCAB_GRANDES_CARGAS
TRG_UPD_TGFCAB_TGAMOV
TRG_INC_UPD_TGFCAB_ORD
TRG_INC_UPD_TGFCAB_CERTIFIC
TRG_INC_UPD_TGFCAB_RASTST
TRG_INC_UPD_FX_TGFCAB
TRG_IU_PRJ_TGFCAB_ELSE
TRG_IU_TGFCAB_EVO
TRG_TGFCAB_INC_UPD_TIMFK
TRG_INC_UPT_DLT_TGFCAB_FEC_CTB
WMS_TRG_IUD_TGFCAB                ← WMS
```

**AFTER UPDATE:**
```
TRG_UPD_TGFCAB_AFTER
TRG_UPD_TGFCAB_METAS              ← Recalcula metas
TRG_UPD_TGFCAB_TCIBEM
TRG_UPD_TGFCAB_DTBEM
TRG_UPD_TGFCAB_EST                ← CRÍTICO: Atualiza estoque
TRG_UPD_TGFCAB_EST_TGFEFA
TRG_UPD_TGFCAB_TGFCPP             ← Contas a pagar/receber
TRG_INC_UPD_TGFCAB_TGFGXE
TRG_TGFCAB_INC_UPD_VINCNT
TRG_TGFCAB_INC_UPD_AFT_TIMFK
TRG_INC_UPT_DLT_TGFCAB_INDENIZ
```

### Matriz de Risco dos Triggers

| Categoria | Triggers | Risco | Impacto se Desabilitado |
|-----------|----------|-------|-------------------------|
| **Validação** | TRG_UPT_TGFITE, TRG_UPD_TGFCAB | 🟡 MÉDIO | Perde validações de integridade |
| **Estoque** | TRG_UPD_TGFCAB_EST, WMS_TRG_IUD_* | 🔴 ALTO | Estoque pode ficar inconsistente |
| **Financeiro** | TRG_UPD_TGFCAB_TGFCPP | 🔴 ALTO | Contas a pagar/receber podem desbalancear |
| **Metas** | TRG_*_METAS | 🟡 MÉDIO | Relatórios de metas ficam desatualizados |
| **Movimentações** | TRG_*_TGAMOV | 🟡 MÉDIO | Histórico de movimentação pode falhar |
| **Rastreamento** | TRG_*_RAST* | 🟢 BAIXO | Perde rastreabilidade (pode recalcular depois) |

### Quando Desabilitar Triggers

**Desabilitar trigger é necessário quando:**
1. ✅ Trigger está **bloqueando** UPDATE legítimo (como no nosso caso)
2. ✅ Trigger faz **recálculos** que você quer evitar temporariamente
3. ✅ Você precisa **controle total** sobre os valores sendo alterados

**NÃO desabilitar quando:**
1. ❌ Trigger atualiza **estoque** (risco alto de inconsistência)
2. ❌ Trigger atualiza **financeiro** (risco de desbalancear contas)
3. ❌ Você **não sabe** o que o trigger faz
4. ❌ Nota fiscal já foi **transmitida à SEFAZ**

### Como Identificar Trigger Problemático

```sql
-- 1. Tentar UPDATE e ver qual trigger deu erro
UPDATE tabela SET campo = valor WHERE condicao;
-- Erro mostra: ORA-04088: erro durante a execução do gatilho 'NOME_DO_TRIGGER'

-- 2. Listar triggers da tabela
SELECT 
    TRIGGER_NAME,
    TRIGGER_TYPE,
    TRIGGERING_EVENT,
    STATUS
FROM USER_TRIGGERS
WHERE TABLE_NAME = 'NOME_TABELA'
ORDER BY TRIGGER_NAME;

-- 3. Ver código do trigger (se necessário)
SELECT TEXT 
FROM USER_SOURCE 
WHERE NAME = 'NOME_DO_TRIGGER' 
  AND TYPE = 'TRIGGER'
ORDER BY LINE;
```

### Procedimento Seguro com Triggers

```sql
-- ========================================
-- PROCEDIMENTO PADRÃO
-- ========================================

-- 1. LISTAR triggers ativos
SELECT TRIGGER_NAME, STATUS 
FROM USER_TRIGGERS 
WHERE TABLE_NAME = '[TABELA]';

-- 2. TENTAR update normal primeiro
UPDATE [TABELA] SET [CAMPO] = [VALOR] WHERE [CONDICOES];

-- 3. SE DER ERRO de trigger:
ROLLBACK;

-- 4. DESABILITAR apenas o trigger problemático
ALTER TRIGGER [NOME_DO_TRIGGER] DISABLE;

-- 5. FAZER update
UPDATE [TABELA] SET [CAMPO] = [VALOR] WHERE [CONDICOES];

-- 6. VERIFICAR resultado
SELECT * FROM [TABELA] WHERE [CONDICOES];

-- 7. SE ESTIVER OK:
COMMIT;

-- 8. SE DEU ERRADO:
ROLLBACK;

-- 9. SEMPRE reabilitar o trigger
ALTER TRIGGER [NOME_DO_TRIGGER] ENABLE;

-- 10. CONFIRMAR que está ativo
SELECT TRIGGER_NAME, STATUS 
FROM USER_TRIGGERS 
WHERE TRIGGER_NAME = '[NOME_DO_TRIGGER]';
```

### Triggers que Foram Desabilitados Neste Caso

| Tabela | Trigger Desabilitado | Motivo | Impacto |
|--------|---------------------|--------|---------|
| TPRAPA | TRG_INC_UPD_DLT_TPRAPA | Recalculava QTDFAT incorretamente | Permitiu UPDATE manual |
| TGFITE | TRG_UPT_TGFITE | Erro ORA-06502 (buffer pequeno) | Permitiu UPDATE sem validação |

**Observação:** Todos foram **reabilitados** após o COMMIT com sucesso! ✅

---

## ✅ Verificação Final

### Query de Verificação Completa

```sql
-- Verificar todos os valores relacionados ao apontamento
SELECT 
    'PA Previsto (TPRIPA)' AS TIPO,
    TO_CHAR(CODPRODPA) AS PRODUTO,
    TO_CHAR(QTDPRODUZIR) AS QUANTIDADE,
    'KG' AS UNIDADE
FROM TPRIPA 
WHERE IDIPROC = 127126

UNION ALL

SELECT 
    'PA Apontado (TPRAPA)' AS TIPO,
    TO_CHAR(CODPRODPA) AS PRODUTO,
    TO_CHAR(QTDAPONTADA) AS QUANTIDADE,
    'KG' AS UNIDADE
FROM TPRAPA 
WHERE NUAPO = 119438

UNION ALL

SELECT 
    'PA Faturado (TPRAPF)' AS TIPO,
    'N/A' AS PRODUTO,
    TO_CHAR(QTD) AS QUANTIDADE,
    'KG' AS UNIDADE
FROM TPRAPF 
WHERE NUAPO = 119438

UNION ALL

SELECT 
    'MP Consumida (TPRAMP)' AS TIPO,
    TO_CHAR(CODPRODMP) AS PRODUTO,
    TO_CHAR(QTD) AS QUANTIDADE,
    CODVOL AS UNIDADE
FROM TPRAMP 
WHERE NUAPO = 119438
ORDER BY TIPO, PRODUTO;
```

### Resultado Após Correção Completa

**Tabelas de Apontamento:**
| TIPO | PRODUTO | QUANTIDADE | UNIDADE |
|------|---------|------------|---------|
| MP Consumida (TPRAMP) | 31922 | 0,141 | KG |
| MP Consumida (TPRAMP) | 45212 | 4,423 | KG |
| MP Consumida (TPRAMP) | 56572 | 5,443 | KG |
| **PA Apontado (TPRAPA)** | **56572** | **9,83** ✅ | **KG** |
| **PA Faturado (TPRAPF)** | **N/A** | **9,83** ✅ | **KG** |
| PA Previsto (TPRIPA) | 56572 | 4,564 | KG |

**Tabelas de Nota Fiscal:**
| TABELA | CAMPO | ANTES | DEPOIS | STATUS |
|--------|-------|-------|--------|--------|
| **TGFITE** | QTDNEG | 9830 | **9.83** | ✅ |
| **TGFITE** | VLRTOT | 440085.78 | **440.09** | ✅ |
| **TGFCAB** | VLRNOTA | 440414.74 | **769.06** | ✅ |

**Validação de Consistência:**
```sql
-- Soma dos itens deve bater com valor da nota
SELECT 
    CAB.VLRNOTA AS "Valor Nota",
    SUM(ITE.VLRTOT) AS "Soma Itens",
    (CAB.VLRNOTA - SUM(ITE.VLRTOT)) AS "Diferença"
FROM TGFCAB CAB
INNER JOIN TGFITE ITE ON ITE.NUNOTA = CAB.NUNOTA
WHERE CAB.NUNOTA = 451117
GROUP BY CAB.VLRNOTA;

-- Resultado:
-- Valor Nota: 769.06
-- Soma Itens: 769.06
-- Diferença: 0.0026355 (centavos - arredondamento normal) ✅
```

### Verificação Individual das Tabelas

```sql
-- 1. TPRAPA (Apontamento)
SELECT 
    NUAPO,
    SEQAPA,
    CODPRODPA,
    QTDAPONTADA,
    QTDFAT,
    QTDPERDA
FROM TPRAPA 
WHERE NUAPO = 119438;

-- Resultado:
-- NUAPO: 119438, SEQAPA: 1, CODPRODPA: 56572
-- QTDAPONTADA: 9.83 ✅, QTDFAT: 9.83 ✅, QTDPERDA: 0.138

-- 2. TPRAPF (Faturamento Apontamento)
SELECT 
    NUAPO,
    SEQAPA,
    NUNOTA,
    QTD
FROM TPRAPF 
WHERE NUAPO = 119438;

-- Resultado:
-- NUAPO: 119438, SEQAPA: 1, NUNOTA: 451117, QTD: 9.83 ✅

-- 3. TGFITE (Item Nota Fiscal)
SELECT 
    NUNOTA,
    SEQUENCIA,
    CODPROD,
    CONTROLE,
    QTDNEG,
    VLRTOT,
    VLRUNIT
FROM TGFITE 
WHERE NUNOTA = 451117
  AND SEQUENCIA = 1;

-- Resultado:
-- NUNOTA: 451117, SEQUENCIA: 1, CODPROD: 56572, CONTROLE: 0126000110
-- QTDNEG: 9.83 ✅, VLRTOT: 440.09 ✅, VLRUNIT: 44.769662

-- 4. TGFCAB (Cabeçalho Nota Fiscal)
SELECT 
    NUNOTA,
    NUMNOTA,
    VLRNOTA,
    STATUSNOTA,
    STATUSNFE
FROM TGFCAB 
WHERE NUNOTA = 451117;

-- Resultado:
-- NUNOTA: 451117, NUMNOTA: 44617, VLRNOTA: 769.06 ✅
-- STATUSNOTA: L, STATUSNFE: NULL
```

### Verificação no Sistema Sankhya

Após a correção, o valor aparece corretamente na tela:
- **Quantidade: 9.830,0000 KG** (9 quilos e 830 gramas) ✅

---

## 📚 Glossário de Campos

### Tabelas Principais

| Tabela | Descrição | Prefixo |
|--------|-----------|---------|
| TPRIPROC | Cabeçalho da Instância do Processo (OP) | Instância Processo |
| TPRIPA | Produtos Acabados a Produzir | Instância PA |
| TPRIATV | Instância de Atividade | Instância Atividade |
| TPRAPO | Cabeçalho de Apontamento | Apontamento |
| TPRAPA | Apontamento de Produto Acabado | Apontamento PA |
| TPRAPF | Faturamento de Apontamento | Apontamento Faturamento |
| TPRAMP | Apontamento de Matérias-Primas | Apontamento MP |
| TGFCAB | Cabeçalho de Nota Fiscal | Nota Fiscal |
| TGFITE | Itens de Nota Fiscal | Item Nota |

### Campos Importantes - TPRIPROC

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| IDIPROC | NUMBER | ID da instância do processo (Número da OP) | Único |
| NUNOTA | NUMBER | Número da nota fiscal vinculada | NULL = não gerou nota |
| STATUSPROC | VARCHAR | Status do processo | **A** = Aberta/Em Andamento<br>**P** = Planejada<br>**R** = Em Revisão<br>**P2** = Programada<br>**S** = Suspensa<br>**S2** = Suspensa 2<br>**C** = Cancelada<br>**AP** = Aprovada<br>**F** = Finalizada |
| DHINST | DATE | Data/Hora de instanciação (criação) | Timestamp |
| DHTERMINO | DATE | Data/Hora de término | NULL = não finalizada |
| CODPARC | NUMBER | Código do parceiro (cliente) | FK TGFPAR |
| NUMPS | NUMBER | Número do pedido de serviço | Pode ser NULL |
| NROLOTE | VARCHAR | Número do lote | Identificação do lote |

### Campos Importantes - TPRIPA

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| IDIPROC | NUMBER | ID da OP (FK TPRIPROC) | Chave estrangeira |
| CODPRODPA | NUMBER | Código do produto acabado | FK TGFPRO |
| CONTROLEPA | VARCHAR | Controle do produto acabado (lote) | Pode ser NULL |
| QTDPRODUZIR | NUMBER | Quantidade prevista a produzir | Decimal |
| QTDPRODUZIR_ORIGINAL | NUMBER | Quantidade original antes de ajustes | Pode ser NULL |
| NROLOTE | VARCHAR | Número do lote | Mesmo da OP |
| CONCLUIDO | CHAR | Flag de conclusão | **S** = Sim<br>**N** = Não |
| DTVAL | DATE | Data de validade | Timestamp |
| DTFAB | DATE | Data de fabricação | Timestamp |

### Campos Importantes - TPRIATV

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| IDIATV | NUMBER | ID da instância da atividade | Único |
| IDIPROC | NUMBER | ID da OP (FK TPRIPROC) | Chave estrangeira |
| IDEFX | NUMBER | ID do elemento de fluxo | FK TPREFX |
| CODWCP | NUMBER | Código do work center | FK TPRWCP |
| DHINCLUSAO | DATE | Data/Hora de inclusão | Timestamp |
| DHINICIO | DATE | Data/Hora de início | NULL = não iniciada |
| DHFINAL | DATE | Data/Hora final | NULL = não finalizada |

### Campos Importantes - TPRAPO

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| NUAPO | NUMBER | Número único do apontamento | Único (PK) |
| IDIATV | NUMBER | ID da atividade (FK TPRIATV) | Chave estrangeira |
| DHAPO | DATE | Data/Hora do apontamento | Timestamp |
| CODUSU | NUMBER | Código do usuário | FK TSIUSU |
| OBSERVACAO | VARCHAR | Observações | Texto livre |
| SITUACAO | CHAR | Situação do apontamento | **A** = Aberto<br>**C** = Confirmado<br>**E** = Estornado |

### Campos Importantes - TPRAPA (Apontamento de PA)

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| NUAPO | NUMBER | Número do apontamento (FK TPRAPO) | Chave estrangeira (PK) |
| SEQAPA | NUMBER | Sequência do PA no apontamento | 1, 2, 3... (PK) |
| CODPRODPA | NUMBER | Código do produto acabado | FK TGFPRO |
| CONTROLEPA | VARCHAR | Controle do PA (lote) | Pode ser NULL |
| **QTDAPONTADA** | **NUMBER** | **Quantidade apontada/produzida** ⭐ | **Decimal (valor corrigido)** |
| **QTDFAT** | **NUMBER** | **Quantidade faturada** ⭐ | **Decimal (valor corrigido)** |
| QTDFATSP | NUMBER | Quantidade faturada subproduto | Decimal |
| QTDPERDA | NUMBER | Quantidade de perda | Decimal |
| CODMPE | NUMBER | Código do motivo de perda | FK TPRMPE |
| QTDMPE | NUMBER | Quantidade do motivo de perda | Decimal |

### Campos Importantes - TPRAPF (Faturamento)

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| NUAPO | NUMBER | Número do apontamento (FK TPRAPO) | Chave estrangeira (PK) |
| SEQAPA | NUMBER | Sequência do PA (FK TPRAPA) | 1, 2, 3... (PK) |
| NUNOTA | NUMBER | Número da nota fiscal | FK TGFCAB |
| SEQITE | NUMBER | Sequência do item na nota | FK TGFITE |
| **QTD** | **NUMBER** | **Quantidade faturada** ⭐ | **Decimal (valor corrigido)** |

### Campos Importantes - TPRAMP (Matérias-Primas)

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| NUAPO | NUMBER | Número do apontamento (FK TPRAPO) | Chave estrangeira (PK) |
| SEQAPA | NUMBER | Sequência do PA (FK TPRAPA) | 1, 2, 3... (PK) |
| CODPRODMP | NUMBER | Código do produto MP | FK TGFPRO (PK) |
| CONTROLEMP | VARCHAR | Controle da MP (lote) | Pode ser NULL (PK) |
| QTD | NUMBER | Quantidade consumida | Decimal |
| CODVOL | VARCHAR | Unidade de medida | KG, UN, LT, etc |
| TIPOUSO | CHAR | Tipo de uso | **C** = Consumo<br>**R** = Retorno |
| SEQMP | NUMBER | Sequência da MP | Número sequencial |
| CODLOCALBAIXA | NUMBER | Local de baixa | FK TGFLOC |

### Campos Importantes - TGFCAB (Nota Fiscal)

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| NUNOTA | NUMBER | Número único da nota | Único (PK) |
| NUMNOTA | VARCHAR | Número da NF | Número impresso |
| SERIENOTA | VARCHAR | Série da NF | Série da nota |
| STATUSNOTA | CHAR | Status da nota | **P** = Pendente<br>**L** = Liberada<br>**A** = Aprovada<br>**C** = Cancelada |
| STATUSNFE | CHAR | Status da NFe (SEFAZ) | **A** = Autorizada<br>**C** = Cancelada<br>**I** = Inutilizada<br>**D** = Denegada<br>NULL = Não transmitida |
| DTNEG | DATE | Data de negociação | Timestamp |
| VLRNOTA | NUMBER | Valor total da nota | Decimal |
| TIPMOV | CHAR | Tipo de movimento | **O** = Ordem<br>**C** = Compra<br>**V** = Venda<br>**P** = Produção |

### Campos Importantes - TGFITE (Itens da Nota)

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| NUNOTA | NUMBER | Número da nota (FK TGFCAB) | Chave estrangeira (PK) |
| SEQUENCIA | NUMBER | Sequência do item | 1, 2, 3... (PK) |
| CODPROD | NUMBER | Código do produto | FK TGFPRO |
| CONTROLE | VARCHAR | Controle (lote) | Pode ser NULL |
| QTDNEG | NUMBER | Quantidade negociada | Decimal |
| VLRUNIT | NUMBER | Valor unitário | Decimal |
| VLRTOT | NUMBER | Valor total | Decimal |
| PENDENTE | CHAR | Item pendente | **S** = Sim<br>**N** = Não |
| ATUALESTOQUE | CHAR | Atualiza estoque | **S** = Sim<br>**N** = Não |

---

## 🔧 Queries de Referência

### 1. Descobrir Relacionamentos de uma Tabela

```sql
SELECT 
    TAB_ORIG.NOMETAB || ' - ' || TAB_ORIG.DESCRTAB TABELA_ORIGEM, 
    CAM_ORIG.NOMECAMPO || ' - ' || CAM_ORIG.DESCRCAMPO CAMPO_ORIGEM,
    TAB_DEST.NOMETAB || ' - ' || TAB_DEST.DESCRTAB TABELA_DESTINO, 
    CAM_DEST.NOMECAMPO || ' - ' || CAM_DEST.DESCRCAMPO CAMPO_DESTINO
FROM
    TDDTAB TAB_ORIG 
    INNER JOIN TDDCAM CAM_ORIG ON TAB_ORIG.NOMETAB = CAM_ORIG.NOMETAB
    INNER JOIN TDDLGC LGC ON LGC.NUCAMPOORIG = CAM_ORIG.NUCAMPO
    INNER JOIN TDDCAM CAM_DEST ON CAM_DEST.NUCAMPO = LGC.NUCAMPODEST 
    INNER JOIN TDDTAB TAB_DEST ON TAB_DEST.NOMETAB = CAM_DEST.NOMETAB 
    INNER JOIN TDDLIG LIG ON LIG.NUINSTORIG = LGC.NUINSTORIG AND LIG.NUINSTDEST = LGC.NUINSTDEST
    INNER JOIN TDDINS INS_ORIG ON INS_ORIG.NUINSTANCIA = LIG.NUINSTORIG 
    INNER JOIN TDDINS INS_DEST ON INS_DEST.NUINSTANCIA = LIG.NUINSTDEST
WHERE 
    (TAB_ORIG.NOMETAB = '[NOME_DA_TABELA]' OR TAB_DEST.NOMETAB = '[NOME_DA_TABELA]');
```

### 2. Localizar Ordem de Produção

```sql
-- Por número da OP
SELECT * FROM TPRIPROC WHERE IDIPROC = [NUMERO_OP];

-- Por produto
SELECT * FROM TPRIPA WHERE CODPRODPA = [CODIGO_PRODUTO];

-- Por lote
SELECT * FROM TPRIPROC WHERE NROLOTE = '[NUMERO_LOTE]';
```

### 3. Localizar Apontamentos de uma OP

```sql
SELECT 
    IPROC.IDIPROC AS "OP",
    IATV.IDIATV AS "ID Atividade",
    APO.NUAPO AS "Num Apontamento",
    APO.DHAPO AS "Data Apontamento",
    APO.SITUACAO AS "Situação",
    APA.CODPRODPA AS "Produto",
    APA.QTDAPONTADA AS "Qtd Apontada",
    APA.QTDFAT AS "Qtd Faturada"
FROM TPRIPROC IPROC
INNER JOIN TPRIATV IATV ON IATV.IDIPROC = IPROC.IDIPROC
INNER JOIN TPRAPO APO ON APO.IDIATV = IATV.IDIATV
INNER JOIN TPRAPA APA ON APA.NUAPO = APO.NUAPO
WHERE IPROC.IDIPROC = [NUMERO_OP]
ORDER BY APO.DHAPO DESC;
```

### 4. Verificar Status de Triggers

```sql
SELECT 
    TRIGGER_NAME,
    TRIGGER_TYPE,
    TRIGGERING_EVENT,
    STATUS
FROM USER_TRIGGERS
WHERE TABLE_NAME = '[NOME_TABELA]';
```

### 5. Verificar se OP Gerou Nota Fiscal

```sql
-- Ver se tem nota vinculada
SELECT 
    IPROC.IDIPROC,
    IPROC.NUNOTA,
    IPROC.STATUSPROC,
    CAB.NUMNOTA,
    CAB.STATUSNOTA,
    CAB.STATUSNFE
FROM TPRIPROC IPROC
LEFT JOIN TGFCAB CAB ON CAB.NUNOTA = IPROC.NUNOTA
WHERE IPROC.IDIPROC = [NUMERO_OP];

-- Se NUNOTA = NULL, não gerou nota ainda
```

### 6. Template de Correção com Trigger

```sql
-- 1. Verificar triggers
SELECT TRIGGER_NAME, STATUS 
FROM USER_TRIGGERS 
WHERE TABLE_NAME = '[TABELA]';

-- 2. Desabilitar trigger (se necessário)
ALTER TRIGGER [NOME_TRIGGER] DISABLE;

-- 3. Fazer UPDATEs
UPDATE [TABELA1] 
SET [CAMPO] = [VALOR]
WHERE [CONDICOES];

UPDATE [TABELA2] 
SET [CAMPO] = [VALOR]
WHERE [CONDICOES];

-- 4. Commit
COMMIT;

-- 5. Reabilitar trigger
ALTER TRIGGER [NOME_TRIGGER] ENABLE;

-- 6. Verificar resultado
SELECT * FROM [TABELA] WHERE [CONDICOES];
```

### 7. Verificação Completa de uma OP

```sql
SELECT 
    'OP' AS TIPO,
    TO_CHAR(IDIPROC) AS CODIGO,
    STATUSPROC AS STATUS,
    TO_CHAR(DHINST, 'DD/MM/YYYY HH24:MI') AS DATA
FROM TPRIPROC 
WHERE IDIPROC = [NUMERO_OP]

UNION ALL

SELECT 
    'PA Previsto' AS TIPO,
    TO_CHAR(CODPRODPA) AS CODIGO,
    TO_CHAR(QTDPRODUZIR) AS STATUS,
    NROLOTE AS DATA
FROM TPRIPA 
WHERE IDIPROC = [NUMERO_OP]

UNION ALL

SELECT 
    'Apontamento' AS TIPO,
    TO_CHAR(APO.NUAPO) AS CODIGO,
    APO.SITUACAO AS STATUS,
    TO_CHAR(APO.DHAPO, 'DD/MM/YYYY HH24:MI') AS DATA
FROM TPRAPO APO
INNER JOIN TPRIATV IATV ON IATV.IDIATV = APO.IDIATV
WHERE IATV.IDIPROC = [NUMERO_OP]

UNION ALL

SELECT 
    'PA Apontado' AS TIPO,
    TO_CHAR(APA.CODPRODPA) AS CODIGO,
    TO_CHAR(APA.QTDAPONTADA) AS STATUS,
    TO_CHAR(APA.QTDFAT) AS DATA
FROM TPRAPA APA
INNER JOIN TPRAPO APO ON APO.NUAPO = APA.NUAPO
INNER JOIN TPRIATV IATV ON IATV.IDIATV = APO.IDIATV
WHERE IATV.IDIPROC = [NUMERO_OP]

UNION ALL

SELECT 
    'MP Consumida' AS TIPO,
    TO_CHAR(AMP.CODPRODMP) AS CODIGO,
    TO_CHAR(AMP.QTD) AS STATUS,
    AMP.CODVOL AS DATA
FROM TPRAMP AMP
INNER JOIN TPRAPO APO ON APO.NUAPO = AMP.NUAPO
INNER JOIN TPRIATV IATV ON IATV.IDIATV = APO.IDIATV
WHERE IATV.IDIPROC = [NUMERO_OP];
```

---

## 🎯 Matriz de Decisão

### Fluxo de Decisão para Correção de Valores

```
┌─────────────────────────────┐
│   Valor Errado Detectado    │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  OP Gerou Nota Fiscal?      │
│  (TPRIPROC.NUNOTA != NULL)  │
└──────┬──────────────┬───────┘
       │              │
    SIM│              │NÃO
       │              │
       ▼              ▼
┌──────────────┐  ┌──────────────────┐
│Verificar     │  │Corrigir apenas   │
│STATUSNFE     │  │Apontamento       │
│(TGFCAB)      │  │(TPRAPA/TPRAPF)   │
└──────┬───────┘  └────────┬─────────┘
       │                   │
       │                   ▼
       │           ┌──────────────────┐
       │           │1. Desabilitar    │
       │           │   trigger        │
       │           │2. UPDATE         │
       │           │3. Verificar      │
       │           │4. COMMIT         │
       │           │5. Reabilitar     │
       │           └──────────────────┘
       │
       ▼
┌──────────────────────┐
│STATUSNFE = NULL?     │
│(Não transmitida)     │
└───┬──────────────┬───┘
    │              │
  SIM│              │NÃO
    │              │
    ▼              ▼
┌─────────────┐ ┌──────────────────┐
│Pode Corrigir│ │NÃO pode corrigir │
│TGFITE +     │ │diretamente       │
│TGFCAB       │ │                  │
└──────┬──────┘ │Opções:           │
       │        │- Carta correção  │
       │        │- Cancelamento    │
       │        │- Nota complementar│
       │        └──────────────────┘
       ▼
┌──────────────────┐
│1. Verificar      │
│   triggers       │
│2. Desabilitar se │
│   necessário     │
│3. UPDATE TGFITE  │
│4. UPDATE TGFCAB  │
│5. Validar soma   │
│6. COMMIT         │
│7. Reabilitar     │
└──────────────────┘
```

### Tabela de Decisão Rápida

| Situação | NUNOTA | STATUSNFE | Ação |
|----------|--------|-----------|------|
| OP sem nota | NULL | N/A | ✅ Corrigir TPRAPA/TPRAPF apenas |
| Nota não transmitida | Preenchido | NULL | ✅ Corrigir TPRAPA/TPRAPF + TGFITE/TGFCAB |
| Nota autorizada | Preenchido | A | ❌ Não corrigir - usar carta de correção |
| Nota cancelada | Preenchido | C | ⚠️ Avaliar caso a caso |

### Checklist de Segurança Pré-Correção

Antes de iniciar qualquer correção, verificar:

- [ ] **Status da OP**
  ```sql
  SELECT IDIPROC, STATUSPROC, NUNOTA FROM TPRIPROC WHERE IDIPROC = [OP];
  ```
  
- [ ] **Status da Nota** (se NUNOTA != NULL)
  ```sql
  SELECT NUNOTA, STATUSNOTA, STATUSNFE FROM TGFCAB WHERE NUNOTA = [NOTA];
  ```

- [ ] **Triggers Ativos**
  ```sql
  SELECT TRIGGER_NAME, STATUS FROM USER_TRIGGERS 
  WHERE TABLE_NAME IN ('TPRAPA', 'TPRAPF', 'TGFITE', 'TGFCAB');
  ```

- [ ] **Backup** (opcional, mas recomendado)
  ```sql
  CREATE TABLE [TABELA]_BACKUP AS SELECT * FROM [TABELA] WHERE [CONDICOES];
  ```

- [ ] **Ambiente** (produção ou homologação?)

- [ ] **Aprovação** (supervisor ciente da correção?)

### Procedimento Completo por Cenário

#### Cenário 1: OP sem Nota Fiscal

**Tabelas a corrigir:** TPRAPA, TPRAPF

```sql
-- 1. Verificar trigger
SELECT TRIGGER_NAME, STATUS FROM USER_TRIGGERS WHERE TABLE_NAME = 'TPRAPA';

-- 2. Se necessário, desabilitar
ALTER TRIGGER TRG_INC_UPD_DLT_TPRAPA DISABLE;

-- 3. Corrigir
UPDATE TPRAPA SET QTDAPONTADA = [VALOR], QTDFAT = [VALOR] WHERE NUAPO = [APONTAMENTO];
UPDATE TPRAPF SET QTD = [VALOR] WHERE NUAPO = [APONTAMENTO];

-- 4. Verificar
SELECT QTDAPONTADA, QTDFAT FROM TPRAPA WHERE NUAPO = [APONTAMENTO];
SELECT QTD FROM TPRAPF WHERE NUAPO = [APONTAMENTO];

-- 5. COMMIT e reabilitar
COMMIT;
ALTER TRIGGER TRG_INC_UPD_DLT_TPRAPA ENABLE;
```

#### Cenário 2: Nota Não Transmitida (STATUSNFE = NULL)

**Tabelas a corrigir:** TPRAPA, TPRAPF, TGFITE, TGFCAB

```sql
-- PARTE 1: Corrigir Apontamento (igual Cenário 1)
[...executa procedimento do Cenário 1...]

-- PARTE 2: Corrigir Nota Fiscal
-- 1. Verificar trigger
SELECT TRIGGER_NAME, STATUS FROM USER_TRIGGERS WHERE TABLE_NAME = 'TGFITE';

-- 2. Desabilitar se necessário
ALTER TRIGGER TRG_UPT_TGFITE DISABLE;

-- 3. Calcular diferença
SELECT 
    (QTDNEG_ANTIGA * VLRUNIT) - (QTDNEG_NOVA * VLRUNIT) AS DIFERENCA
FROM TGFITE WHERE NUNOTA = [NOTA] AND SEQUENCIA = [SEQ];

-- 4. Corrigir TGFITE
UPDATE TGFITE 
SET QTDNEG = [VALOR_NOVO],
    VLRTOT = ROUND(QTDNEG * VLRUNIT, 2)
WHERE NUNOTA = [NOTA] AND SEQUENCIA = [SEQ];

-- 5. Corrigir TGFCAB
UPDATE TGFCAB 
SET VLRNOTA = VLRNOTA - [DIFERENCA]
WHERE NUNOTA = [NOTA];

-- 6. Validar consistência
SELECT 
    CAB.VLRNOTA,
    SUM(ITE.VLRTOT) AS SOMA_ITENS,
    (CAB.VLRNOTA - SUM(ITE.VLRTOT)) AS DIFERENCA
FROM TGFCAB CAB
INNER JOIN TGFITE ITE ON ITE.NUNOTA = CAB.NUNOTA
WHERE CAB.NUNOTA = [NOTA]
GROUP BY CAB.VLRNOTA;

-- 7. COMMIT e reabilitar
COMMIT;
ALTER TRIGGER TRG_UPT_TGFITE ENABLE;
```

#### Cenário 3: Nota Autorizada SEFAZ (STATUSNFE = 'A')

**Ação:** NÃO corrigir diretamente no banco!

**Alternativas:**
1. **Carta de Correção Eletrônica (CC-e)**
   - Para erros que não afetam valor ou destinatário
   - Emitir via sistema Sankhya

2. **Cancelamento + Nova Nota**
   - Se dentro do prazo de cancelamento
   - Gerar nova nota com valores corretos

3. **Nota Complementar**
   - Para diferenças de valor
   - Emitir nota adicional com ajuste

**Consultar contador/fiscal antes de tomar decisão!**

---

## ⚠️ Observações Importantes

### 1. Sempre Usar Transações

```sql
-- Iniciar verificação
SELECT * FROM tabela WHERE condicoes;

-- Fazer UPDATE
UPDATE tabela SET campo = valor WHERE condicoes;

-- Verificar resultado
SELECT * FROM tabela WHERE condicoes;

-- Se está OK
COMMIT;

-- Se deu errado
ROLLBACK;
```

### 2. Backup Antes de Alterar

```sql
-- Criar backup de segurança
CREATE TABLE TPRAPA_BACKUP AS 
SELECT * FROM TPRAPA WHERE NUAPO = 119438;

-- Verificar backup
SELECT * FROM TPRAPA_BACKUP;

-- Após confirmar que está tudo OK, deletar backup
DROP TABLE TPRAPA_BACKUP;
```

### 3. Triggers Podem Recalcular Valores

- Sempre verifique se existem triggers ativos
- Triggers podem causar valores inesperados após UPDATEs
- Teste primeiro em homologação quando possível

### 4. Separadores Decimais

- **SQL Oracle:** Use sempre PONTO (.) → `9.83`
- **Tela Sankhya (BR):** Mostra VÍRGULA (,) → `9,830`
- **Não confundir:** `9830` ≠ `9.83`

### 5. Status da OP Importa

- **OP Aberta (A):** Pode alterar apontamentos livremente
- **OP Finalizada:** Pode precisar reabrir para alterar
- **Com Nota Gerada:** Avaliar impacto na nota fiscal

### 6. Nota Fiscal Gerada

Se `TPRIPROC.NUNOTA` não for NULL:
- Verificar `TGFCAB.STATUSNFE`
- Se **Autorizada (A):** NÃO pode alterar diretamente
- Pode precisar de carta de correção ou cancelamento

---

## 📊 Resumo do Caso Real

| Item | Detalhes |
|------|----------|
| **OP** | 127126 |
| **Produto** | 56572 (RESINA DIL. EVOBLOCK MULTI - BL) |
| **Lote** | 0126000110 |
| **Apontamento** | 119438 |
| **Nota Fiscal** | 451117 (Número: 44617) |
| **Erro** | Operadora digitou 9830 ao invés de 9.83 |
| **Valor Incorreto** | 9830 kg (~9 toneladas e 830 kg) |
| **Valor Correto** | 9.83 kg (9 quilos e 830 gramas) |
| **Tabelas Corrigidas** | TPRAPA (2 campos), TPRAPF (1 campo), TGFITE (2 campos), TGFCAB (1 campo) |
| **Triggers Desabilitados** | TRG_INC_UPD_DLT_TPRAPA, TRG_UPT_TGFITE |
| **Método** | Desabilitar trigger → UPDATE → Verificar → COMMIT → Reabilitar trigger |
| **Status OP** | Aberta (A) - Não finalizou |
| **Status Nota** | Liberada (L) - Não transmitida à SEFAZ (STATUSNFE = NULL) |
| **Cenário** | Nota não transmitida - Pôde corrigir todas as tabelas |
| **Resultado** | ✅ Sucesso - Todos os valores corretos no banco |

### Valores Corrigidos - Resumo

| Tabela | Campo | Antes | Depois | Diferença |
|--------|-------|-------|--------|-----------|
| TPRAPA | QTDAPONTADA | 9830 | 9.83 | -9820.17 |
| TPRAPA | QTDFAT | 9830 | 9.83 | -9820.17 |
| TPRAPF | QTD | 9830 | 9.83 | -9820.17 |
| TGFITE | QTDNEG | 9830 | 9.83 | -9820.17 |
| TGFITE | VLRTOT | 440085.78 | 440.09 | -439645.69 |
| TGFCAB | VLRNOTA | 440414.74 | 769.06 | -439645.68 |

---

## 🎯 Conclusão

Este documento demonstra o processo completo de correção de valores no Sankhya ERP (Oracle), incluindo:

1. ✅ **Análise de logs** do sistema para identificar o problema
2. ✅ **Uso do dicionário de dados** (TDDTAB, TDDCAM, TDDLGC) para mapear relacionamentos
3. ✅ **Identificação de hierarquia** de tabelas (OP → Apontamento → Nota Fiscal)
4. ✅ **Localização de valores incorretos** em múltiplas tabelas
5. ✅ **Análise de triggers** (77 triggers ativos identificados)
6. ✅ **Gerenciamento seguro de triggers** (desabilitar → corrigir → reabilitar)
7. ✅ **Correção de apontamento** (TPRAPA, TPRAPF)
8. ✅ **Correção de nota fiscal** (TGFITE, TGFCAB)
9. ✅ **Validação de consistência** (soma dos itens = valor da nota)
10. ✅ **Uso de transações** (ROLLBACK para testes, COMMIT para confirmar)
11. ✅ **Verificação de status SEFAZ** antes de alterar notas
12. ✅ **Documentação completa** para referência futura

### Principais Aprendizados

**1. Dicionário de Dados é Essencial**
- Permite descobrir relacionamentos sem conhecer toda a estrutura
- Query padrão reutilizável para qualquer tabela
- Fundamental para entender cascata de dados

**2. Triggers Podem Bloquear ou Recalcular**
- Sempre verificar triggers antes de UPDATE
- Testar com ROLLBACK antes de COMMIT
- Desabilitar apenas quando necessário
- SEMPRE reabilitar após finalizar

**3. Nota Fiscal Requer Cuidados Especiais**
- Verificar STATUSNFE antes de qualquer alteração
- Nota autorizada SEFAZ não pode ser alterada diretamente
- Manter consistência: VLRNOTA = Σ(VLRTOT)
- Diferenças de centavos por arredondamento são normais

**4. Processo Iterativo de Investigação**
- Começar pelo log do sistema
- Seguir a trilha: OP → Apontamento → Nota
- Verificar cada tabela relacionada
- Validar consistência em cada etapa

**5. Segurança em Primeiro Lugar**
- Usar ROLLBACK para testes
- Verificar antes de COMMIT
- Backup opcional mas recomendado
- Sempre ter aprovação do supervisor

### Aplicabilidade

Este processo pode ser aplicado para correções de:
- ✅ Quantidades em apontamentos de produção
- ✅ Valores em notas fiscais não transmitidas
- ✅ Erros de digitação em qualquer campo numérico
- ✅ Inconsistências entre tabelas relacionadas
- ✅ Problemas com triggers que impedem UPDATEs normais

### Limitações

Este processo **NÃO deve ser usado** para:
- ❌ Notas fiscais já autorizadas na SEFAZ
- ❌ Alterações que afetam estoque em grande escala
- ❌ Correções que impactam contas a pagar/receber já fechadas
- ❌ Modificações em períodos contábeis já encerrados
- ❌ Qualquer alteração sem aprovação do supervisor/fiscal

**Tempo total do processo:** Aproximadamente 4-5 horas (incluindo investigação, correção e documentação completa)

**Nível de complexidade:** Médio-Alto (requer conhecimento de Oracle, SQL, estrutura do Sankhya e conceitos fiscais)

**Taxa de sucesso:** 100% quando seguido corretamente e aplicado nos cenários apropriados

---

**Documento criado em:** 06/02/2026  
**Última atualização em:** 06/02/2026  
**Autor:** Márcio (IT Specialist - EVODEN)  
**Versão:** 2.0  
**Sistema:** Sankhya ERP - Oracle Database  
**Status:** ✅ Testado e aprovado em produção
