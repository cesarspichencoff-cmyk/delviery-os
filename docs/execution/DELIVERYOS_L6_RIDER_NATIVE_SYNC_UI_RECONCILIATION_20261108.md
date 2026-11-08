# Delivery OS V1 — L6: botão de sincronização do motoboy e confirmação visual por evento (08/11/2026)

**Escopo:** somente Delivery OS Itaim, PR [#137](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/137), branch `feat/gestor-shadow-observer-20261103`, **aberta e em rascunho**. A frente de captura de pedidos está em outra execução e não foi modificada. Fonte VÉRTICE revalidada: repositório literal `cesarspichencoff-cmyk/vertice-runtime.`, branch `vertice-active`, `VERTICE_ENTRY.md` blob `912a02f932acc42e76cb1fb7d46b3f1f8a0c380d`.

## Falha real na integração entre tela e Android

Antes da correção, `EntregasJsBridge.syncNow()` já existia em `EntregasBridge.kt` e chamava `SyncScheduler.requestNow()`, mas `native-bridge.js` **não expunha esse método** no objeto consumido por `rider.js`. Além disso, o botão `btnSyncNow` era mostrado apenas conforme `snap.connection === "offline"` da **fachada demonstrativa** e fazia `POST /api/connection` com `connection:"online"`. No aplicativo, isto não demonstrava solicitação de sincronização nativa e podia confundir status da demonstração com estado local do Room.

A fila já tinha um sinal de `pending`/`failed`/`sending`, mas nenhum aviso de transição especificamente associada ao `sent` de uma ação da mesma identidade. Se a linha simplesmente desaparecesse da janela de leitura, não havia uma prova suficiente de recibo: esse caso deve permanecer sem garantia de sucesso.

## Correções estritamente delimitadas

1. `src/entregas/ui/rider-mobile/native-bridge.js`: expõe `syncNow` somente quando o método nativo existe; aplicações antigas permanecem compatíveis, sem fabricar um endpoint alternativo. `EntregasBridge.kt` e `SyncWorker.kt` **não foram alterados**.
2. `queue-health.js`: funções puras `canRequestNativeQueueSync` (exige leitura válida, evento aberto e capacidade nativa) e `confirmedNativeQueueTransition` (exige a MESMA `event_id` e `sequence_local`, transição `pending|failed|sending → sent`, sem IDs duplicados). `sent` visto pela primeira vez, linha ausente, `rejected`, leitura malformada ou identidade divergente **nunca** são anunciados como recibo novo. O texto diz que o **aparelho registrou** a confirmação do servidor; não prova entrega física.
3. `rider.js`: botão agora mostra **"Tentar sincronizar ações"** para fila nativa aberta e legível, inclusive quando a fachada demo informa `online`; sua ação chama `native.syncNow()` e registra apenas que a tentativa foi solicitada. **Não** chama mais `POST /api/connection` em ambiente com ponte Android; esse comportamento continua apenas no navegador de demonstração. Uma resposta de `syncNow()` não é confundida com ACK de processamento. A tela observa os próximos estados no método de leitura nativa já existente, e o aviso de confirmação requer a transição exata acima. Uma perda de leitura apaga a continuidade observada, em vez de reaproveitar uma confirmação antiga.
4. `index.html`: acrescentadas duas regiões acessíveis `role="status"`: uma para pedido de sincronização e outra para confirmação observada por evento. O aviso de `rejected` continua separado com `role="alert"`, sem exibir texto livre da API.
5. `run-queue-health-tests.mjs`: novas contraprovas de unicidade, ausência, primeiro `sent`, recusa, estado malformado, regressão da ponte e disponibilidade de botão. `run-rider-native-sync-browser-tests.mjs`: abre a **página real no Chromium** com servidor estático e JSON totalmente sintéticos em `127.0.0.1`; injeta uma **ponte Android fictícia**, NÃO conecta ao Room/Worker de verdade. A workflow da PR passou a executar e exigir essa suíte e a arquivar 8 capturas de tela.

## Provas e limites observados

**Commit de código testado:** `9b0cd6fb0b3cdd548f5cddb4a9b26d2b365414d2`.

- [CI geral #42513871457](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42513871457): **`completed/success`, 5/5 jobs** Linux, Chromium/Edge e Windows em runner isolado. Os testes de fila foram **47/47** e a suíte Chromium de motoboy **8/8**.
- No Chromium foram verificados: fila nativa `pending` com clique `syncNow` → transição `sent` e alerta visível; `sent` inicial não gera novo alerta; `failed` → `rejected` visível sem segredos; falha de leitura bloqueia; método ausente em app antigo oculta botão; fachada offline não é falsificada via POST; exceção da ponte não gera ACK; desaparecimento de linha não equivale a recibo.
- Artifact de imagens de laboratório: [`l6-rider-native-sync-browser-fixture`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42513871457/artifacts/13629998710), **oito capturas** em viewport 390×844, geradas em ambiente sintético. As capturas não são do Xiaomi e não representam aprovação humana.
- [CI Android Room #42513871460](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42513871460): **`completed/success`, BUILD SUCCESSFUL, 28 suítes, 287/287 testes, zero falhas e zero erros** no mesmo commit de código. Nenhum arquivo Kotlin/Room foi alterado nesta correção de UI; é uma regressão independente do WorkManager/Room.

**Limites materiais:** a ponte usada no Chromium é um stub de JavaScript; a CI Android é independente. Este passo **não prova** o clique chegando ao Android WebView de um Xiaomi real, o agendamento durante Doze, a rede móvel/HTTPS, a política de consentimento no campo, o recibo real e a aceitação humana de tela. Não equiparar 8/8 visual a `WORLD_PROVEN`.

**Sem efeitos externos:** não houve instalação, APK de campo, merge, deploy, impressão, acesso ao caixa ou alteração em dados de colaboradores/pedidos, servidores de piloto, credenciais ou GPS. Execução apenas em branch DRAFT e GitHub Actions com dados fictícios.

**Estado do plano:** `L6_MANUAL_NATIVE_SYNC_BRIDGE=CODE_READY+CI_BROWSER_PASS`; `L6_VISUAL_RECEIPT_TRANSITION=PASS_CHROMIUM_SYNTHETIC`; `L6_REAL_ANDROID_WEBVIEW=NOT_RUN`; `L6_HTTPS_FIELD=UNKNOWN`; `L6_XIAOMI=NOT_RUN`; `L4_HOME_LIVE=HOLD`; `L7_END_TO_END=HOLD`; `L8_FIELD_ACCEPTANCE=HOLD`; **V1 ainda 0/8 etapas integralmente homologadas em campo**.

**Próxima prova de maior valor:** usar um dispositivo Android isolado autorizado com APK debug e servidor local de laboratório para comprovar, em WebView real, clique → `syncNow` → WorkManager → Room → estado visível, com reconexão e sem dados reais. Depois, com aceite operacional específico, homologar o Xiaomi no Itaim. A sequência não deve se transformar em mais testes de strings sem prova material adicional.
