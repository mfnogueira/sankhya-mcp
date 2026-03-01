# Guia Técnico — Dashboard HTML5 no Sankhya ERP
**Base de Conhecimento para Desenvolvimento**

> Este documento serve como guia operacional completo para criação de dashboards HTML5 no Construtor de Componentes BI do Sankhya, partindo de queries SQL prontas até o componente funcionando em produção.

---

## Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Estrutura de Arquivos e ZIP](#2-estrutura-de-arquivos-e-zip)
3. [XML do Componente](#3-xml-do-componente)
4. [Parâmetros — Criação e Tipos](#4-parâmetros--criação-e-tipos)
5. [Argumentos e Variáveis](#5-argumentos-e-variáveis)
6. [Fluxo de Configuração no Sankhya](#6-fluxo-de-configuração-no-sankhya)
7. [Padrões de Desenvolvimento do JSP](#7-padrões-de-desenvolvimento-do-jsp)
8. [Como os Parâmetros Chegam no JSP](#8-como-os-parâmetros-chegam-no-jsp)
9. [executeQuery — Uso Correto](#9-executequery--uso-correto)
10. [Regras para as Queries SQL](#10-regras-para-as-queries-sql)
11. [CSS — Estilização](#11-css--estilização)
12. [Performance e Boas Práticas](#12-performance-e-boas-práticas)
13. [Processo de Debug em Camadas](#13-processo-de-debug-em-camadas)
14. [Erros Mapeados e Soluções](#14-erros-mapeados-e-soluções)
15. [Exemplo Completo Funcional](#15-exemplo-completo-funcional)

---

## 1. Visão Geral da Arquitetura

### Quando usar HTML5 vs componente nativo

| Situação | Solução recomendada |
|---|---|
| Tabela simples com filtros | Tabela nativa do Construtor de BI |
| Gráfico de barras / pizza | Gráfico nativo do Construtor de BI |
| Layout customizado, múltiplas queries, lógica JavaScript | **HTML5** |
| Colorização condicional por linha | **HTML5** (formatação condicional nativa só funciona para campos numéricos) |
| Drill-down com detalhes dinâmicos | **HTML5** com argumentos (`A_`) |

### Como o HTML5 funciona no Sankhya

O componente HTML5 é um arquivo `.jsp` hospedado dentro de um pacote `.zip`. O Sankhya:

1. Injeta os parâmetros como variáveis EL (`${P_MESES}`) na página JSP antes de renderizá-la
2. Disponibiliza a função JavaScript nativa `executeQuery()` para executar queries SQL no banco
3. Retorna os resultados como JSON para o JavaScript tratar e renderizar na tela

O JSP **não faz queries diretamente via Java** — toda a comunicação com o banco passa pelo `executeQuery()` em JavaScript.

---

## 2. Estrutura de Arquivos e ZIP

### Estrutura correta do pacote

```
meu_componente.zip
├── meu_componente.jsp        ← arquivo principal (entry point)
└── css/
    └── style.css             ← arquivo CSS (opcional, ver seção 11)
```

### Regras obrigatórias

- O ZIP **não pode ter subpasta raiz** — os arquivos devem estar na raiz do ZIP, não dentro de uma pasta com o nome do projeto
- O nome do `.jsp` deve corresponder exatamente ao que for configurado como **Entry Point** no Sankhya
- A pasta `css/` deve estar na raiz do ZIP (mesmo nível do `.jsp`)
- Não usar outras pastas além de `css/` (ex: `assets/`, `img/` podem causar problemas)

### Como gerar o ZIP corretamente

```bash
# Dentro da pasta do projeto (não comprimir a pasta, comprimir o conteúdo)
zip -r meu_componente.zip meu_componente.jsp css/
```

---

## 3. XML do Componente

### Fluxo de uso do XML

O XML **não é criado do zero** — o Sankhya fornece um modelo base que deve ser baixado, adaptado e colado no componente via interface.

**Caminho no Sankhya:**
`Outras Opções... → Download Modelo Simples HTML5`

Isso gera um XML base (Oracle ou SQL Server). Adaptar esse XML com os parâmetros do componente e colar via botão **XML** na tela do Construtor de Componentes.

### Estrutura do XML (Oracle)

```xml
<gadget>
  <prompt-parameters>

    <!-- Parâmetro inteiro obrigatório -->
    <parameter id="P_MESES" description="Meses para Análise" metadata="integer" required="true" keep-last="true" keep-date="false"/>

    <!-- Parâmetro decimal obrigatório -->
    <parameter id="P_PERC" description="% Ajuste Necessidade" metadata="decimal" required="true" keep-last="true" keep-date="false"/>

    <!-- Parâmetro booleano opcional -->
    <parameter id="P_EST_BAIXO" description="Apenas abaixo do mínimo?" metadata="boolean" required="false" keep-last="false" keep-date="false"/>

    <!-- Multi List com SQL — obrigatório -->
    <parameter id="P_USOPROD" description="Uso do Produto" metadata="multiList:Text" listType="sql" required="true" keep-last="false" keep-date="false">
      <expression type="SQL"><![CDATA[
        SELECT VALOR AS VALUE, OPCAO AS LABEL
        FROM TDDOPC
        WHERE NUCAMPO = (SELECT NUCAMPO FROM TDDCAM WHERE NOMETAB = 'TGFPRO' AND NOMECAMPO = 'USOPROD')
        ORDER BY 1
      ]]></expression>
    </parameter>

    <!-- Multi List com SQL — obrigatório -->
    <parameter id="P_LOCAIS" description="Locais de Estoque" metadata="multiList:Text" listType="sql" required="true" keep-last="false" keep-date="false">
      <expression type="SQL"><![CDATA[
        SELECT CODLOCAL AS VALUE, CODLOCAL || ' - ' || DESCRLOCAL AS LABEL
        FROM TGFLOC
        WHERE ANALITICO = 'S'
        ORDER BY 1
      ]]></expression>
    </parameter>

    <!-- Parâmetro inteiro opcional -->
    <parameter id="P_CODPROD" description="Código do Produto" metadata="integer" required="false" keep-last="false" keep-date="false"/>

  </prompt-parameters>

  <level id="lvl_principal" description="Principal">
    <container orientacao="V" tamanhoRelativo="100">
      <html5component id="html5_principal" entryPoint="meu_componente.jsp"/>
    </container>
  </level>
</gadget>
```

### Diferença Oracle x SQL Server

| Ponto | Oracle | SQL Server |
|---|---|---|
| Limitar linhas no SQL do parâmetro | `WHERE ROWNUM < 20` | `SELECT TOP 20` |
| Restante do XML | Idêntico | Idêntico |

---

## 4. Parâmetros — Criação e Tipos

### Prefixo obrigatório

Todo parâmetro deve começar com **`P_`**
Exemplo: `P_MESES`, `P_DTINI`, `P_CODPROD`, `P_USOPROD`

### Tabela de tipos disponíveis

| Tipo no XML | Tipo exibido no Sankhya | Uso |
|---|---|---|
| `integer` | Número Inteiro | Códigos, quantidades, meses |
| `decimal` | Número Decimal | Percentuais, valores |
| `boolean` | Verdadeiro/Falso | Flags de filtro (S/N) |
| `multiList:Text` | Multi List | Seleção múltipla (locais, tipos) |
| `entity` | Entidade/Tabela | Busca em cadastro do Sankhya |
| `period` | Período | Data início + Data fim |
| `date` | Data | Data única |

### Atributos dos parâmetros e seus checkboxes

| Atributo XML | Checkbox no Sankhya | Quando marcar |
|---|---|---|
| `required="true"` | **Requerido** | Quando o dashboard não deve carregar sem o filtro preenchido — evita consultas pesadas sem filtro |
| `keep-last="true"` | **Salvar último valor** | Marcar durante desenvolvimento para não ter que preencher a cada teste. Em produção, avaliar caso a caso |
| `keep-date="true"` | **Considerar data atual** | Para parâmetros de data que devem iniciar na data de hoje |

### SQL obrigatório para Multi List

O SQL do parâmetro Multi List **deve obrigatoriamente** retornar duas colunas:
- `VALUE` — valor enviado para a query
- `LABEL` — texto exibido para o usuário

```sql
SELECT CODLOCAL AS VALUE,
       CODLOCAL || ' - ' || DESCRLOCAL AS LABEL
FROM TGFLOC
WHERE ANALITICO = 'S'
ORDER BY 1
```

---

## 5. Argumentos e Variáveis

### Argumentos (`A_`)

Argumentos são valores **passados automaticamente pelo sistema**, não preenchidos pelo usuário. São usados em drill-down — quando o usuário clica em um item de um componente e abre outro com contexto.

**Prefixo obrigatório:** `A_`
Exemplos: `A_CODPROD`, `A_NUNOTA`, `A_MESANO`

**Declaração no XML:**
```xml
<level id="lvl_detalhe" description="Detalhe">
  <args>
    <arg id="CODPROD" type="integer"/>
  </args>
  <container orientacao="V" tamanhoRelativo="100">
    <html5component id="html5_detalhe" entryPoint="detalhe_produto.jsp"/>
  </container>
</level>
```

**Uso no JSP do componente de detalhe:**
```javascript
var aCodprod = "${CODPROD}";  // sem o prefixo A_ na EL
```

**Filtro opcional seguro com argumento:**
```javascript
var filtroArg = (aCodprod != "" && aCodprod != "0") ? " AND PRO.CODPROD = " + aCodprod : "";
```

**Abertura do nível de detalhe via clique:**
```javascript
// No componente pai, ao montar a linha da tabela:
tr.onclick = function() {
    openLevel("lvl_detalhe", { CODPROD: parseInt(codprod) });
};
```

### Variáveis

Variáveis são valores internos ao componente, definidos pelo desenvolvedor. Usadas para cálculos reutilizáveis ou textos dinâmicos. Se o cálculo depende de colunas da própria query principal, é mais simples deixar direto no SQL.

### Resumo comparativo

| Elemento | Prefixo | Quem define | Visível ao usuário | Principal uso |
|---|---|---|---|---|
| Parâmetro | `P_` | Usuário | Sim | Filtros do dashboard |
| Argumento | `A_` | Sistema / clique | Não | Drill-down entre componentes |
| Variável | — | Desenvolvedor | Não | Cálculos internos |

---

## 6. Fluxo de Configuração no Sankhya

A ordem de execução é obrigatória — pular etapas causa erro de reconhecimento do componente.

```
ETAPA 1 — Baixar modelo XML
    └── Construtor de Componentes → Outras Opções → Download Modelo Simples HTML5
    └── Escolher Oracle ou SQL Server conforme o banco

ETAPA 2 — Adaptar o XML
    └── Substituir parâmetros de exemplo pelos parâmetros reais do projeto
    └── Ajustar entryPoint para o nome do JSP

ETAPA 3 — Colar o XML no componente
    └── Abrir o componente no Construtor → botão "XML"
    └── Colar o conteúdo adaptado → Salvar

ETAPA 4 — Preparar o ZIP
    └── Estrutura: meu_componente.jsp + css/style.css na raiz
    └── Gerar ZIP sem pasta raiz intermediária

ETAPA 5 — Upload do ZIP
    └── No componente → Outras Opções → Upload ZIP
    └── Confirmar o Entry Point (nome exato do JSP)

ETAPA 6 — Testar
    └── Preencher parâmetros e executar
    └── Verificar console do navegador (F12) em caso de erro
```

---

## 7. Padrões de Desenvolvimento do JSP

### Tags obrigatórias no topo

```jsp
<%@ page language="java" contentType="text/html; charset=ISO-8859-1" pageEncoding="UTF-8" isELIgnored="false"%>
<%@ page import="java.util.*" %>
<%@ taglib uri="http://java.sun.com/jstl/core_rt" prefix="c" %>
<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld" %>
```

- `isELIgnored="false"` — **obrigatório** para que `${P_MESES}` seja interpretado como EL
- `<snk:load/>` — deve ser a primeira tag dentro de `<head>`, carrega o ambiente Sankhya

### Estrutura mínima do JSP

```jsp
<%@ page language="java" contentType="text/html; charset=ISO-8859-1" pageEncoding="UTF-8" isELIgnored="false"%>
<%@ page import="java.util.*" %>
<%@ taglib uri="http://java.sun.com/jstl/core_rt" prefix="c" %>
<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld" %>
<html>
<head>
    <snk:load/>
    <style>
        /* CSS inline obrigatório — ver seção 11 */
    </style>
    <script>
        // 1. Captura dos parâmetros
        // 2. Montagem da query
        // 3. Chamada executeQuery
        // 4. Renderização do resultado
    </script>
</head>
<body>
    <div id="msgVazio" style="display:none;">Nenhum resultado encontrado.</div>
    <div id="msgErro" style="display:none; color:red; font-weight:bold;"></div>
    <div style="overflow-x:auto;">
        <table id="tblDados" style="display:none;"></table>
    </div>
</body>
</html>
```

---

## 8. Como os Parâmetros Chegam no JSP

### Sintaxe EL por tipo

| Tipo do parâmetro | Como capturar no JavaScript |
|---|---|
| `integer` | `var p = parseInt("${P_MESES}") \|\| 3;` |
| `decimal` | `var p = parseFloat("${P_PERC}") \|\| 10;` |
| `boolean` | `var p = ("${P_EST_BAIXO}" == "true") ? "S" : "N";` |
| `multiList:Text` | `var p = "${P_USOPROD}";` — já vem formatado |
| `integer` opcional | `var p = "${P_CODPROD}";` — checar vazio antes de usar |

### Comportamento especial do Multi List ⚠️

O Multi List é o tipo mais importante de entender. O valor chega **já formatado** com aspas simples e vírgulas, pronto para uso numa cláusula `IN`:

```javascript
// Se o usuário selecionou 'E' e 'M':
var pUsoprod = "${P_USOPROD}";
// pUsoprod === "'E', 'M'"

// Se o usuário selecionou os locais 1001 e 5001:
var pLocais = "${P_LOCAIS}";
// pLocais === "'1001', '5001'"
```

Esse valor **deve ser interpolado diretamente na query**, nunca passado pelo array de parâmetros do `executeQuery`:

```javascript
// CORRETO
"... AND PRO.USOPROD IN (" + pUsoprod + ")"

// ERRADO — causa NumberFormatException
var arr = [{value: pUsoprod, type: "IN"}];
"... AND PRO.USOPROD IN (?)"
```

### Parâmetros opcionais — verificação segura

```javascript
var pCodprod = "${P_CODPROD}";
var pGrupo   = "${P_GRUPOPROD}";

// Gerar fragmento de filtro apenas se o valor foi preenchido
var filtroCodprod = (pCodprod != "" && pCodprod != "0")
    ? " AND PRO.CODPROD = " + pCodprod
    : "";

var filtroGrupo = (pGrupo != "" && pGrupo != "0")
    ? " AND PRO.CODGRUPOPROD = " + pGrupo
    : "";
```

---

## 9. executeQuery — Uso Correto

### Assinatura da função

```javascript
executeQuery(query, parametros, onSuccess, onError)
```

| Argumento | Tipo | Descrição |
|---|---|---|
| `query` | String | SQL a executar |
| `parametros` | Array | Valores para substituir `?` na query |
| `onSuccess` | Function | Callback com resultado JSON string |
| `onError` | Function | Callback com mensagem de erro |

### Quando usar array vazio vs array com valores

**Array vazio `[]`** — quando todos os filtros são interpolados diretamente na query (Multi List, opcionais construídos como string):

```javascript
executeQuery(query, [], function(value) {
    var dados = JSON.parse(value);
    // ...
}, function(err) {
    console.error("Erro:", err);
});
```

**Array com valores** — apenas para parâmetros simples e seguros (nunca Multi List, nunca null):

```javascript
// Funciona para valores simples e garantidamente não nulos
var arr = [
    {value: pMeses, type: "I"},   // integer
    {value: pPerc,  type: "F"}    // float/decimal
];
```

**Tipos aceitos no array:**

| type | Uso |
|---|---|
| `"I"` | Inteiro |
| `"F"` | Decimal |
| `"S"` | Texto |
| `"D"` | Data |
| `"IN"` | Multi List (evitar — usar interpolação direta) |

### Padrão recomendado de renderização

```javascript
executeQuery(query, [], function(value) {
    var dados = JSON.parse(value);

    if (dados.length === 0) {
        document.getElementById("msgVazio").style.display = "block";
        return;
    }

    var tabela  = document.getElementById("tblDados");
    var thead   = tabela.createTHead();
    var trHead  = thead.insertRow(0);

    // Cabeçalhos manuais (mais legíveis que os nomes de coluna do SQL)
    var colunas = ["Cód.", "Produto", "Estoque", "Mínimo"];
    for (var i = 0; i < colunas.length; i++) {
        var th = document.createElement("th");
        th.innerHTML = colunas[i];
        trHead.appendChild(th);
    }

    var tbody = tabela.createTBody();
    for (var k = 0; k < dados.length; k++) {
        var d  = dados[k];
        var tr = tbody.insertRow(-1);

        // Colorização condicional por linha
        if (d.BKCOLOR) {
            tr.style.backgroundColor = d.BKCOLOR;
            tr.style.color = d.FGCOLOR;
        }

        // Campos na mesma ordem dos cabeçalhos
        var campos = ["CODPROD", "PRODUTO", "ESTOQUE_FINAL", "EST_MINIMO"];
        for (var j = 0; j < campos.length; j++) {
            var td = tr.insertCell(-1);
            td.innerHTML = d[campos[j]] != null ? d[campos[j]] : "-";
        }
    }

    tabela.style.display = "table";

}, function(err) {
    document.getElementById("msgErro").innerHTML = "Erro: " + err;
    document.getElementById("msgErro").style.display = "block";
    console.error("executeQuery erro:", err);
});
```

---

## 10. Regras para as Queries SQL

### Regras obrigatórias

- **Queries NÃO terminam com `;`** — o ponto e vírgula no final causa erro no Sankhya
- Usar `NVL()` para campos que podem ser NULL em cálculos
- Multi List interpola direto: `IN (" + pLocais + ")` — sem aspas extras na query
- CTEs com WITH funcionam normalmente

### Colorização condicional via SQL

A colorização por linha é feita retornando colunas especiais `BKCOLOR` e `FGCOLOR` no SELECT:

```sql
SELECT
    E.CODPROD,
    E.DESCRPROD,
    -- Fundo vermelho claro + texto vermelho escuro para itens críticos
    CASE WHEN E.ESTOQUE_FINAL < E.ESTMIN
        THEN '#FFCCCC' END AS BKCOLOR,
    CASE WHEN E.ESTOQUE_FINAL < E.ESTMIN
        THEN '#990000' END AS FGCOLOR
FROM ...
```

No JavaScript, aplicar na linha:
```javascript
if (d.BKCOLOR) {
    tr.style.backgroundColor = d.BKCOLOR;
    tr.style.color = d.FGCOLOR;
}
```

> **Nota:** A formatação condicional nativa do Sankhya só funciona para campos numéricos. Para colorizar texto e fundo de linhas, o HTML5 com BKCOLOR/FGCOLOR é a solução correta.

### Parâmetros opcionais no SQL (padrão OR IS NULL)

No SQL nativo do Sankhya (não HTML5), parâmetros opcionais usam:
```sql
AND ((PRO.CODPROD = :P_CODPROD) OR (:P_CODPROD IS NULL))
```

No HTML5, esse padrão é substituído por construção condicional no JavaScript — se o parâmetro não foi preenchido, o fragmento simplesmente não é adicionado à query.

### CTEs e performance

Quando a CTE A alimenta a CTE B, a CTE B deve fazer `FROM CTE_A` em vez de repetir os filtros:

```sql
-- CORRETO: CALCULOS_SAIDA aproveita os filtros já aplicados em BASE_PRODUTO
WITH
BASE_PRODUTO AS (
    SELECT PRO.CODPROD, ...
    FROM TGFPRO PRO
    WHERE PRO.ATIVO = 'S' AND PRO.USOPROD IN (...)
    ...
),
CALCULOS_SAIDA AS (
    SELECT BP.CODPROD,
           ROUND(FUNCAO_PESADA(BP.CODPROD, 3), 2) AS RESULTADO
    FROM BASE_PRODUTO BP  -- ← só processa os produtos que passaram pelos filtros
)
```

---

## 11. CSS — Estilização

### CSS inline é obrigatório ⚠️

O Sankhya **não serve arquivos estáticos do ZIP** como assets. Qualquer `<link rel="stylesheet" href="css/style.css"/>` resulta em erro 404. Todo CSS deve estar inline no `<style>` dentro do `<head>` do JSP.

O arquivo `css/style.css` pode existir no ZIP como referência ou backup, mas não será carregado automaticamente.

### CSS base recomendado

```css
body {
    font-family: arial, sans-serif;
    font-size: 12px;
    margin: 4px;
}
table {
    border-collapse: collapse;
    width: 100%;
}
th {
    background-color: #336699;
    color: white;
    padding: 5px;
    text-align: left;
    font-size: 11px;
    white-space: nowrap;
}
td {
    border: 1px solid #dddddd;
    padding: 4px;
    white-space: nowrap;
}
tr:nth-child(even) {
    background-color: #f2f2f2;
}
tr:hover {
    background-color: #e8f0fe;
}
.msg {
    padding: 20px;
    font-size: 13px;
}
.erro {
    color: red;
    font-weight: bold;
}
```

---

## 12. Performance e Boas Práticas

### Regra principal

> **Não executar cálculos complexos ou UDFs pesadas direto no dashboard para grandes volumes de dados.**

### Problema típico de timeout

Quando a query chama UDFs (funções definidas pelo usuário) para cada linha do resultado, o tempo de execução cresce linearmente. Para 283 produtos chamando 2 UDFs cada, o Sankhya pode encerrar a conexão por timeout antes de retornar os dados.

### Estratégias por cenário

**Cenário 1 — Poucos produtos ou filtro obrigatório restritivo**
Deixar as UDFs na query. Marcar o parâmetro restritivo como `required="true"` garante que o usuário sempre filtre antes de executar.

**Cenário 2 — Muitos produtos, UDFs lentas**
Criar uma **tabela auxiliar pré-calculada** atualizada por job agendado:

```sql
-- Tabela auxiliar (criada uma vez)
CREATE TABLE AD_CALC_SAIDA AS
SELECT
    CODPROD,
    ROUND(EVO_GET_CONSUMO_PROD(CODPROD, 3), 2) AS QT_TOTAL_SAIDA_3M,
    ROUND(FC_GETAVGSAIDA_EVO(CODPROD, 3), 2)   AS QT_MEDIA_SAIDA_3M,
    SYSDATE AS DT_CALCULO
FROM TGFPRO
WHERE ATIVO = 'S'

-- O dashboard faz JOIN nessa tabela — sem chamar UDFs em tempo real
SELECT E.CODPROD, C.QT_TOTAL_SAIDA_3M, ...
FROM BASE_PRODUTO E
JOIN AD_CALC_SAIDA C ON E.CODPROD = C.CODPROD
```

**Cenário 3 — View simples (sem UDFs)**
Uma View Oracle (`CREATE VIEW VGF_...`) melhora a manutenção mas não melhora a performance se ainda chamar UDFs. Só resolve se o cálculo for puramente SQL.

### Outras boas práticas

- Sempre aplicar `NVL()` em campos que podem ser NULL antes de usá-los em cálculos
- Usar `NULLIF()` para evitar divisão por zero: `ROUND(A / NULLIF(B, 0), 0)`
- Índices nas colunas usadas nos JOINs e WHERE (responsabilidade do DBA)
- Testar a query no DBExplorer antes de colocar no JSP — isola erros de SQL de erros de integração

---

## 13. Processo de Debug em Camadas

Seguir sempre esta ordem — cada etapa isola uma camada de problema diferente.

```
CAMADA 1 — JSP mínimo (verifica se o componente carrega)
    └── JSP com apenas <p>${P_MESES}</p>
    └── Se exibir o valor: parâmetro chegando corretamente ✓
    └── Se tela branca: problema na configuração do componente

CAMADA 2 — Query simples (verifica executeQuery)
    └── SELECT SYSDATE FROM DUAL
    └── Se retornar: executeQuery funcionando ✓
    └── Se erro: verificar taglibs e snk:load

CAMADA 3 — Query com parâmetros interpolados
    └── Adicionar os filtros de Multi List e opcionais
    └── Logar a query no console: console.log(query)
    └── Copiar a query do console e testar no DBExplorer

CAMADA 4 — Query completa
    └── Adicionar CTEs e cálculos completos
    └── Se timeout: reduzir o volume (filtrar por CODPROD específico)
    └── Se ORA-xxxxx: isolar a CTE problemática no DBExplorer

CAMADA 5 — Renderização
    └── console.log(dados.length) — confirmar número de linhas
    └── console.log(dados[0]) — confirmar nomes das colunas
    └── Verificar se os nomes no JavaScript batem com os aliases do SQL
```

### Ferramenta essencial: console do navegador

- `F12` → aba **Console** para ver erros JavaScript e logs
- `F12` → aba **Network** para ver se o JSP carregou (status 200) ou deu erro (404, 500)

---

## 14. Erros Mapeados e Soluções

| Erro | Causa | Solução |
|---|---|---|
| `Componente HTML5 não está nos padrões necessários` | XML não foi colado antes do upload do ZIP | Colar o XML adaptado via botão XML, salvar, depois fazer o upload do ZIP |
| `Tipo de parâmetro desconhecido: bool` | Tipo incorreto no XML | Usar `boolean` (não `bool`) |
| `Internal Server Error` | Query com sintaxe inválida ou `<snk:query>` no JSP | Não usar `<snk:query>` — usar `executeQuery()` em JavaScript |
| `java.lang.NumberFormatException` | Parâmetro null passado no array do `executeQuery` | Nunca passar null no array; parâmetros Multi List devem ser interpolados diretamente na query |
| Tela branca sem erro | `document.getElementById("loading")` referenciando elemento inexistente no body | Garantir que todos os `getElementById` referenciam IDs que existem no HTML |
| CSS 404 | `<link href="css/style.css"/>` no JSP | Mover todo CSS para `<style>` inline no `<head>` |
| Timeout / `Statefull bean` | UDFs pesadas executando para muitas linhas | Filtrar por CTE anterior ou usar tabela auxiliar pré-calculada |
| `ORA-00979: not a GROUP BY expression` | Campo referenciado fora de função de agregação sem estar no GROUP BY | Mover o campo para dentro da função: `SUM(campo * CASE WHEN outro_campo = 'X' THEN 1 ELSE 0 END)` |
| Linhas duplicadas | CTE agrupando por campo com múltiplos valores (ex: CODVOL) | Remover o campo do GROUP BY e do SELECT, e adicionar filtro `AND campo != 'VALOR'` |
| Nomes de colunas undefined no JS | Alias do SQL diferente do nome usado no JavaScript | Sempre usar `console.log(dados[0])` para confirmar os nomes exatos das colunas retornadas |

---

## 15. Exemplo Completo Funcional

JSP de referência com todas as boas práticas aplicadas.

```jsp
<%@ page language="java" contentType="text/html; charset=ISO-8859-1" pageEncoding="UTF-8" isELIgnored="false"%>
<%@ page import="java.util.*" %>
<%@ taglib uri="http://java.sun.com/jstl/core_rt" prefix="c" %>
<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld" %>
<html>
<head>
    <snk:load/>
    <style>
        body  { font-family: arial, sans-serif; font-size: 12px; margin: 4px; }
        table { border-collapse: collapse; width: 100%; }
        th    { background-color: #336699; color: white; padding: 5px; text-align: left; font-size: 11px; white-space: nowrap; }
        td    { border: 1px solid #dddddd; padding: 4px; white-space: nowrap; }
        tr:nth-child(even) { background-color: #f2f2f2; }
        tr:hover           { background-color: #e8f0fe; }
        .msg  { padding: 20px; font-size: 13px; }
        .erro { color: red; font-weight: bold; }
    </style>
    <script>

        // ── 1. CAPTURA DE PARÂMETROS ──────────────────────────────────────────
        var pMeses    = parseInt("${P_MESES}")    || 3;
        var pPerc     = parseFloat("${P_PERC}")   || 10;
        var pUsoprod  = "${P_USOPROD}";   // Multi List — já vem como: 'E', 'M'
        var pLocais   = "${P_LOCAIS}";    // Multi List — já vem como: '1001', '5001'
        var pCodprod  = "${P_CODPROD}";   // Opcional
        var pGrupo    = "${P_GRUPOPROD}"; // Opcional
        var pEstBaixo = ("${P_EST_BAIXO}" == "true") ? "S" : "N";

        // ── 2. FILTROS OPCIONAIS (construídos como string) ────────────────────
        var filtroCodprod = (pCodprod != "" && pCodprod != "0")
            ? " AND PRO.CODPROD = " + pCodprod : "";
        var filtroGrupo   = (pGrupo != "" && pGrupo != "0")
            ? " AND PRO.CODGRUPOPROD = " + pGrupo : "";

        // ── 3. QUERY — sem ; no final ─────────────────────────────────────────
        var query =
            "WITH " +
            "BASE_PRODUTO AS (" +
            "  SELECT PRO.CODPROD, PRO.DESCRPROD, PRO.CODVOL," +
            "    GRU.DESCRGRUPOPROD," +
            "    SUM(NVL(EST.ESTOQUE,0)) AS ESTOQUE_ATUAL," +
            "    SUM(NVL(EST.ESTOQUE,0) - NVL(EST.RESERVADO,0)) AS ESTOQUE_FINAL," +
            "    NVL(PRO.ESTMIN,0) AS ESTMIN" +
            "  FROM TGFPRO PRO" +
            "  LEFT JOIN TGFEST EST ON PRO.CODPROD = EST.CODPROD" +
            "    AND EST.CODPARC = 0 AND EST.ESTOQUE > 0" +
            "    AND EST.CODLOCAL IN (" + pLocais + ")" +  // Multi List interpolado direto
            "  LEFT JOIN TGFGRU GRU ON PRO.CODGRUPOPROD = GRU.CODGRUPOPROD" +
            "  WHERE PRO.ATIVO = 'S'" +
            "    AND PRO.USOPROD IN (" + pUsoprod + ")" +  // Multi List interpolado direto
            filtroCodprod + filtroGrupo +                  // Opcionais como string
            "  GROUP BY PRO.CODPROD, PRO.DESCRPROD, PRO.CODVOL, GRU.DESCRGRUPOPROD, PRO.ESTMIN" +
            ") " +
            "SELECT" +
            "  B.CODPROD," +
            "  B.DESCRPROD AS PRODUTO," +
            "  B.CODVOL," +
            "  B.ESTMIN     AS EST_MINIMO," +
            "  B.ESTOQUE_FINAL," +
            "  B.DESCRGRUPOPROD," +
            "  CASE WHEN B.ESTOQUE_FINAL < B.ESTMIN THEN '#FFCCCC' END AS BKCOLOR," +
            "  CASE WHEN B.ESTOQUE_FINAL < B.ESTMIN THEN '#990000' END AS FGCOLOR" +
            " FROM BASE_PRODUTO B" +
            " ORDER BY B.CODPROD";
            // ← SEM ponto e vírgula

        // ── 4. EXECUÇÃO — array vazio pois tudo foi interpolado ───────────────
        executeQuery(query, [], function(value) {
            var dados = JSON.parse(value);

            if (dados.length === 0) {
                document.getElementById("msgVazio").style.display = "block";
                return;
            }

            var tabela = document.getElementById("tblDados");
            var trHead = tabela.createTHead().insertRow(0);
            var cols   = ["Cód.", "Produto", "Vol.", "Est. Mín.", "Est. Final", "Grupo"];
            for (var i = 0; i < cols.length; i++) {
                var th = document.createElement("th");
                th.innerHTML = cols[i];
                trHead.appendChild(th);
            }

            var tbody  = tabela.createTBody();
            var campos = ["CODPROD","PRODUTO","CODVOL","EST_MINIMO","ESTOQUE_FINAL","DESCRGRUPOPROD"];
            for (var k = 0; k < dados.length; k++) {
                var d  = dados[k];
                var tr = tbody.insertRow(-1);
                if (d.BKCOLOR) {
                    tr.style.backgroundColor = d.BKCOLOR;
                    tr.style.color = d.FGCOLOR;
                }
                for (var j = 0; j < campos.length; j++) {
                    var td = tr.insertCell(-1);
                    td.innerHTML = d[campos[j]] != null ? d[campos[j]] : "-";
                }
            }

            tabela.style.display = "table";

        }, function(err) {
            var el = document.getElementById("msgErro");
            el.innerHTML = "Erro ao executar a consulta: " + err;
            el.style.display = "block";
            console.error("executeQuery erro:", err);
        });

    </script>
</head>
<body>
    <div id="msgVazio" class="msg" style="display:none;">
        Nenhum produto encontrado com os filtros selecionados.
    </div>
    <div id="msgErro" class="msg erro" style="display:none;"></div>
    <div style="overflow-x:auto;">
        <table id="tblDados" style="display:none;"></table>
    </div>
</body>
</html>
```

---

*Documento gerado em Fevereiro/2026*
*Base: desenvolvimento e debug do Dashboard de Necessidade de Compras — Sankhya Oracle*
