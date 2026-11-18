# Delivery OS Itaim — paridade dos 14 códigos da classificação com catálogo SQL real (08/11/2026)

**Escopo de campo:** consulta localizada e somente leitura à tabela `TEKNISA.PRODUTO` no `(local)\SQLEXPRESS`/`teknisa` do `CAIXA_MOOCA` às ~02h54 BRT. Sem DML/DDL, serviço, impressão, produto alterado, ações sobre pedidos ou deploy. Esta é **prova de cadastro encontrado no banco**, não prova de regra vigente aprovada para praça, impressão, embalagem ou loja. O Reader manteve heartbeat `RUNNING`, último lote `OK`, zero erros e hash do worker verificado antes da leitura.

**Fonte da lista de trabalho:** `docs/comandas/HOMOLOGACAO_CLASSIFICACAO_14_CODIGOS_20261029.md`, PR #135 TATÁ Comandas. Os 14 códigos derivam de revisão histórica de outubro e os respectivos nomes são **rótulos de Reader**, não decisão da equipe. A lista de 82 ocorrências históricas é **ocorrência de motivo**, não quantidade de clientes ou pedidos únicos. O trabalho deve ser feito sem contato externo com a Teknisa, conforme decisão já registrada.

## Prova efetiva — código e rótulo no banco atual

1. **Metadados de esquema atuais:** `TEKNISA.PRODUTO.CDARVPROD` é `varchar(20)`, `CDPRODUTO` é `varchar(10)` e chave primária indexada, `NMPRODUTO` é `varchar(50)`, `IDATIVO` é `varchar(1)`. Índices existentes têm `CDARVPROD` na primeira coluna, incluindo `PRODUTO_003`, `PRODUTO_009` e `FK_EST00629`. A consulta não criou índices nem verificou plano real de execução da seleção.
2. **Consulta SQL 1:** um conjunto de 14 valores `CDARVPROD` sem pontos (código canônico normalizado), ligados por parâmetros `SqlDbType.VarChar(20)`, `LEFT JOIN TEKNISA.PRODUTO`, com `SET LOCK_TIMEOUT 250`, `DEADLOCK_PRIORITY LOW`, `CommandTimeout=4s`. Para **14/14 códigos**, `COUNT_BIG(CDPRODUTO)=1`, `COUNT(DISTINCT CDPRODUTO)=1`, `COUNT(DISTINCT NMPRODUTO)=1`, e o único cadastro retornou `IDATIVO='S'`. Duração **18 ms**. Não atribuir automaticamente semântica de venda liberada a `IDATIVO='S'` sem validar regra proprietária e loja.
3. **Consulta SQL 2:** os mesmos 14 códigos, com as 14 etiquetas antigas do Reader como parâmetros; comparação **em memória no próprio caixa** entre `NMPRODUTO` e os rótulos históricos. Normalização conservadora: `Trim`, maiúsculas, retirada de marcas Unicode de acento e contração de espaços; não foram permitidos sinônimos, correspondência parcial ou fuzzy. Resultado: **14/14 nomes iguais após normalização**, **0 diferenças**, **14 IDs nativos distintos entre os 14 códigos**; duração **53 ms**. Nenhum ID interno, nome bruto ou dado pessoal foi exportado para o chat ou GitHub.

**Transparência de tentativa:** a primeira invocação da consulta 1 terminou em `CommandNotFoundException` na rotina PowerShell sem fornecer saída de domínio válida. Foi corrigido o uso de booleanos PowerShell na saída; a nova invocação concluiu com recibo `L2_14_KNOWN_CODES_CATALOG_READ`. Não contar a tentativa com erro como prova de sucesso nem afirmar que o SELECT anterior deixou de executar, porque a falha não foi classificada por estágio. A consulta 2 foi executada e concluída normalmente.

