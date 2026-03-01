**1\. Medir antes de otimizar**Nunca assumir onde está o gargalo. Isolamos cada CTE individualmente e descobrimos que o problema não era onde parecia — o PEDIDO\_PENDENTE com 8,5s parecia o maior vilão, mas as UDFs somavam 36s no conjunto.

**2\. UDFs são armadilhas de performance**EVO\_GET\_CONSUMO\_PROD e FC\_GETAVGSAIDA\_EVO executavam uma query completa por produto. 122 produtos = 244 queries separadas. Qualquer UDF chamada dentro de um SELECT em loop tem esse custo multiplicado. A regra é: **se uma UDF pode ser substituída por um GROUP BY, substitua sempre.**

**3\. A ordem das tabelas no FROM importa muito**O PEDIDO\_PENDENTE caiu de 8,5s para 246ms apenas invertendo TGFCAB e TGFITE — sem mudar nenhuma lógica. O Oracle usa a primeira tabela como driver. Partir da tabela menor com o filtro mais restritivo (PENDENTE = 'S' na TGFITE) permite usar o índice TGFITE\_I06 que já existia.

**4\. EXISTS e IN com subquery custam caro**As condições AND ITE.CODPROD IN (SELECT CODPROD FROM BASE\_PRODUTO) e os três EXISTS na UDF original avaliavam linha por linha. Substituir por JOIN direto ou CTEs materializadas (PRIPA\_PRODS, PRLMP\_PRODS) resolve o problema porque o Oracle calcula o conjunto uma única vez.

**5\. Campos customizados (AD\_) exigem investigação**O AD\_DTCONFIRM IS NULL estava bloqueando 90% do histórico de compras silenciosamente — ULTIMO\_RECEBIMENTO retornava vazio para quase todos os produtos sem dar erro. Campos com prefixo AD\_ não estão no dicionário nativo e precisam ser investigados com quem implementou o sistema.

**6\. Lógica de negócio e lógica de performance são problemas separados**A cor vermelha sumia por causa do QTD\_ULTIMO\_RECEBIMENTO inflando o cálculo — um problema de regra de negócio, não de SQL. Separar os dois tipos de problema evita confusão durante o diagnóstico.

**7\. Validar com dados reais antes de aplicar**Cada versão nova foi comparada com CSV anterior antes de entrar no JSP. A versão que simplificou TPRIPA para JOIN direto zerou 72 produtos — sem validação isso teria entrado em produção errado.

**8\. O fluxo correto de otimização**

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   Medir isolado → Identificar gargalo → Propor solução →   Validar tempo → Validar dados → Aplicar no JSP → Próxima CTE   `