# Comandas V7.8 — auditoria de runtime real e linhagem do motor

**Checkpoint:** 10/10/2026, CAIXA_MOOCA, PR térmico #38 DRAFT/HOLD.
**Escopo da execução:** exclusivamente arquivos locais preexistentes, em leitura, e alterações de código/testes/documentação no PR. **Sem SQL, cliente, nome do pedido, nova captura, alteração de serviço, spooler, impressão, deploy ou merge.**

## 1. Onde está o bloqueio real

Snapshot do consumidor `shadow-consumer-status.json` em `2026-10-10T21:43:40.865Z`:
- `state=RUNNING`, `processed=189`, `ready_count=0`, `blocked_count=189`, `projection_runs=163`, `last_error=null`;
- **contadores da instância**, não total histórico de pedidos nem garantia de identidade entre arquivos.
- estado humano instalado `production-service-shift-state.v2`: loja `0001`, `DINNER 07/10`, `valid_until_local=2026-10-07T23:59:59` e **vencido**; não foi renovado.

Auditoria PASSIVA de **300 arquivos recentes de decisão**, sem número/cliente/texto de pedido, mostrou `300/300 BLOCKED`. Contagens por arquivo (múltiplas causas em um arquivo), sem deduplicação de revisões:
- `SHIFT_OR_SERVICE`: 300;
- `PACKAGING_OR_BAG`: 206;
- `ROUTE_OR_PRODUCT_CLASSIFICATION`: 79;
- `KITS`: 138;
- `OBSERVATIONS`: 3.

Nos **50 mais recentes**: turno 50; embalagem/sacola 36; rota/classificação 10; kits 30; observações 2.

Nos **100 mais recentes**, subclasses estáticas exatas (sem sufixos identificadores):
- `UPSTREAM_SERVICE_STATE_DATE_MISMATCH_ORDER_DATE`: 100 arquivos;
- `UPSTREAM_SERVICE_STATE_EXPIRED_FOR_ORDER`: 100;
- `KITS_NOT_FACT`: 51;
- `BAG_SIZE_NOT_FACT`: 42;
- `BAG_COUNT_NOT_FACT`: 37;
- `PACKAGING_UNKNOWN`: 17;
- `ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW`: 2.

**Conclusão limitada:** atualizar apenas o turno não resolve automaticamente embalagem, kits, classificação e observações. Sem as regras e evidências específicas de cada item, nenhum bloqueio deve ser removido.

## 2. MOTOR JÁ CORRETO — NÃO REFAZER

Foi calculado em **leitura direta do disco do CAIXA_MOOCA**, sem cópia/mudança:

`C:\ProgramData\TataComandaReader\shadow\packaging-current.js`
- Git blob SHA-1: **`3167c309f02a0ad5a84fb43043b8866e3bee873c`**, exatamente o `PACKAGING_SOURCE_BLOB_V63` do PR #38 e do TATÁ Academia;
- SHA-256 dos bytes: **`1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e`**;
- `82858` bytes, modificado em 07/10.

Esses dois digests usam algoritmos/dominios diferentes e **não** são comparáveis diretamente. Não confundir o motor existente com o novo candidato Academy PR #50 (DRAFT), ainda não integrado.

## 3. CONSUMIDOR INSTALADO DIFERE DO VERSIONADO — NÃO SUBSTITUIR ÀS CEGAS

No mesmo dispositivo, arquivo `C:\ProgramData\TataComandaReader\shadow\live_shadow_consumer_v1.cjs`:
- Git blob SHA-1 instalado: **`22e3bdcbbed1cf245088f32679dd29ffb50766c9`**;
- arquivo do PR #38 `runtime/shadow/live_shadow_consumer_v1.cjs`: Git blob **`bba3212cba43d0a7803e9025f4826ded0459c63c`**;
- são bytes **diferentes**. Instalado com 16.480 bytes e sem construção textual de `rule_lineage`, enquanto o versionado possui `ruleLineage` com seis referências SHA-256 de origem;
- o **último envelope `deliveryos.live-shadow-decision.v1`** inspecionado possui `packaging` e `kits`, mas **não** possui `rule_lineage`. Assim o guard existente V6.8 `SHADOW_DECISION_LINEAGE_ABSENT` já o rejeitaria mesmo que `ready` fosse declarado. Não inferir que o versionado já está executando no Windows.

