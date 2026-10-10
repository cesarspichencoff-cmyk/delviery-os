# Comandas V7.3 — diagnóstico do par real, observações e desenho preservado

**Data:** 10/10/2026. **PR:** #38 DRAFT/HOLD. **Foco:** chegar a três vias sem reconstruir o motor nem alterar desenho. Esta etapa é somente leitura passiva de dados de estado já existentes e ampliação do auditor V6.9 no próprio PR. **Nenhuma consulta SQL, impressão, serviço, turno, publicação ou instalação.**

## Checkpoint de mundo: CAIXA_MOOCA

Na inspeção somente leitura do dispositivo autorizado `CAIXA_MOOCA`, o arquivo `C:\ProgramData\TataComandaReader\evidence\shadow-consumer-status.json` tinha `updated_at=2026-10-10T18:11:32.241Z`, `state=RUNNING`, `processed=130`, `blocked_count=130`, `ready_count=0`, `reporting_envelopes_written=130`, `projection_runs=114`, `last_error=null`. Esses são **contadores do estado observado**, não totais históricos comprovados nem número de comandas.

O arquivo instalado `state\production-service-state.json` continua com **`operational_date=2026-10-07` / `service=DINNER` / `valid_until_local=2026-10-07T23:59:59`**, uma confirmação humana válida para aquele período, **não** para novos pedidos. Nenhum estado foi atualizado por relógio ou dedução.

Apenas para o **último par citado pelo estado**, a verificação passiva local leu evento/decisão e imprimiu **somente campos booleanos, contagens e classes sanitizadas**:
- esquemas nativos esperados em ambos;
- `order_key` e `snapshot_hash` iguais entre evento e decisão;
- **2 itens no evento e 2 na decisão**;
- `event_ready=false`, `decision_ready=false`;
- data do evento diferente da data operacional do estado instalado;
- **0/2 itens** do evento apresentam as colunas `DSOBSDESCIT`, `DSOBSPEDDIGCMD` ou `TXPRODCOMVEN` (contrato do watcher v1);
- bloqueios sanitizados: `SHIFT_DATE_MISMATCH`, `SHIFT_EXPIRED_FOR_ORDER`, `SERVICE_REQUIRED` e `PACKAGING_OR_BAG`.

**Limites observados:** a igualdade de `snapshot_hash` do evento e da decisão **não prova** os dados de observações armazenados na origem SQL; a verificação local desse par não calculou fingerprint de conteúdo de decisão nem correlacionou snapshots de produção. Ausência dos campos no watcher **não prova que o cliente não escreveu uma observação**; significa que o evento nativo atual não as transporta. O bloqueio de turno **não é o único bloqueio**. A captura não revelou identificadores de pedido, códigos de produto, texto livre, nem alterou arquivos.

## Evolução mínima do auditor já existente — V7.3

**Arquivo reutilizado:** `tools/auditar_pares_leitor_v69_readonly.js`. Não foi criado outro watcher, outro motor ou outro coletor. Foi acrescentado um diagnóstico de **presença das três colunas de observação** nos itens de eventos nativos, sem ler/publicar os valores. A saída possui `observation_source_coverage` (itens analisados, com alguma/todas as colunas, pares com cobertura completa) e cada resumo anônimo de par inclui `native_event_observation_fields_all_present`.

**Fail closed material:** `independent_sql_or_production_notes_join_executed=false`, `exact_revision_item_observation_proofs_verified=false`, `eligible_three_ticket_pairs_proven=0` e `three_ticket_preview_ready=false` **não são métricas de desempenho**: afirmam explicitamente que esta auditoria **não executa** o join de provas V6.8. Mesmo 3/3 colunas preenchidas em um evento e flags `ready` verdadeiras **não tornam um pedido apto a imprimir ou a exibir três vias**.

**Teste adversarial:** estendidos os testes existentes `tools/verificar_auditoria_leitor_v69.js` com cinco cenários: ausência das colunas v1, presença de três colunas com texto confidencial não emitido, colunas incompletas, colunas vazias erroneamente interpretadas como `PROVEN_NONE`, e um shadow com flags formalmente válidas que ainda não prova três vias. O arquivo `tools/verificar_par_evento_leitor_v68.js` preserva a verificação do mesmo `snapshot_hash` com notas e produção por item para **quando houver evidência independente**.

**Prova:** [CI #38075042495](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38075042495) **SUCCESS**, `PASSIVE_READER_AUDIT_V69=15/15`, `STABLE_READER_SHADOW_PAIR_V68=17/17`, gate V5.10 **25/25**, renderer V7.1 **12/12**, e trava original do desenho V7.2 **12/12 `SVG_GOLDENS_MATCH`**. Não houve mudança de renderer SVG/ESC/POS, golden, modelo Figma V4.4/V4.3 ou impressora.

## Próximo portão MATERIAL — não confundir com retrabalho

1. **Confirmação de turno atual e contrato temporal seguro:** V7.0 é somente revisão; `valid_from_local` não faz parte do estado v2 instalado. Não preencher data/turno por inferência, não reprocessar passado nem instalar watcher sem aceite de efeito específico.
2. **Observações com prova independente e mesma revisão:** reaproveitar o probe autorizado de outubro como **código**, não sua autorização antiga restrita a outro pedido. Uma eventual leitura nova deve ter escopo e autorização próprios, preservar texto original local e vínculo a `NRPRODCOMVEN`, código, quantidade, `order_key`/`snapshot_hash` daquela revisão, antes e depois da coleta. A fonte SQL/produção não pode ser substituída pelo evento v1 sem campos.
3. **Montar o pacote existente V6.8, não reimplementar projetor:** somente com identidade, rota, embalagem, kits e observações da mesma revisão podem ser utilizados `projectVerifiedReaderPairV68`, `gerar_tres_vias_par_leitor_v68_offline.js` e os renderers V4.6/V6.0 existentes. Se faltar qualquer prova, retornar `BLOCKED` e **não gerar SVG de pedido real aparentemente válido**.
4. **Desenho preservado:** layouts master Figma Produção V4.4 nó `30:2`, Conferência V4.3 nó `20:2`. O gate V7.2 compara os SVGs históricos com os mesmos hashes V6.5. Qualquer mudança intencional exige revisão humana e prova óptica; ainda há diferença não homologada entre SVG/Figma, raster e papel Epson.
5. **Fonte Academy:** PR #50 para Kids/Tataki permanece DRAFT; motor pinado do DeliveryOS ainda é `3167c309`, sem troca tácita.

**Estado após V7.3:** `CODE_READY + CI_PASS + BOUNDED_WORLD_DIAGNOSIS`, **não** `LIVE_THREE_TICKETS_PROVEN`, `DEPLOYED` ou `HUMAN_ACCEPTED`. `NO_PRINT / NO_SPOOLER / NO_MERGE / NO_DEPLOY / NO_SERVICE_STATE_WRITE / NO_SEQUENCE_BIND`.