| Código da matriz de outubro | Encontrado no catálogo SQL | Um ID nativo | Rótulo equivalente | Praças aprovadas por esta prova |
|---|---|---|---|---|
| `9.10.05.000.00` | Sim | Sim | Sim | Não |
| `9.75.00.020.00` | Sim | Sim | Sim | Não |
| `9.10.05.060.00` | Sim | Sim | Sim | Não |
| `9.15.00.060.00` | Sim | Sim | Sim | Não |
| `9.10.00.050.00` | Sim | Sim | Sim | Não |
| `8.00.05.000.00` | Sim | Sim | Sim | Não |
| `8.20.00.061.00` | Sim | Sim | Sim | Não |
| `9.10.05.040.00` | Sim | Sim | Sim | Não |
| `9.10.05.070.00` | Sim | Sim | Sim | Não |
| `8.00.00.010.00` | Sim | Sim | Sim | Não |
| `9.10.05.050.00` | Sim | Sim | Sim | Não |
| `9.15.00.070.00` | Sim | Sim | Sim | Não |
| `9.99.00.007.00` | Sim | Sim | Sim | Não |
| `8.20.11.002.00` | Sim | Sim | Sim | Não |

## O que mudou e o que continua pendente

**Mudou:** `L2_KNOWN_14_SQL_CANONICAL_CODE_EXISTENCE=14/14 OBSERVED`; `L2_KNOWN_14_UNIQUE_NATIVE_PRODUCT_ID=14/14 OBSERVED`; `L2_KNOWN_14_HISTORICAL_NAME_PARITY=14/14 OBSERVED`. Essa comprovação é posterior e independente dos snapshots históricos de setembro/outubro; ela reduz a possibilidade de que os 14 casos continuem pendentes apenas por ausência cadastral ou mudança nominal. Não apaga o motivo original `CLASSIFICATION_UNKNOWN` sem validação de regras.

**Não mudou:** `PRODUTO` não incluiu confirmação de rota por turno e loja nessa prova. `IDATIVO='S'` é o valor lido, não homologação independente de disponibilidade. A matriz histórica continua com **0/14 códigos autorizados a classificação automática**. Particularmente, **Cookie Pistache** permanece sem destino na **rota histórica** de setembro; existência no catálogo de novembro não é autorização para inventar impressora/praça. Rótulos de serviços Sushi Quentes e Cozinha Quentes, e exceções por item, permanecem as decisões de César já documentadas. Não tratar as 14 evidências de catálogo como prova de capturas completas do Reader, pronto físico, identidade iFood, primeira impressão ou fim da fila.

**Próximo passo sem interromper produção:** reconciliar esses 14 IDs/códigos com a **mesma versão** do catálogo da Academia e as regras atuais da operação; usar os comparadores já existentes na PR #135 (`comandas_packaging_classification_review_v1_offline.cjs`, `comandas_reader_catalog_identity_crosscheck_v1_offline.cjs`), sem duplicá-los no Delivery OS. Resolver divergências de produto, rota e praça uma por vez com evidência homologável, não por nome isolado. Para a V1, o N4 de identidade iFood independente é obrigatório nas fronteiras de vínculo externo (Conferência e entrega), **não um pré-requisito global para estudar L2 a partir de uma revisão nativa atestada**, conforme `DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md`.

**Fronteira operacional:** `L1_ATOMICITY=HOLD`, `L2_STATION_AUTHORITY=HOLD`, `L3_PHYSICAL_READY=HOLD`, `L4_HOME=HOLD`, `L5_IFOOD_CROSS_SOURCE_ID=HOLD`, `L6_XIAOMI_FIELD=HOLD`, `L7_END_TO_END=HOLD`, `L8_FIELD_ACCEPTANCE=HOLD`; **0/8 aceites operacionais**. Nenhum merge/deploy/print, serviço, SQL de escrita ou contato com fornecedor.

## Confronto adicional — fonte pinada da Academia (08/11/2026)

**Fonte exata verificada, sem usar nome como autorização:** repositório `cesarspichencoff-cmyk/tata-academia`, branch `evolucao/v33-product-pass`, arquivo `data/app-data.json`, **Git blob `d4cc9ba91c850314ffa9bd45fb9dfd1dea3d3c22`**, já referenciado na fonte de equivalência da PR #135. A fonte declara `meta.generated_at=2026-08-21` e estado `LAUNCH_HARDENING_CANDIDATE`; há **193 registros em `products`** no conteúdo efetivamente lido. Isso **não é prova** de que a mesma versão esteja em uso pelo time nem de que represente o catálogo SQL de 08/11.

