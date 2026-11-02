# TATÁ Comandas — auditoria independente da primeira via iFood (02/11/2026)

**Base:** PR #127 HEAD `9c04a3a1ce6c2978592ddd6ee902202dce62d6d8` (sem editar a branch da PR).
**Branch desta auditoria:** `audit/comandas-attempt-scope-20261102`.
**Estado:** REVIEW ONLY · DRAFT · HOLD. Nenhum acesso ao caixa, Retail, SQL, spooler, impressora, serviço, fiscal ou fornecedor nesta sessão.

## 1. Veredito

A rota anterior pôs no caminho crítico uma pergunta que nenhuma ferramenta conectada alcança: **qual callsite nativo dispara a primeira via `DLV_IFO`**. Essa pergunta só é obrigatória se a TATÁ for **substituir** a produção nativa. Ela some do caminho crítico se a produção nativa já estiver fisicamente certa — e isso ninguém mediu.

**Direção que sobrevive:** medir o **resultado** antes da **causa**.

1. **Censo de papel (D, zero acesso a sistema):** uma testemunha humana por impressora, num turno, registra o que de fato sai para cada pedido iFood. É a única fonte capaz de mover `PHYSICAL_PRINT` de UNKNOWN para observado, e decide se o callsite precisa ser descoberto.
2. **Caixa lógico por agregado (C, uma consulta somente leitura, se autorizada):** o repositório já tem, desde 05/10, um pedido `DLV_IFO` com venda fiscal no **caixa `001`**. Um agregado por caixa de um dia fechado confirma ou derruba esse candidato sem tela do Retail, sem token, sem dado pessoal.
3. **Código (B, feito e testado):** duas falhas reais nos contratos de journal, provadas por teste vermelho antes da correção.

## 2. O que foi comprovado nesta sessão

### 2.1 Falha 1 — diagnóstico aceitava `attempt_id` e intenção reutilizados em outro escopo

`decideProductionOrderRevisionReviewV1` (`src/production/productionPrintIdempotency.ts`) indexava a tentativa por `order+station+day+attempt_id`. Um journal em que **o mesmo `attempt_id`** aparece em outro pedido como `PHYSICALLY_CONFIRMED` — ou em que **a intenção atual** aparece registrada sob outro pedido/praça — saía como `REVIEW_CANDIDATE_NO_PRINT_AUTHORITY`. A camada seguinte (`comandas_native_first_dispatch_correlation_v1_offline.cjs`) rejeitava o mesmo journal. Duas camadas, um journal, dois veredictos.

Sonda no HEAD intocado (`9c04a3a`), fixtures sintéticas:

| Caso | HEAD original | Esperado |
|---|---|---|
| P1 · mesmo `attempt_id` em outro pedido, confirmado em papel | `REVIEW_CANDIDATE` | HOLD |
| P2 · mesmo `attempt_id` em outra praça do mesmo pedido | `REVIEW_CANDIDATE` | HOLD |
| P3 · intenção atual registrada sob outro pedido | `REVIEW_CANDIDATE` | HOLD |
| P5 · mesmo journal: correlação × link do Reader | correlação `HOLD`; link `diag=REVIEW_CANDIDATE` | ambos HOLD |

**Correção:** a identidade da tentativa passa a ser o `attempt_id` no journal inteiro (mesma regra da correlação e do gate legado). Motivos novos: `ATTEMPT_ID_REUSED_ACROSS_ORDER_STATION_DAY_SCOPE` e `PRINT_INTENT_FINGERPRINT_REUSED_ACROSS_SCOPE`. Os vetos mais fortes da mesma praça (papel confirmado, efeito desconhecido) mantêm precedência.

### 2.2 Falha 2 — SHA-256 em maiúsculas furava o veto de colisão da correlação

A correlação aceita hex nos dois casos (`/^[0-9a-f]{64}$/i`) mas comparava a intenção com `===`. Uma linha de **outro pedido**, `PHYSICALLY_CONFIRMED`, com a **mesma intenção em maiúsculas**, não era vista: o resultado subia para `CORRELATED_CLAIMS_REVIEW_ONLY`, o status mais alto que essa camada emite (caso P4b). Controle P4a, a mesma linha em minúsculas: `HOLD`. A comparação agora normaliza o caso só nesse veto; as checagens de identidade exata continuam exatas (falham fechadas).

### 2.3 Testes

