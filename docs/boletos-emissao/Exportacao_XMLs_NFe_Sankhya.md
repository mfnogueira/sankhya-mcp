# Base de Conhecimento: Exportação de XMLs de Notas Fiscais Eletrônicas (Sankhya/Oracle)

## 📋 Sumário
1. [Contexto](#contexto)
2. [Estrutura das Tabelas](#estrutura-das-tabelas)
3. [Análise Preliminar](#análise-preliminar)
4. [Estratégia de Exportação](#estratégia-de-exportação)
5. [Queries SQL](#queries-sql)
6. [Exportação no DBeaver](#exportação-no-dbeaver)
7. [Script Python de Conversão](#script-python-de-conversão)
8. [Validação](#validação)
9. [Troubleshooting](#troubleshooting)

---

## 📖 Contexto

**Objetivo:** Exportar XMLs de Notas Fiscais Eletrônicas (NFe) armazenados no banco de dados Sankhya (Oracle) para arquivos individuais .xml

**Sistema:** Sankhya ERP - Oracle Database  
**Cliente:** DBeaver  
**Data de criação:** 09/02/2026  
**Autor:** Documentação Técnica - Exportação NFe

---

## 🗄️ Estrutura das Tabelas

### Tabela: TGFNFE (XMLs das Notas Fiscais)

Armazena todos os XMLs relacionados à Nota Fiscal Eletrônica.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| NUNOTA | NUMBER | Número único da nota (PK, FK TGFCAB) |
| CHAVENFE | VARCHAR2 | Chave de acesso da NFe (44 dígitos) |
| **XML** | **CLOB** | **XML da NFe** ⭐ |
| XMLPROTAUTNOT | CLOB | XML do protocolo de autorização |
| XMLENVCLI | CLOB | XML completo enviado ao cliente (NFe + protocolo) |
| XMLCANC | CLOB | XML de cancelamento |
| XMLPROTCANC | CLOB | Protocolo de cancelamento |
| XMLENVCLICANC | CLOB | XML cancelamento enviado ao cliente |
| XMLENVCARTA | CLOB | XML carta de correção |
| XMLPROTAUTCARTA | CLOB | Protocolo carta de correção |
| XMLENVCLICARTA | CLOB | Carta de correção enviada ao cliente |
| QRCODE | VARCHAR2 | QR Code da NFCe |
| XMLENVEPEC | CLOB | XML EPEC (Evento Prévio de Emissão em Contingência) |
| XMLPROTAUTEPEC | CLOB | Protocolo EPEC |
| ... | ... | Outros campos relacionados a eventos |

### Tabela: TGFCAB (Cabeçalho da Nota Fiscal)

Contém metadados da nota fiscal.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| NUNOTA | NUMBER | Número único da nota (PK) |
| NUMNOTA | NUMBER | Número da nota fiscal |
| DTNEG | DATE | Data de negociação |
| STATUSNOTA | CHAR(1) | Status: P=Pendente, L=Liberada, A=Aprovada, C=Cancelada |
| STATUSNFE | CHAR(1) | Status SEFAZ: A=Autorizada, C=Cancelada, NULL=Não transmitida |
| VLRNOTA | NUMBER | Valor total da nota |
| TIPMOV | CHAR(1) | Tipo movimento: V=Venda, C=Compra, P=Produção |

---

## 🔍 Análise Preliminar

### Passo 1: Contar Total de Notas

```sql
-- Contar quantas notas temos no período desejado
SELECT COUNT(*) AS TOTAL_NOTAS
FROM SANKHYA.TGFNFE NFE
INNER JOIN SANKHYA.TGFCAB CAB ON CAB.NUNOTA = NFE.NUNOTA
WHERE EXTRACT(YEAR FROM CAB.DTNEG) = 2026;
```

**Resultado exemplo:**
```
TOTAL_NOTAS
424
```

---

### Passo 2: Distribuição por Período

```sql
-- Ver distribuição por mês
SELECT 
    EXTRACT(MONTH FROM CAB.DTNEG) AS MES,
    EXTRACT(YEAR FROM CAB.DTNEG) AS ANO,
    COUNT(*) AS QTD_NOTAS,
    COUNT(CASE WHEN NFE.XML IS NOT NULL THEN 1 END) AS QTD_COM_XML,
    COUNT(CASE WHEN NFE.XMLPROTAUTNOT IS NOT NULL THEN 1 END) AS QTD_AUTORIZADAS
FROM SANKHYA.TGFNFE NFE
INNER JOIN SANKHYA.TGFCAB CAB ON CAB.NUNOTA = NFE.NUNOTA
WHERE EXTRACT(YEAR FROM CAB.DTNEG) = 2026
GROUP BY 
    EXTRACT(MONTH FROM CAB.DTNEG),
    EXTRACT(YEAR FROM CAB.DTNEG)
ORDER BY ANO, MES;
```

**Resultado exemplo:**
```
MES | ANO  | QTD_NOTAS | QTD_COM_XML | QTD_AUTORIZADAS
1   | 2026 | 307       | 307         | 307
2   | 2026 | 117       | 117         | 117
```

---

### Passo 3: Tamanho Médio dos XMLs

```sql
-- Verificar tamanho médio dos XMLs
SELECT 
    ROUND(AVG(LENGTH(XML))/1024, 2) AS MEDIA_KB_POR_XML,
    ROUND(MAX(LENGTH(XML))/1024, 2) AS MAIOR_XML_KB,
    COUNT(*) AS TOTAL_NOTAS
FROM SANKHYA.TGFNFE NFE
INNER JOIN SANKHYA.TGFCAB CAB ON CAB.NUNOTA = NFE.NUNOTA
WHERE EXTRACT(YEAR FROM CAB.DTNEG) = 2026
  AND XML IS NOT NULL;
```

**Resultado exemplo:**
```
MEDIA_KB_POR_XML | MAIOR_XML_KB | TOTAL_NOTAS
25.29            | 277.27       | 424
```

**Interpretação:**
- Volume total estimado: ~10-11 MB
- Viável para exportação direta

---

## 🎯 Estratégia de Exportação

### Decisão: Exportação em Lotes

**Opções avaliadas:**

| Estratégia | Prós | Contras | Decisão |
|------------|------|---------|---------|
| **1 arquivo único** | Rápido (1 exportação) | Risco de travar DBeaver, difícil recuperar se falhar | ❌ Rejeitada |
| **Por mês** | Organização temporal | Janeiro com 307 registros pode travar | ⚠️ Arriscado |
| **4 lotes de ~100** | Seguro, fácil retomar se falhar | 4 exportações | ✅ **ESCOLHIDA** |

**Estratégia final:** 4 lotes de aproximadamente 100 registros cada

**Justificativa:**
- ✅ Arquivos menores (~2.5 MB cada)
- ✅ Menor risco de timeout/travamento
- ✅ Se um lote falhar, só refaz aquele
- ✅ Exportação rápida por lote

---

## 📝 Queries SQL

### Query Base para Exportação em Lotes

**Template:**
```sql
SELECT 
    NFE.NUNOTA, 
    NFE.CHAVENFE, 
    NFE.XML, 
    NFE.XMLPROTAUTNOT, 
    NFE.XMLENVCLI, 
    NFE.XMLCANC, 
    NFE.XMLPROTCANC, 
    NFE.XMLENVCLICANC, 
    NFE.XMLENVCARTA, 
    NFE.XMLPROTAUTCARTA, 
    NFE.XMLENVCLICARTA, 
    NFE.QRCODE, 
    NFE.XMLENVEPEC, 
    NFE.XMLPROTAUTEPEC, 
    NFE.XMLENVCANCPRORROG, 
    NFE.XMLENVCLICANCPRORROG, 
    NFE.XMLPROTAUTCANCPRORROG, 
    NFE.XMLENVCLIPRORROG, 
    NFE.XMLENVPRORROG, 
    NFE.XMLPROTAUTPRORROG,
    CAB.NUMNOTA,
    CAB.DTNEG
FROM SANKHYA.TGFNFE NFE
INNER JOIN SANKHYA.TGFCAB CAB ON CAB.NUNOTA = NFE.NUNOTA
WHERE EXTRACT(YEAR FROM CAB.DTNEG) = 2026
ORDER BY NFE.NUNOTA
OFFSET [OFFSET_VALUE] ROWS FETCH NEXT [LIMIT_VALUE] ROWS ONLY;
```

---

### Lote 1: Registros 1-100

```sql
SELECT 
    NFE.NUNOTA, 
    NFE.CHAVENFE, 
    NFE.XML, 
    NFE.XMLPROTAUTNOT, 
    NFE.XMLENVCLI, 
    NFE.XMLCANC, 
    NFE.XMLPROTCANC, 
    NFE.XMLENVCLICANC, 
    NFE.XMLENVCARTA, 
    NFE.XMLPROTAUTCARTA, 
    NFE.XMLENVCLICARTA, 
    NFE.QRCODE, 
    NFE.XMLENVEPEC, 
    NFE.XMLPROTAUTEPEC, 
    NFE.XMLENVCANCPRORROG, 
    NFE.XMLENVCLICANCPRORROG, 
    NFE.XMLPROTAUTCANCPRORROG, 
    NFE.XMLENVCLIPRORROG, 
    NFE.XMLENVPRORROG, 
    NFE.XMLPROTAUTPRORROG,
    CAB.NUMNOTA,
    CAB.DTNEG
FROM SANKHYA.TGFNFE NFE
INNER JOIN SANKHYA.TGFCAB CAB ON CAB.NUNOTA = NFE.NUNOTA
WHERE EXTRACT(YEAR FROM CAB.DTNEG) = 2026
ORDER BY NFE.NUNOTA
OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY;
```

**Exportar como:** `nfe_2026_lote1.json`

---

### Lote 2: Registros 101-200

```sql
-- Mesma query do Lote 1, alterando apenas:
OFFSET 100 ROWS FETCH NEXT 100 ROWS ONLY;
```

**Exportar como:** `nfe_2026_lote2.json`

---

### Lote 3: Registros 201-300

```sql
-- Mesma query do Lote 1, alterando apenas:
OFFSET 200 ROWS FETCH NEXT 100 ROWS ONLY;
```

**Exportar como:** `nfe_2026_lote3.json`

---

### Lote 4: Registros 301-424

```sql
-- Mesma query do Lote 1, alterando apenas:
OFFSET 300 ROWS FETCH NEXT 124 ROWS ONLY;
```

**Exportar como:** `nfe_2026_lote4.json`

---

### Query Alternativa: Por Período Específico

Se preferir exportar por data ao invés de lotes:

```sql
SELECT 
    NFE.NUNOTA, 
    NFE.CHAVENFE, 
    NFE.XML,
    -- ... outros campos ...
    CAB.NUMNOTA,
    CAB.DTNEG
FROM SANKHYA.TGFNFE NFE
INNER JOIN SANKHYA.TGFCAB CAB ON CAB.NUNOTA = NFE.NUNOTA
WHERE CAB.DTNEG >= TO_DATE('2026-01-01', 'YYYY-MM-DD')
  AND CAB.DTNEG < TO_DATE('2026-02-01', 'YYYY-MM-DD')
ORDER BY NFE.NUNOTA;
```

---

## 💾 Exportação no DBeaver

### Configurações Recomendadas

#### Passo 1: Executar Query
Execute a query do lote desejado no DBeaver.

#### Passo 2: Exportar Resultado
1. Clique com **botão direito** nos resultados
2. Selecione **"Export Data"** (ou `Ctrl+Shift+E`)

#### Passo 3: Escolher Formato
**Formato selecionado:** JSON ⭐

**Por que JSON?**
- ✅ Estrutura preservada
- ✅ Menos problemas com escape de caracteres
- ✅ Pandas lê nativamente
- ✅ Não precisa configurar delimitadores

**Alternativas não escolhidas:**
- ❌ CSV: XMLs têm muitas vírgulas, aspas → problemas de escape
- ❌ XML do DBeaver: Exporta estrutura da tabela, não os XMLs das notas

#### Passo 4: Configurações de Exportação

**Aba "Settings":**
- **Encoding:** UTF-8 ✅
- **Format:** JSON ✅
- **Data format:** Source (manter original) ✅

**Aba "Output":**
- Definir nome do arquivo: `nfe_2026_lote1.json`

#### Passo 5: Executar Exportação
Clique em **"Proceed"** e aguarde.

---

### Estrutura do JSON Exportado

O DBeaver exporta no seguinte formato:

```json
{
  "SELECT ... [query completa] ...": [
    {
      "NUNOTA": 447790,
      "CHAVENFE": "35260144136221000167550000000153231466518512",
      "XML": "<NFe xmlns=\"http://www.portalfiscal.inf.br/nfe\">...</NFe>",
      "XMLPROTAUTNOT": "<infProt>...</infProt>",
      "XMLENVCLI": "<nfeProc>...</nfeProc>",
      "XMLCANC": null,
      "XMLPROTCANC": null,
      "XMLENVCLICANC": null,
      "XMLENVCARTA": null,
      "XMLPROTAUTCARTA": null,
      "XMLENVCLICARTA": null,
      "QRCODE": null,
      "XMLENVEPEC": null,
      "XMLPROTAUTEPEC": null,
      "XMLENVCANCPRORROG": null,
      "XMLENVCLICANCPRORROG": null,
      "XMLPROTAUTCANCPRORROG": null,
      "XMLENVCLIPRORROG": null,
      "XMLENVPRORROG": null,
      "XMLPROTAUTPRORROG": null,
      "NUMNOTA": 15323,
      "DTNEG": "2026-01-05T03:00:00.000Z"
    },
    {
      "NUNOTA": 447791,
      "CHAVENFE": "...",
      ...
    }
  ]
}
```

**Observação:** A chave é a query completa executada, e o valor é um array com os registros.

---

## 🐍 Script Python de Conversão

### Script Completo: `extrair_xmls.py`

```python
import pandas as pd
import json
import os
from pathlib import Path

# Criar pasta para os XMLs
output_dir = Path('xmls_nfe_2026')
output_dir.mkdir(exist_ok=True)

# Contador de XMLs processados
total_xmls = 0

# Processar cada lote
for lote in range(1, 5):
    arquivo_json = f'nfe_2026_lote{lote}.json'
    
    print(f'\n📦 Processando {arquivo_json}...')
    
    # Ler o JSON
    with open(arquivo_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # O JSON tem uma chave (a query) que contém a lista de registros
    # Pegar a primeira (e única) chave
    query_key = list(data.keys())[0]
    registros = data[query_key]
    
    # Converter para DataFrame
    df = pd.DataFrame(registros)
    
    print(f'   ✓ {len(df)} notas encontradas')
    
    # Processar cada nota
    for idx, row in df.iterrows():
        nunota = row['NUNOTA']
        chavenfe = row['CHAVENFE']
        xml = row['XML']
        
        # Verificar se XML não é nulo
        if xml and xml.strip():
            # Nome do arquivo: NUNOTA_CHAVENFE.xml
            filename = output_dir / f'{nunota}_{chavenfe}.xml'
            
            # Salvar XML
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(xml)
            
            total_xmls += 1
            
            if (idx + 1) % 10 == 0:  # Mostrar progresso a cada 10 notas
                print(f'   → {idx + 1}/{len(df)} processadas...')
    
    print(f'   ✅ Lote {lote} concluído!')

print(f'\n🎯 CONCLUÍDO!')
print(f'📊 Total de XMLs exportados: {total_xmls}')
print(f'📁 Localização: {output_dir.absolute()}')
```

---

### Como Executar o Script

**Pré-requisitos:**
```bash
pip install pandas --break-system-packages
```

**Estrutura de arquivos:**
```
📁 pasta_trabalho/
  ├── nfe_2026_lote1.json
  ├── nfe_2026_lote2.json
  ├── nfe_2026_lote3.json
  ├── nfe_2026_lote4.json
  └── extrair_xmls.py
```

**Executar:**
```bash
python extrair_xmls.py
```

**Saída esperada:**
```
📦 Processando nfe_2026_lote1.json...
   ✓ 100 notas encontradas
   → 10/100 processadas...
   → 20/100 processadas...
   → 30/100 processadas...
   → 40/100 processadas...
   → 50/100 processadas...
   → 60/100 processadas...
   → 70/100 processadas...
   → 80/100 processadas...
   → 90/100 processadas...
   → 100/100 processadas...
   ✅ Lote 1 concluído!

📦 Processando nfe_2026_lote2.json...
   ✓ 100 notas encontradas
   ...
   ✅ Lote 2 concluído!

📦 Processando nfe_2026_lote3.json...
   ✓ 100 notas encontradas
   ...
   ✅ Lote 3 concluído!

📦 Processando nfe_2026_lote4.json...
   ✓ 124 notas encontradas
   ...
   ✅ Lote 4 concluído!

🎯 CONCLUÍDO!
📊 Total de XMLs exportados: 424
📁 Localização: /caminho/completo/xmls_nfe_2026
```

---

### Resultado Final

```
📁 pasta_trabalho/
  ├── nfe_2026_lote1.json
  ├── nfe_2026_lote2.json
  ├── nfe_2026_lote3.json
  ├── nfe_2026_lote4.json
  ├── extrair_xmls.py
  └── 📁 xmls_nfe_2026/
      ├── 447790_35260144136221000167550000000153231466518512.xml
      ├── 447791_35260144136221000167550000000153241466518523.xml
      ├── 447792_35260144136221000167550000000153251466518534.xml
      ├── ...
      └── [424 arquivos XML no total]
```

---

### Script Alternativo (Versão Compacta)

Se preferir uma versão mais enxuta sem progresso detalhado:

```python
import json
import os

os.makedirs('xmls_nfe_2026', exist_ok=True)
total = 0

for lote in range(1, 5):
    with open(f'nfe_2026_lote{lote}.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        registros = data[list(data.keys())[0]]
        
        for reg in registros:
            if reg['XML']:
                filename = f"xmls_nfe_2026/{reg['NUNOTA']}_{reg['CHAVENFE']}.xml"
                with open(filename, 'w', encoding='utf-8') as xml_file:
                    xml_file.write(reg['XML'])
                total += 1

print(f'✅ {total} XMLs exportados!')
```

---

## ✅ Validação

### Validar Estrutura XML

**Script de validação:**
```python
import xml.etree.ElementTree as ET
from pathlib import Path

def validar_xml(arquivo):
    """Valida se um arquivo XML está bem-formado"""
    try:
        tree = ET.parse(arquivo)
        root = tree.getroot()
        return True, root.tag
    except ET.ParseError as e:
        return False, str(e)

# Validar alguns XMLs
pasta_xmls = Path('xmls_nfe_2026')
arquivos = list(pasta_xmls.glob('*.xml'))[:5]  # Primeiros 5

print('📋 Validando XMLs...\n')
for arquivo in arquivos:
    valido, info = validar_xml(arquivo)
    status = '✅' if valido else '❌'
    print(f'{status} {arquivo.name}')
    if valido:
        print(f'   Root tag: {info}')
    else:
        print(f'   Erro: {info}')
    print()
```

**Saída esperada:**
```
📋 Validando XMLs...

✅ 447790_35260144136221000167550000000153231466518512.xml
   Root tag: {http://www.portalfiscal.inf.br/nfe}NFe

✅ 447791_35260144136221000167550000000153241466518523.xml
   Root tag: {http://www.portalfiscal.inf.br/nfe}NFe

✅ 447792_35260144136221000167550000000153251466518534.xml
   Root tag: {http://www.portalfiscal.inf.br/nfe}NFe
```

---

### Validar Quantidade de Arquivos

```python
from pathlib import Path

pasta_xmls = Path('xmls_nfe_2026')
total_arquivos = len(list(pasta_xmls.glob('*.xml')))

print(f'📊 Total de XMLs: {total_arquivos}')
print(f'✅ Esperado: 424')

if total_arquivos == 424:
    print('🎯 CORRETO! Todos os XMLs foram exportados.')
else:
    print(f'⚠️ ATENÇÃO: Faltam {424 - total_arquivos} XMLs ou há {total_arquivos - 424} XMLs extras.')
```

---

### Visualizar XML no Navegador

Arraste qualquer arquivo `.xml` para o navegador (Chrome/Firefox/Edge) para visualizar formatado.

**Exemplo de estrutura visualizada:**
```xml
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe35260144136221000167550000000153231466518512" versao="4.00">
    <ide>
      <cUF>35</cUF>
      <nNF>15323</nNF>
      <dhEmi>2026-01-05T07:45:41-03:00</dhEmi>
      ...
    </ide>
    <emit>
      <CNPJ>44136221000167</CNPJ>
      <xNome>Evoden Ind Com Imp Exp Prod Odonto LTDA</xNome>
      ...
    </emit>
    <dest>...</dest>
    <det nItem="1">...</det>
    ...
  </infNFe>
  <Signature>...</Signature>
</NFe>
```

---

## 🔧 Troubleshooting

### Problema 1: DBeaver Trava Durante Exportação

**Sintoma:** DBeaver não responde ao exportar lote grande

**Solução:**
1. Reduzir tamanho do lote (ex: 50 registros ao invés de 100)
2. Aumentar memória do DBeaver em `dbeaver.ini`:
   ```
   -Xmx2048m
   ```
3. Fechar outras conexões/queries abertas

---

### Problema 2: JSON Malformado

**Sintoma:** Erro ao ler JSON no Python: `json.decoder.JSONDecodeError`

**Solução:**
1. Verificar se arquivo foi completamente exportado
2. Abrir JSON em editor de texto e verificar estrutura
3. Validar JSON online: https://jsonlint.com/
4. Re-exportar o lote problemático

---

### Problema 3: XMLs com Encoding Errado

**Sintoma:** Caracteres especiais aparecem como `Ã§`, `Ã£`, etc.

**Solução:**
No script Python, garantir `encoding='utf-8'` em todas as operações:
```python
# Ler JSON
with open(arquivo_json, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Escrever XML
with open(filename, 'w', encoding='utf-8') as f:
    f.write(xml)
```

---

### Problema 4: XMLs Vazios ou Nulos

**Sintoma:** Alguns arquivos `.xml` estão vazios

**Causa:** Campo `XML` está NULL no banco

**Verificação:**
```sql
-- Verificar notas sem XML
SELECT 
    NUNOTA, 
    CHAVENFE,
    CASE 
        WHEN XML IS NULL THEN 'SEM XML'
        WHEN LENGTH(XML) = 0 THEN 'XML VAZIO'
        ELSE 'OK'
    END AS STATUS
FROM SANKHYA.TGFNFE
WHERE NUNOTA IN (447790, 447791, 447792);
```

**Solução no script:**
```python
# Já implementado: verifica se XML não é nulo antes de salvar
if xml and xml.strip():
    # Salvar XML
```

---

### Problema 5: Erro "ORA-00932: tipos de dados inconsistentes"

**Sintoma:** Erro ao usar `COUNT()` com campos CLOB

**Causa:** Oracle não permite COUNT diretamente em CLOB

**Solução:** Use `CASE WHEN ... IS NOT NULL`
```sql
-- ❌ ERRADO:
COUNT(NFE.XML)

-- ✅ CORRETO:
COUNT(CASE WHEN NFE.XML IS NOT NULL THEN 1 END)
```

---

## 📚 Referências

### Documentação Técnica

- **Sankhya - Estrutura TGFNFE:** Tabela de XMLs NFe
- **Sankhya - Estrutura TGFCAB:** Tabela de Notas Fiscais
- **Oracle SQL - OFFSET/FETCH:** Paginação de resultados
- **NFe - Padrão SEFAZ:** Layout XML versão 4.00

### Ferramentas Utilizadas

- **DBeaver:** Cliente SQL multiplataforma
- **Python 3.x:** Processamento de dados
- **Pandas:** Manipulação de dados estruturados

---

## 📊 Resumo do Processo

| Etapa | Ação | Tempo Estimado |
|-------|------|----------------|
| 1. Análise | Executar 3 queries de análise | 5 min |
| 2. Exportação | Exportar 4 lotes JSON no DBeaver | 15-20 min |
| 3. Conversão | Executar script Python | 2-3 min |
| 4. Validação | Verificar XMLs gerados | 5 min |
| **TOTAL** | **Processo completo** | **~30 min** |

---

## 🎯 Checklist de Execução

- [ ] Executar queries de análise preliminar
- [ ] Confirmar total de notas e distribuição
- [ ] Executar query Lote 1 e exportar JSON
- [ ] Executar query Lote 2 e exportar JSON
- [ ] Executar query Lote 3 e exportar JSON
- [ ] Executar query Lote 4 e exportar JSON
- [ ] Criar script Python `extrair_xmls.py`
- [ ] Executar script Python
- [ ] Validar quantidade de XMLs gerados (424)
- [ ] Validar estrutura de alguns XMLs
- [ ] Testar abertura de XML no navegador
- [ ] Fazer backup da pasta `xmls_nfe_2026`

---

## 💡 Lições Aprendidas

1. **Exportação em lotes é mais segura** que exportação única, especialmente com campos CLOB
2. **JSON é melhor que CSV** para exportar XMLs (menos problemas de escape)
3. **DBeaver exporta JSON com query como chave** - script Python precisa considerar isso
4. **Oracle não permite COUNT em CLOB** - usar `CASE WHEN ... IS NOT NULL`
5. **Encoding UTF-8 é crucial** - sempre especificar em todas operações de I/O
6. **Validação é essencial** - sempre verificar quantidade e estrutura dos arquivos gerados

---

## 🔄 Melhorias Futuras

### Script de Formatação XML (Opcional)

Para deixar XMLs identados (mais legíveis):

```python
import xml.etree.ElementTree as ET
import xml.dom.minidom as minidom
from pathlib import Path

def formatar_xml(arquivo):
    """Formata (identa) um arquivo XML"""
    tree = ET.parse(arquivo)
    root = tree.getroot()
    
    # Converter para string XML
    xml_string = ET.tostring(root, encoding='unicode')
    
    # Formatar com identação
    dom = minidom.parseString(xml_string)
    xml_formatado = dom.toprettyxml(indent="  ")
    
    # Remover linhas em branco extras
    linhas = [linha for linha in xml_formatado.split('\n') if linha.strip()]
    xml_formatado = '\n'.join(linhas)
    
    # Salvar formatado
    with open(arquivo, 'w', encoding='utf-8') as f:
        f.write(xml_formatado)

# Formatar todos os XMLs
pasta_xmls = Path('xmls_nfe_2026')
for xml_file in pasta_xmls.glob('*.xml'):
    formatar_xml(xml_file)
    print(f'✓ Formatado: {xml_file.name}')
```

**Observação:** Isso é puramente estético. XMLs já estão 100% funcionais sem formatação.

---

### Exportação de Metadados (CSV Complementar)

Criar CSV com informações resumidas:

```sql
SELECT 
    NFE.NUNOTA, 
    NFE.CHAVENFE,
    CAB.NUMNOTA,
    CAB.DTNEG,
    CAB.STATUSNOTA,
    CAB.STATUSNFE,
    CAB.VLRNOTA,
    CASE WHEN NFE.XML IS NOT NULL THEN 'SIM' ELSE 'NAO' END AS TEM_XML,
    CASE WHEN NFE.XMLPROTAUTNOT IS NOT NULL THEN 'SIM' ELSE 'NAO' END AS TEM_PROTOCOLO
FROM SANKHYA.TGFNFE NFE
INNER JOIN SANKHYA.TGFCAB CAB ON CAB.NUNOTA = NFE.NUNOTA
WHERE EXTRACT(YEAR FROM CAB.DTNEG) = 2026
ORDER BY NFE.NUNOTA;
```

Exportar como `nfe_metadados_2026.csv` - útil para consultas rápidas sem abrir XMLs.

---

## 📝 Notas Finais

**Status do documento:** ✅ Testado e validado  
**Última atualização:** 09/02/2026  
**Autor:** Márcio - IT Specialist  
**Sistema:** Sankhya ERP - Oracle Database  
**Aplicável para:** Exportação de XMLs NFe de qualquer período

---

**Documento criado com base em caso real de exportação bem-sucedida de 424 notas fiscais de Janeiro/Fevereiro 2026.**
