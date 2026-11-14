# Delivery OS Itaim — investigação do cadastro nativo de impressoras e rota de produto (08/11/2026)

**Natureza e efeito:** investigação SQL **somente leitura** no `CAIXA_MOOCA`, banco `teknisa` do SQL Server local, após o atendimento. O escopo limita-se a metadados de catálogo, três tabelas de configuração e os 14 códigos exatos já identificados na matriz histórica. Não houve impressão, spooler, comando contra a Teknisa, DML/DDL, reinício de serviço, alteração de regra, publicação, merge ou deploy. Consultas com `CommandTimeout<=4s`, `LOCK_TIMEOUT<=300ms`, `DEADLOCK_PRIORITY LOW`, conexão SSPI nova sem pooling. Processos temporários PowerShell invocados com `-WindowStyle Hidden`, **sem prova externa de ausência de flash na tela**.

## 1. Fonte e problema que esta investigação tenta resolver

O relatório [`DELIVERYOS_L2_14_CODES_REAL_SQL_CATALOG_PARITY_20261108.md`](./DELIVERYOS_L2_14_CODES_REAL_SQL_CATALOG_PARITY_20261108.md) comprovou que os 14/14 códigos canônicos pendentes da homologação histórica de Comandas existem no SQL e apresentam um único produto e nome por código, sem atribuir nenhuma praça. Na Academia fixa, somente 4/14 tinham coincidência nominal exata; **todos os quatro** continuam com `review_required=true`. A origem da praça continua desconhecida.

A matriz da PR #135 `docs/comandas/HOMOLOGACAO_CLASSIFICACAO_14_CODIGOS_20261029.md` lista rotas **históricas de setembro**, não configuração atual. O código nativo `CDPRODUTO` de um registro do SQL não constitui, sozinho, prova da via produtiva ou da primeira impressão. Para não inventar rota, investigou-se primeiro o esquema nativo, sem executar qualquer impressão.

## 2. Descoberta do esquema — fonte real, não homologação

A procura limitada no catálogo `sys.tables`/ `sys.columns` e `sys.indexes` identificou:

- `TEKNISA.IMPRLOJA`: `CDFILIAL`, `CDLOJA`, `NRSEQIMPRLOJA`, `CDIMPRESSORA`, `IDATIVO` e campos de porta/endereço. A chave primária composta é `CDFILIAL,CDLOJA,NRSEQIMPRLOJA`.
- `TEKNISA.MAPIMPRLOJA`: `CDFILIAL,CDLOJA,CDPORTAIMPR`, destino da porta e `IDATIVO`. A chave primária é `CDFILIAL,CDLOJA,CDPORTAIMPR`.
- `TEKNISA.IMPRESSORA`: cadastro geral por `CDIMPRESSORA`, com tipo/modelo e `IDATIVO`. Existe também `IMPRESSOOPER`; não foi executado comando de impressora.
- `TEKNISA.PRODUTO` contém `CDVIACESDIET`, `IDIMPPRODUTO` e `IDIMPRODUVEZ`; a existência de campos com nome sugestivo **não demonstra semântica operacional de roteamento**.
- Candidato encontrado por cruzamento **de nomes de colunas**: `TEKNISA.PRODAMBIENTE`, com chave `CDFILIAL,CDLOJA,CDPRODUTO,NRPRODAMBIENTE`, além de `CDAMBIENTE`, `NRSEQIMPRLOJA`, `NRCONFTELA`, `DTINIVIGENCIA` e `IDATIVO`. O índice `FKVND00516IMPRLOJA` reúne `CDFILIAL,CDLOJA,NRSEQIMPRLOJA`. Essa estrutura poderia representar produto→ambiente→registro de impressora, mas a simples forma do esquema **não prova que o delivery atual use essa via**.

A busca por tabelas com colunas explícitas de produto **e** impressora retornou `PRODAMBIENTE` e `PRODUTO`. **Limite:** a busca se baseou em uma lista específica de nomes de colunas e não descarta que a lógica real esteja em aplicativo, view, procedimento, configuração de outro fornecedor ou tabela com nomenclatura distinta. Nenhum código executável da Teknisa foi alterado ou instrumentado.

## 3. Leituras estritamente limitadas dos 14 códigos

Foi realizada uma consulta parametrizada aos mesmos 14 `CDARVPROD`, sem expor `CDPRODUTO` e nomes, e sem acessar dados de pedidos:

| Campo do catálogo consultado | Resultado em 14/14 |
|---|---|
| `PRODUTO.CDVIACESDIET` | `NULL` para os 14 |
| `PRODUTO.IDIMPPRODUTO` | valor `1` para os 14; sem semântica de impressão homologada |
| `PRODUTO.IDIMPRODUVEZ` | valor `N` para os 14; sem semântica homologada |
| Linhas relacionadas de `PRODAMBIENTE` com `CDFILIAL='0001',CDLOJA='01'` | **0/14** |
| Correspondências de destino `NRSEQIMPRLOJA` por produto nessa tabela | **0/14** |