- **Vermelho antes da correção** (código-fonte intocado, testes novos): `verificar_production_print_plan_v1.js` falha (`REVIEW_CANDIDATE` ≠ `HOLD`); `verificar_comandas_first_dispatch_fingerprint_scope_v1_offline.cjs` falha no caso 5 (`CORRELATED` ≠ `HOLD`); o novo diferencial falha no caso 2.
- **Verde depois:** plano de impressão `ok`; escopo de fingerprint **10/10**; diferencial novo **10/10**; evidência Reader V2 **77/77** (inalterado).
- **Novo portão diferencial** `tools/verificar_comandas_journal_scope_cross_layer_v1_offline.cjs`: o mesmo journal, cópia byte a byte, passa pelas três camadas; seis envenenamentos exigem HOLD em todas, nas duas ordens de linha; dois controles benignos exigem que nenhuma invente colisão. Ligado aos jobs Linux e Windows.
- **Regressão da CI completa, local:** ver seção 7.

**Peso honesto:** nenhuma das duas falhas abria caminho para impressão — todas as camadas mantêm `print_authorized=false`. O dano era **diagnóstico enganoso**: um humano lendo "candidato" sobre um journal envenenado. Corrigido, não muda a rota da primeira via.

## 3. Descoberta de rota — o caixa lógico já tem um candidato observado

**Fato (fonte commitada, leitura autorizada de 05/10):**

| Fonte | Conteúdo |
|---|---|
| `data/tata_reader_closed_delivery_fail_closed_and_native_fiscal_8332_20261005_v1.json` (commit `b8bfb27`, SHA-256 `bf6a511f7be325503534d02444fc9044a7dfe25c57e9a75368075df2de59fb7b`) | pedido `IDORGCMDVENDA=DLV_IFO` → venda fiscal com `CDCAIXA="001"`, NFC-e autorizada |
| `docs/Fiscal_Observation_Architecture_2026-10-05.md:20` | o mesmo pedido: "caixa: 001" |
| `docs/comandas/AUDITORIA_RAMOS_IMPRESSAO_RELATORIO_DELIVERY_VS_PRODUCAO_20261027.md:10` | o relatório automático pós-venda de delivery lê `IMPRIMEDLV_AUTOMATICO` por **`CDFILIAL+CDLOJA+CDCAIXA`** (`Venda.php:469–499`, `MSDEQuery.php:4815–4821`) |
| `docs/comandas/DECISAO_TRILHA_PRIMEIRO_DESPACHO_20261101.md:15` | API Teknisa: pré-pedido "depende de caixa PDV para virar venda" |