**Método de cruzamento:** comparados os **14 rótulos históricos da matriz de outubro**, que acabaram de apresentar 14/14 equivalências no nome `NMPRODUTO` da Teknisa, apenas por nome normalizado com a mesma regra conservadora (acentos, caixa e espaços). Os objetos `products` da Academia não têm `CDPRODUTO` nem `CDARVPROD` na estrutura examinada. Portanto, esta é uma **comparação nominal de candidatos** e não ligação por identidade validada.

**Resultado:**
- **4/14** nomes com **uma** coincidência textual; **0** com múltiplos nomes idênticos; **10/14** sem coincidência exata.
- As **quatro** entradas coincidentes estão marcadas na própria Academia `classification.review_required=true` e `classification.truth_class='UNKNOWN_REVIEW_REQUIRED'`. **0/4 são elegíveis a promoção automática.**
- Nomes e códigos desses quatro candidatos com respectiva **praça declarada, não homologada**:

| Código | Rótulo do Reader | Praça da Academia candidata | Estado |
|---|---|---|---|
| `9.75.00.020.00` | Missoshiro | `cozinha_quentes` | Revisão obrigatória |
| `9.10.05.040.00` | Tartar de Atum Spicy | `duplas` | Revisão obrigatória |
| `9.10.05.070.00` | Ceviche | `enrolados_quentes` | Revisão obrigatória |
| `9.10.05.050.00` | Tartar de Salmão | `enrolados_quentes` | Revisão obrigatória |

**Os outros 10 códigos sem coincidência nominal direta:** `9.10.05.000.00`, `9.10.05.060.00`, `9.15.00.060.00`, `9.10.00.050.00`, `8.00.05.000.00`, `8.20.00.061.00`, `8.00.00.010.00`, `9.15.00.070.00`, `9.99.00.007.00`, `8.20.11.002.00`. Isso não prova ausência do produto; pode haver denominação diferente. Proibido criar correspondência fuzzy/sinônimo para autorizá-los. `Cookie Pistache` (último código) ainda não possui rota no mapa histórico de setembro e esse problema não é corrigido por existir no SQL.

**Fronteira de decisão:** `L2_ACADEMY_EXACT_NAME_CANDIDATES=4/14`; `L2_ACADEMY_NAMES_UNMATCHED=10/14`; `L2_ACADEMY_CANDIDATES_REVIEW_REQUIRED=4/4`; `L2_STATION_AUTHORITY=0/14`. **Nada deve ser enviado à impressora ou à Home por causa deste cruzamento.** A função existente `convergeReaderCatalogClassification` de Comandas exige códigos/IDs exatos e, mesmo para 14/14 correspondências, mantém `classification_approved=false` sem evidência de regra operacional independente.

**Priorização:** revisar primeiro os casos com mais ocorrências históricas e nome não associado, sem confundir frequência com número de pedidos: Carpaccio de Salmão, Tuna Shisso Tartar, Salmão/Atum 1 Pessoa e Shimeji e Shitake. Verificar com o cadastro e a via/rotina interna vigente; **não reabrir** as decisões já tomadas sobre Sushi Quentes ser uma subárea do Sushi e Quentes da Cozinha ser outra unidade operacional.

**L6 em paralelo (Difference Check):** a PR #137 já inclui proteção de `term_ack` com teste real JUnit anterior `254/254`, mas a política `EVENT_BATCH_HTTP_REJECTION_POLICY` permanece `HOLD`: `SyncWorker.kt` ainda chama `db.outbox().markFailed(ids,r.reason)` para `ApiResult.Rejected`. Não converter indiscriminadamente 4xx em `markRejected` permanente: diferenças entre 403 de delegação, erro de domínio, conflito recuperável e commit incerto exigem prova dos recibos e do escopo de credencial. Nenhum código Android foi alterado nesta continuidade, para não introduzir perda silenciosa de eventos.
