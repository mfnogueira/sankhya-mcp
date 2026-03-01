# Adendo — Aspas Simples e Aspas Duplas no Dashboard HTML5 Sankhya

---

## O contexto do problema

A query SQL é construída como uma **string JavaScript** dentro do JSP. Isso cria três camadas que usam aspas simultaneamente:

| Camada | Usa |
|---|---|
| JavaScript (delimitador de string) | `"aspas duplas"` |
| SQL (valores literais e aliases) | `'aspas simples'` |
| JSP / EL (atributos HTML) | `"aspas duplas"` |

A regra prática é simples: **dentro de uma string JavaScript delimitada por `"`, usar sempre `'` para os literais SQL**.

---

## Regra principal

```javascript
// String JavaScript → aspas duplas por fora
var query =
    "SELECT * FROM TGFCAB WHERE TIPMOV = 'O' AND STATUSNOTA = 'L'"
//   ↑ abre string JS                         ↑ literal SQL com aspas simples
```

Nunca usar aspas duplas dentro da string SQL — quebraria a string JavaScript:

```javascript
// ERRADO — a aspas dupla fecha a string JS prematuramente
var query = "SELECT * FROM TGFCAB WHERE TIPMOV = "O""
//                                                ↑ fecha a string aqui — erro de sintaxe
```

---

## Aplicação em cada situação

### Literais SQL (valores fixos na query)

```javascript
var query =
    "... WHERE CAB.TIPMOV = 'O'" +          // ✓ aspas simples
    "  AND CAB.STATUSNOTA = 'L'" +           // ✓ aspas simples
    "  AND ITE.CODVOL != 'MI'"               // ✓ aspas simples
```

### Parâmetros Multi List (já chegam com aspas simples)

```javascript
var pUsoprod = "${P_USOPROD}";
// valor em tempo de execução: 'E', 'M'  ← aspas simples já incluídas pelo Sankhya

var query = "... AND PRO.USOPROD IN (" + pUsoprod + ")"
// resultado: ... AND PRO.USOPROD IN ('E', 'M')  ✓
```

### Parâmetro booleano convertido para literal SQL

```javascript
var pEstBaixo = ("${P_EST_BAIXO}" == "true") ? "S" : "N";
// pEstBaixo === "S" ou "N" — string JavaScript com aspas duplas

var query = "... CASE WHEN '" + pEstBaixo + "' = 'S' THEN ..."
// resultado: ... CASE WHEN 'S' = 'S' THEN ...  ✓
// as aspas simples ao redor de pEstBaixo transformam o valor JS num literal SQL
```

### Concatenação de fragmentos

```javascript
var query =
    "WITH BASE AS (" +           // ← concatenação com +
    "  SELECT CODPROD" +
    "  FROM TGFPRO" +
    "  WHERE ATIVO = 'S'" +      // ← literal SQL com aspas simples
    ")"
```

---

## Resumo rápido

| Situação | Usar |
|---|---|
| Delimitador da string JavaScript | `"aspas duplas"` |
| Literal de texto no SQL (`WHERE CAMPO = ?`) | `'aspas simples'` |
| Comparação de parâmetro EL no JavaScript | `"aspas duplas"` — ex: `"${P_EST_BAIXO}" == "true"` |
| Valor do parâmetro booleano injetado no SQL | Envolver com `'aspas simples'` na query |
| Multi List | Não precisa adicionar aspas — já vem formatado com `'aspas simples'` |

---

*Adendo ao Guia Técnico — Dashboard HTML5 Sankhya*