**Cruzamento inédito:** `CDCAIXA` aparece no histórico do Git só nesses dois commits e nunca foi ligado à ficha B05 (busca em `git log -S`, nos 55 comentários e no corpo da PR #127: zero menções). O elo `DLV_IFO → caixa 001` já foi observado uma vez, em fonte legítima.

**O que isso NÃO prova:**
- n = 1, de 05/10; filial/loja não estão gravadas nesse arquivo.
- `VENDA.CDCAIXA` é o caixa da **venda fiscal**. Pode ser o caixa da integração (vendedor padrão ou mapeamento por unidade) **ou** o caixa de quem finalizou o pedido. Não é o cadastro `IFO` do Retail.
- Nada sobre primeira via de produção, host emissor ou papel.

**Uso correto:** `001` é o **candidato a confirmar**, não um valor a usar. Ele também diz qual linha de `CAIXA` governa o ramo `IDIMPAUTENTREG` do relatório de entrega desse pedido — o papel nativo que mais se parece com a futura conferência TATÁ.

## 4. A observação mínima para fechar o B05 (C) — NÃO executada

**Uma** consulta agregada, somente leitura, no mesmo canal já autorizado em 25–26/10 (`ApplicationIntent=ReadOnly`, sem DML/DDL), sobre **um dia fechado** (ex.: 25/10, com 317 `DLV_IFO` já contados):

- vendas fiscais ligadas a comandas `DLV_IFO` da filial `0001`/loja `01`, agrupadas por `CDCAIXA` → só **código do caixa e contagem**;
- denominador: total de comandas `DLV_IFO` do dia e quantas não têm venda.
- Ligação venda↔comanda por `CDFILIAL+NRVENDAREST`, como no artefato de 05/10 `data/tata_reader_fiscal_read_permission_candidate_v1.json`. Nomes de coluna fora desses artefatos precisam ser conferidos no `MSDEQuery.php` já hasheado antes de escrever a consulta — não presumir.

**Regra de decisão registrada antes do dado:**

| Resultado | Classe | Próximo passo |
|---|---|---|
| todas as vendas `DLV_IFO` num único caixa | `SALE_CAIXA_SINGLE_CANDIDATE` | uma tela do Retail (ou responsável) só confirma esse código; o B1 mira esse caixa |
| vendas em 2+ caixas | `SALE_CAIXA_MULTIPLE_HOLD` | a venda segue o operador, não a integração; B05 volta para a tela do Retail |
| cobertura baixa ou consulta negada | `B05_UNVERIFIED` | parar; não substituir por nome de host |

**Autorização necessária:** César, específica para essa consulta. Sem ela, nada é executado.

## 5. Desafio da premissa das três vias (D)

**Hipótese que ninguém testou:** as duas vias nativas de produção (uma por praça) já saem certas hoje. Se for verdade, a TATÁ não precisa suprimir nada da produção nativa — e **o callsite deixa de importar**. Sobra só a conferência independente, aditiva, numa impressora que nenhum caminho nativo `DLV_IFO` usa.

**Observação mínima — censo de papel, um turno, sem tocar em sistema:**
- uma pessoa por impressora ativa no delivery, folha impressa;
- para cada papel que sai: hora:minuto, etiqueta física da impressora, tipo (produção · relatório de entrega · Gestor/GP iFood · fiscal · outro), identificador impresso no cabeçalho e se é reimpressão;
- amostra: ~20 pedidos iFood consecutivos de um pico; sem foto, sem nome ou endereço de cliente.

**Regra de decisão:**

| Censo | Rota |
|---|---|
| todo pedido da amostra: exatamente 1 via nativa por praça envolvida, nenhum papel Gestor/GP, itens e observações legíveis | **D1:** manter produção nativa; construir só a conferência TATÁ (ainda exige sequência persistida e impressora exclusiva) |
| falta, duplicata, papel Gestor/GP ou item/observação errados | **D2:** a produção nativa não é confiável; substituí-la exige o B1 (callsite) — manter D0 shadow |
| amostra incompleta | **D0:** shadow digital, sem papel |

O censo também amarra papel → pedido pelo horário e pelo identificador impresso, cruzando com o `DTHRABERMESA` que o Reader já observa: vira testemunha física da primeira via, por amostra, sem instrumentar o host.

## 6. Lacuna mínima remanescente

| Lacuna | Campo exato | Testemunha/fonte | Modo seguro |
|---|---|---|---|
| Produção nativa fisicamente correta? | vias por pedido × praça, tipo, identificador | humano na impressora | censo de papel (seção 5) |
| Caixa lógico `IFO` | `CDCAIXA` das vendas `DLV_IFO` de um dia | SQL somente leitura já usado | agregado (seção 4), com autorização |
| Host ↔ caixa `001` | qual PDV abre sessão como caixa `001` | responsável no caixa | pergunta visual; não inferir pelo nome `CAIXA_MOOCA` |
| Callsite da primeira via | componente + chamada efetivamente invocada | só se D2 | B1 já especificado; não agora |
| Sequência TATÁ persistida | vínculo 001–999 ↔ chave de 4 partes relido | sistema real | migração autorizada; o laboratório SQLite não conta |

## 7. Regressão executada

- Ambiente local: Node 22.23.4, TypeScript 5.5.3 (versão do lock). O pacote `xlsx` vem de `cdn.sheetjs.com`, bloqueado pelo proxy desta sessão; usei um stub de tipos **só local, fora do Git**, para compilar. Nenhum teste de comandas importa `xlsx`.
- Todos os passos `run:` do job Linux, isolados, com `bash -eo pipefail`, nas duas árvores:

| Árvore | Executados | Passaram | Falharam | Pulados |
|---|---:|---:|---:|---:|
| HEAD original `9c04a3a` | 132 | 130 | 2 | 8 |
| esta branch | 133 | 131 | 2 | 8 |

  As 2 falhas são as mesmas nas duas árvores e são do ambiente: a sonda de topologia precisa de `pwsh` (ausente aqui) e o V8.37 recusa rodar fora de runner hospedado (`V837_HOSTED_RUNNER_ONLY`). Pulados: 2 `uses:`, `npm ci` (bloqueado pelo `xlsx`) e 5 passos `shell: pwsh`. **Diferença de status entre as árvores: zero.** O único passo a mais é o diferencial novo: 10/10.
- Testes principais do `CLAUDE.md` nesta branch: `build`, `typecheck`, `demo`, `teste_fonte_real` e `verificar_dados_primarios` com saída 0; `autoteste_8pracas` falha nas duas árvores porque exige o `xlsx` real (ambiente).
- Windows: só na CI do GitHub; nenhum teste Windows rodou nesta sessão.

## 8. Segurança

Efeitos reais nesta sessão, todos `false`: impressão, reimpressão, spooler, fila, porta 9100, driver, serviço, instalação, configuração do caixa, Retail, SQL (leitura ou escrita), sequência, fiscal/SEFAZ, credencial, pedido real, contato com fornecedor, merge, deploy, cutover.

Permanecem: `FIRST_NATIVE_DISPATCH=UNKNOWN` · `PHYSICAL_PRINT=NOT_PROVEN` · `IFO_LOGICAL_CASHBOX=CANDIDATE_001_UNVERIFIED` · `PERSISTED_SEQUENCE_V2=UNKNOWN` · `10/10=NOT_PROVEN`.
`CODE_READY ≠ TEST_PASS ≠ LIVE_PROVEN ≠ HUMAN_ACCEPTED`.
