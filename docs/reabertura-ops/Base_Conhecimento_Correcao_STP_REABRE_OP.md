# Base de Conhecimento: Correção STP_REABRE_OP_EVO_V2

## Problema Identificado

**Data:** 05/02/2026  
**Sistema:** Sankhya ERP (Oracle)  
**Procedure:** STP_REABRE_OP_EVO_V2

### Sintoma
Ao tentar reabrir uma OP finalizada através do botão "Reabrir OP", o sistema retornava erro:
```
Atenção: OP não foi finalizada, portanto não pode ser reaberta.
ORA-06512: em "SANKHYA.STP_REABRE_OP_EVO_V2", line 50
```

### Causa Raiz
Inconsistência lógica entre as procedures de finalização e reabertura:

| Procedure | Validação |
|-----------|-----------|
| **STP_FINALIZA_OP_EVO** | Verifica apenas se `DHFINAL IS NOT NULL` |
| **STP_REABRE_OP_EVO_V2** | Exigia `APONTAPA = 'S'` E `DHFINAL IS NOT NULL` |

**Resultado:** Sistema permitia finalizar OPs com atividades `APONTAPA = 'N'`, mas não permitia reabrir essas mesmas OPs.

---

## Solução Implementada

### Alterações Realizadas

Removido filtro `APONTAPA = 'S'` em 3 pontos da procedure:

**1. Validação (linha ~50)**
```sql
-- ANTES
WHERE OP.IDIPROC = FIELD_IDIPROC
  AND ATV.IDEFX IN (SELECT IDEFX FROM TPRATV WHERE APONTAPA = 'S')
  AND ATV.DHFINAL IS NOT NULL;

-- DEPOIS
WHERE OP.IDIPROC = FIELD_IDIPROC
  AND ATV.DHFINAL IS NOT NULL;
```

**2. UPDATE TPRIATV (linha ~65)**
```sql
-- ANTES
WHERE IDIPROC = FIELD_IDIPROC
  AND IDEFX IN (SELECT IDEFX FROM TPRATV WHERE APONTAPA = 'S')
  AND DHFINAL IS NOT NULL;

-- DEPOIS
WHERE IDIPROC = FIELD_IDIPROC
  AND DHFINAL IS NOT NULL;
```

**3. UPDATE TPREIATV (linha ~75)**
```sql
-- ANTES
WHERE IDIATV = (SELECT IDIATV FROM TPRIATV 
                WHERE IDIPROC = FIELD_IDIPROC
                AND IDEFX IN (SELECT IDEFX FROM TPRATV WHERE APONTAPA = 'S'));

-- DEPOIS
WHERE IDIATV IN (SELECT IDIATV FROM TPRIATV 
                 WHERE IDIPROC = FIELD_IDIPROC
                 AND TPRIATV.IDIATV = TPREIATV.IDIATV);
```

### Justificativa
Alinha o comportamento da reabertura com a finalização, removendo validação inconsistente que impedia casos de uso legítimos.

---

## Verificação

### Confirmar OP foi reaberta
```sql
SELECT IDIPROC, STATUSPROC, DHTERMINO
FROM TPRIPROC 
WHERE IDIPROC IN (129358, 129359, 129360);
```

**Resultado esperado:**
- `STATUSPROC = 'A'` (Aberta)
- `DHTERMINO = NULL`

### Confirmar atividades foram reabertas
```sql
SELECT IDIATV, IDEFX, DHFINAL
FROM TPRIATV
WHERE IDIPROC IN (129358, 129359, 129360);
```

**Resultado esperado:**
- `DHFINAL = NULL` para todas as atividades

---

## Dependências da Procedure

| Objeto | Tipo | Função |
|--------|------|--------|
| ACT_INT_FIELD | FUNCTION | Recupera parâmetros da sessão |
| STP_MSGERRO | PROCEDURE | Exibe mensagens de erro |
| TPRIPROC | TABLE | Cabeçalho da OP |
| TPRIATV | TABLE | Atividades da OP |
| TPREIATV | TABLE | Estatísticas das atividades |
| TPRATV | TABLE | Cadastro de atividades |

---

## Tabelas Envolvidas

### TPRIPROC (Cabeçalho da OP)
- `IDIPROC` - ID da OP
- `STATUSPROC` - Status: **A** (Aberta), **F** (Finalizada), **C** (Cancelada)
- `DHTERMINO` - Data/hora de término (NULL = não finalizada)

### TPRIATV (Atividades da OP)
- `IDIATV` - ID da atividade
- `IDIPROC` - ID da OP (FK)
- `IDEFX` - ID do elemento de fluxo (FK)
- `DHFINAL` - Data/hora final (NULL = não finalizada)

### TPRATV (Cadastro de Atividades)
- `IDEFX` - ID do elemento de fluxo
- `APONTAPA` - Permite apontamento PA: **S** (Sim), **N** (Não)

### TPRAPO (Apontamentos)
- `NUAPO` - Número do apontamento
- `IDIATV` - ID da atividade (FK)
- `SITUACAO` - **A** (Aberto), **C** (Confirmado), **E** (Estornado)

### TPRAPA (Apontamento de PA)
- `NUAPO` - Número do apontamento (FK)
- `CODPRODPA` - Código do produto acabado
- `QTDAPONTADA` - Quantidade apontada
- `QTDFAT` - Quantidade faturada

---

## Queries Úteis

### Localizar OPs finalizadas com APONTAPA='N'
```sql
SELECT 
    IPROC.IDIPROC,
    IPROC.STATUSPROC,
    ATV.IDEFX,
    RATV.APONTAPA
FROM TPRIPROC IPROC
JOIN TPRIATV ATV ON ATV.IDIPROC = IPROC.IDIPROC
JOIN TPRATV RATV ON RATV.IDEFX = ATV.IDEFX
WHERE IPROC.STATUSPROC = 'F'
  AND RATV.APONTAPA = 'N';
```

### Ver histórico de apontamentos de uma OP
```sql
SELECT 
    APO.NUAPO,
    APO.SITUACAO,
    APO.DHAPO,
    APA.CODPRODPA,
    APA.QTDAPONTADA
FROM TPRAPO APO
JOIN TPRIATV ATV ON ATV.IDIATV = APO.IDIATV
LEFT JOIN TPRAPA APA ON APA.NUAPO = APO.NUAPO
WHERE ATV.IDIPROC = 129360
ORDER BY APO.DHAPO DESC;
```

### Verificar procedures relacionadas
```sql
SELECT OBJECT_NAME, STATUS
FROM USER_OBJECTS
WHERE OBJECT_TYPE = 'PROCEDURE'
  AND OBJECT_NAME LIKE '%OP%'
ORDER BY OBJECT_NAME;
```

---

## Reversão (Se Necessário)

Para reverter a correção, na procedure `STP_REABRE_OP_EVO_V2`:

1. Comentar as linhas corrigidas (sem filtro APONTAPA)
2. Descomentar as linhas originais (com filtro APONTAPA='S')
3. Recompilar a procedure

---

## Status
✅ **Implementado em produção:** 05/02/2026  
✅ **Testado com OPs:** 129358, 129359, 129360  
✅ **Resultado:** Sucesso - OPs reabertas corretamente

---

## Lições Aprendidas

1. **Sempre comparar lógica entre procedures relacionadas** (finalização vs reabertura)
2. **Validar consistência de regras de negócio** em diferentes operações
3. **Documentar dependências** para facilitar troubleshooting
4. **Testar em homologação** antes de aplicar em produção
5. **Manter código comentado** facilita rollback se necessário
