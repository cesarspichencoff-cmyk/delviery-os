# DeliveryOS — PostgreSQL, servidor crítico e leitura Copiloto (14/10/2026)

**Estado: TEST_PASS no laboratório isolado. Não é homologação de loja, deploy nem aceite humano.**

## Referências e proteção de escopo

- Código DeliveryOS: PR #117, HEAD verificado **`6bd3a1303412586825daee71d4e72cd0790d0e40`**, ainda **DRAFT/HOLD** e não incorporado à produção. O delta desde `7a011e1` altera **somente** `src/platform/run-cadeia-real-tests.ts` (guardas de audiência do Kotlin).
- Banco: PostgreSQL 18 **isolado em WSL**, porta `127.0.0.1:5547`, data dir `/tmp/vertice_deliveryos_pg_lab_20261014`, usuário **fictício** `lab_only`; o serviço preexistente em `5432` não foi acessado nem modificado. Todos os testes de produto criaram e descartaram bancos próprios via `bancoIsolado`.
- Servidor crítico oficial da base `dist/src/platform/bin/critical.js` compilada no ensaio. Rodou **somente** em `127.0.0.1:9347`, `DELIVERYOS_ENV=local`, `DELIVERYOS_SOURCE_MODE=simulated`, contra banco efêmero. Nenhum GPS, POS, rede de loja, pedido real, login real ou chave produtiva.
- O primeiro boot do crítico recusou iniciar por contrato de eventos ausente no destino de build. Corrigido **apenas o preparo do laboratório**, usando o copiador oficial `node tools/copiar_contratos.js`, que colocou `eventos.schema.json` no `dist/docs/contracts`. Código-fonte de produção intocado. O primeiro roteiro de testes de delegação também fornecia codificação incorreta de uma chave efêmera; corrigida apenas a fixture de teste. Essas tentativas falhas **não** contam como prova.

## Provas executadas nesta rodada

1. **EntregasLiveConsumer, PostgreSQL real: 3/3 PASS.** Commit durável antes de salvar checkpoint; reinício/replay sem duplicar `platform.event_log` nem outbox; carimbo `source_mode=simulated` preservado.
2. **FileUnitOfWork → ingestão PostgreSQL: 6/6 PASS.** Kill switch desligado não ingere; RUN consome só equivalências semânticas autorizadas; restart sem duplicação; leitura do log proibida ao papel de source-ingest.
3. **A mesma viagem Android do ensaio anterior:** `LAB-WM-T1` e unidade `LAB-WM-20261014`, origem `simulated`. O feed durável continha **6 eventos públicos**. **3** eram equivalentes e foram persistidos em `platform.event_log` com **os mesmos `event_id`**; os demais **3** (`delivery_added`, `arrival_reported`, `delivery_confirmed`) ficaram conscientemente isolados porque um evento de parada não pode alterar a viagem inteira. Após ingestão, `lerRealidadeDeEntregas` encontrou a viagem e `copilotoEntregasLeitura` retornou `observado`, **1 viagem** na unidade/modo corretos. Replay = idle, sem duplicatas. **Isto testa o leitor e a view model, não a interface visual no navegador.**
4. **Servidor crítico oficial e emissão/revogação com PostgreSQL: 11/11 PASS.** `/ready` 200; aparelho com hash previamente vinculado obtém sessão; emissão de credencial `pt1` assinada Ed25519; identidade consultada online; unidade divergente recusada; audiências plataforma/piloto não intercambiáveis; após `revoked_at` no banco, credencial já emitida torna-se inválida **imediatamente** e nova delegação é recusada; emissão registrada na auditoria PG.
5. **Suíte oficial da fila HTTP do crítico:** `B5_QUEUE_DEPTH_HTTP_PG: 8/8 PASS`.
6. **Suíte canônica atualizada**, já com o último commit `6bd3a13`: `run-cadeia-real-tests.ts` retornou **`36/36 provas da cadeia real`** / `CADEIA_REAL_GREEN`, incluindo papéis SQL mínimos, recuperação, autorização e guardas de audiência no Kotlin.

As provas 1–6 foram executadas em **laboratório com PostgreSQL real**. A prova da mesma viagem usou o armazenamento sintético produzido pelo teste instrumentado do Android e o consumidor real da plataforma, mas **a emissão da credencial pelo crítico oficial não ocorreu no mesmo ensaio físico**: foram testes separados. Não fundir duas evidências em uma homologação única.

## Fronteira restante

- Não houve uma única execução Android → **servidor crítico oficial** HTTPS → piloto HTTPS → PostgreSQL → **interface visual real** incluindo revogação durante a mesma sessão. O teste anterior Android→plataforma fictícia→piloto e a prova atual do crítico oficial **são complementares, não equivalentes**.
- A interface Entregas/Copiloto foi verificada **pela view model**; não foi comprovada por navegador real nesta rodada.
- Rotas de aceite de termo e leitura de políticas ainda exigem auditoria de autorização separada, não reaproveitamento indiscriminado do escopo `entregas:events:write`.
- CI remoto no HEAD `6bd3a13`: **nenhuma execução encontrada** no retorno consultado (não afirmar CI aprovado).
- Faltam quebra física de rede, GPS e privacidade autorizados, aparelho físico consentido, backup/restore completo, TLS/assinatura de campo, operação supervisionada e autorização humana para release.

**Prova:** `TEST_PASS` no ambiente descrito. **Não são** `DEPLOYED`, `WORLD_PROVEN` produtivo, `HUMAN_ACCEPTED` nem `10/10`. Sem merge, deploy ou alterações produtivas.