Essa consulta retornou 14 linhas (uma por produto) em **33 ms**; usou `TOP (201)` como sentinela, validou limite e não exportou IDs nativos, dados de cliente nem endereços de impressoras.

Separadamente, por `CDFILIAL='0001'` e `CDLOJA='01'`, a leitura de configurações trouxe:

| Cadastro | Registros no escopo | Registros com `IDATIVO='S'` |
|---|---:|---:|
| `IMPRLOJA` | **10** | **10** |
| `MAPIMPRLOJA` | **24** | **24** |

A duração dessa consulta combinada foi **36 ms**. O valor de `IDATIVO` descreve os bytes armazenados, **não prova ligação física, papel, destino efetivo, funcionamento, energia, ou ausência de impressão duplicada**.

## 4. Contra-verificação decisiva: a tabela de produto→ambiente está vazia

Para distinguir “os 14 produtos não estão configurados” de “a própria tabela não está em uso”, foi feita **uma consulta adicional com apenas dois `EXISTS` indexáveis**, sem `COUNT(*)` integral, sem identificar produtos ou outras lojas:

- `EXISTS(SELECT TOP (1) ... FROM TEKNISA.PRODAMBIENTE WHERE CDFILIAL='0001' AND CDLOJA='01')` → **false**.
- `EXISTS(SELECT TOP (1) ... FROM TEKNISA.PRODAMBIENTE)` → **false**.

**Resultado:** a tabela `PRODAMBIENTE` estava **vazia em todo o banco consultado no instante dessa prova**, não apenas para os 14 produtos. A tabela pode existir como recurso não configurado, legado ou não usado por esse estabelecimento. **Não** interpretá-la como prova de que os 14 produtos não têm destino. O vínculo operacional de produção tem de ser investigado na fonte que realmente decide o despacho da via, não implementado por inferência baseada nessa tabela vazia.

## 5. Classificação técnica e sequência de maior valor

**Comprovado por SQL real:**
- `L2_PRODAMBIENTE_SCOPED_14_MAPPINGS=0/14`;
- `L2_PRODAMBIENTE_ANYWHERE_EXISTS=false`;
- `L2_PRODUCT_VIA_FIELD_NULL=14/14`;
- `L2_ITAIM_PRINTER_CONFIG_ROWS=10`;
- `L2_ITAIM_PORT_MAPPING_ROWS=24`.

**Não comprovado:** `L2_REAL_PRINTER_ROUTE_BY_NATIVE_PRODUCT=UNKNOWN`; `L2_PRODUCT_STATION_RULE_APPROVED=false`; `L3_PHYSICAL_READY=UNKNOWN`; `N2_SQL_ATOMICITY=HOLD`; `L5_FIRST_NATIVE_DISPATCH=UNKNOWN`; `EXTERNAL_IFOOD_MATCH=HOLD`. `PRINT=HOLD`, `HOME=HOLD`, `DELIVERYOS_V1_ACCEPTED=0/8`.

**Próxima rota segura:**
1. Não insistir em `PRODAMBIENTE` nem usar `CDVIACESDIET=NULL` como um evento de produção. É uma fonte negativa para os 14 itens, não o roteador efetivo.
2. Reusar a investigação de rotinas nativas **já concluída na PR #135**, `docs/comandas/MAPA_ROTINAS_NATIVAS_FORSALE_DELIVERY_IMPRESSAO_20261101.md`, que separou impressão de produção, entrega e reimpressão, assim como o seletor de janelas/praças em prévia offline. Não confundir os caminhos nem instalar hooks.
3. Obter evidência interna legitimamente autorizada da **associação atual** código exato→praça/turno e do primeiro despacho real sem alterar impressoras. Até lá, usar apenas a matriz histórica como candidata, nunca como regra vigente.
4. O catálogo da Academia não constitui segunda prova independente de rota apenas pelo nome. Quatro nomes coincidentes seguem `review_required=true`; os demais dez não podem ser casados por aproximação.
5. Preservar a proteção de tela e Reader, sem tarefa ou serviço novo no caixa. Qualquer piloto com `SERIALIZABLE`, impressão ou mudança em configuração exige autorização operacional separada. Não contatar a Teknisa.

**Conclusão:** a busca encontrou um esquema que *poderia* conter vínculo produto–ambiente, mas a prova real demonstrou que **não contém registros**. O resultado evita a falsa solução de ler uma tabela vazia e afirmar que ela representa as praças; o caminho crítico permanece comprovar a origem efetiva do roteamento, sem reinstalar ou redesenhar o motor de classificação.