**Ação vedada:** substituir o consumidor instalado diretamente pelo GitHub sem auditoria de diferença, rollback, identidade do serviço, efeito e autorização específicos.

## 4. V7.8 — correção CIRÚRGICA apenas no código SHADOW

A validação anterior de `verifyLiveReaderPairV68` pedia linhagem não vazia, mas aceitaria strings fictícias. Agora:
- Fonte única no bridge: `PACKAGING_SOURCE_SHA256_V78` representa o arquivo exato cujo Git blob V6.3 já é pinado;
- Requer **duas** entradas de linhagem Academy (`packaging-current.js`, `app-data.json`) e **quatro** do DeliveryOS (`routing.json`, `printer-map.json`, `non-production.json`, `product-identity-cache-v1.json`), com origens esperadas e formato SHA-256 de 64 hex, sem duplicidade;
- Requer que o hash SHA-256 da entrada do **motor** seja exatamente o digest do motor canônico instalado/auditado;
- Sem linhagem, malformada, desatualizada ou motor divergente: **BLOCKED**, nunca prévia de três comandas pronta;
- A alteração NÃO autentica criptograficamente o Windows, NÃO lê o disco em runtime e NÃO compara fisicamente o papel. A linhagem continua uma *declaração do produtor*, necessária mas não suficiente. Por isso a prova de filesystem e serviço de origem continuará obrigatória no cutover.

**Prova:** [CI térmica #38089167251](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38089167251) **SUCCESS**, `STABLE_READER_SHADOW_PAIR_V68=49/49` (oito casos novos), `PASSIVE_READER_AUDIT_V69=21/21`, `READER_SHIFT_HUMAN_REVIEW_V70=29/29`, `THERMAL_DIRECT_RENDERER_SEMANTIC_V71=12/12`; **`THERMAL_DESIGN_LOCK_V72=12/12; SVG_GOLDENS_MATCH`** (as três vias mantêm o mesmo desenho histórico).

## 5. Próxima rota sem retrabalho

1. **Pré-instalação/sem efeitos:** auditar a diferença entre o consumidor real `22e3bdcb...` e o versionado `bba3212c...`, incluindo leitura de origem, compatibilidade de decisões, preservação de estado/replay, rollback e trabalho com permissões de serviço. Não substituir arquivo instalado sem autorização de efeito.
2. Confirmar futuramente o turno humano **atual** e janela temporal prospectiva; o contrato instalado v2 não tem `valid_from_local`. Renovação genérica poderia aceitar eventos anteriores.
3. Reconciliar casos reais de `KITS_NOT_FACT`, `BAG_SIZE_NOT_FACT`, `BAG_COUNT_NOT_FACT` e `PACKAGING_UNKNOWN` com o **motor exato já instalado**; só promover exceções documentadas e provadas. As notas com sinal de alergia pedem revisão humana explícita, nunca inferência.
4. Revisão específica da relevância da `DSOBSCOMANDA` do pedido exato, via pacote V7.7, com identidade humana/evidência externa; pedido real consultado anteriormente não foi classificado automaticamente.
5. Apenas após todos os portões, gerar as vias em SHADOW com V6.8 e renderers existentes, submetê-las à trava Figma V7.2 e, sob autorização específica, realizar teste óptico na CAIXA Itaim.

**Estado:** CODE_READY+CI_TEST_PASS e READ_ONLY_WORLD_EVIDENCE. **NÃO** DEPLOYED/PRODUCTION_READY/PHYSICAL_ACCEPTED. PR #38 mantém DRAFT/HOLD.
