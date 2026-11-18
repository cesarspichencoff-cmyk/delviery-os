# Delivery OS Itaim — L4 Home e L6 Entregas: linguagem fiel à fonte (08/11/2026)

**Missão:** continuidade exclusivamente do **Delivery OS V1 do Itaim**. A frente de captura/roteamento de pedidos está em execução separada; nenhuma alteração, investigação ou autorização dessa frente foi feita aqui. Posição na matriz [`DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md`](./DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md): **L4 e L6 progrediram em laboratório; 0/8 linhas com aceite operacional integral**. A Home continua o produto central; Entregas, o segundo módulo prioritário.

**Canônico metodológico revalidado:** `cesarspichencoff-cmyk/vertice-runtime.` (nome com ponto final), `vertice-active`, `VERTICE_ENTRY.md` blob `912a02f932acc42e76cb1fb7d46b3f1f8a0c380d`. PR [#137](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/137) continua **DRAFT/OPEN**. **Commit de código e QA que serve de base às provas:** `5a635e7fc14e20ee2afc1aad65f1c3a358b97ab3`.

## L6 — a outbox diz o que sabe, não o que imagina sobre o HTTP

**Defeito observado em código:** `src/entregas/ui/rider-mobile/rider.js` marcava um evento local `failed` com a frase **"a última tentativa não chegou ao servidor"**. Isto não é dedutível do `Room`: um lote pode retornar **HTTP 403, 409 ou 422**; a tentativa **chegou** à API, mas o evento não obteve ACK de processamento. A interface não podia tratar erro de negócio, rede e commit incerto como ausência garantida de requisição.

**Correção mínima, sem alterar o Kotlin nem o protocolo:**

- Em `src/entregas/ui/rider-mobile/queue-health.js`, foram acrescentadas funções puras `queuedOperationalActionsMessage` e `rejectedOperationalActionMessage`. `pending` é ação guardada aguardando sincronização; `sending` é envio em curso ainda sem confirmação; `failed` é **tentativa sem confirmação** que pode ter alcançado o servidor. Em fila mista não se afirma que a falha pertence à ação mais recente.
- A mensagem de `rejected` continua **visível**, mas **não ecoa `last_error`** (texto remoto livre que poderia conter dados de cliente, host, segredo ou payload). Em vez disso, apresenta orientação conservadora para consultar o responsável antes de repetir. Não foi criado nenhum efeito ou autorização de ação.
- `rider.js` usa esses dois formatadores no fluxo de renderização real. As ações ainda passam pelos gates existentes de identidade, ponte nativa e persistência; nenhuma fila é eliminada, nenhum estado é alterado e `failed` não é promovido a `sent`.
- `run-queue-health-tests.mjs` inclui casos adversariais de 403/409/422, fila mista, `pending`/`sending`/`rejected`, retorno malformado, privacidade do texto remoto e conexão estática do módulo com a página. **39/39 testes** no job Linux `Static fixture contracts` da CI [#42462122469](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42462122469). Prova JavaScript sintética, **não** representa UI no Xiaomi ou ACK real do servidor.

**Limite:** política para 4xx persistentes com recibo por evento permanece `HOLD`; não inventar reenvio infinito como cura nem descartar fatos por código HTTP global. Falha local significa **sem confirmação comprovada**, não sucesso nem não-recebimento garantido.

## L4 — a Home não pode declarar normalidade quando a fonte falha

**Defeito observado:** a faixa `faixaTecnica(vm)` em `src/product/ui/surfaces/home.js` dizia **"O resto da operacao segue normal"** após marcar fonte como degradada. Isso violava a Constituição do Produto (ausência de dado nunca significa Verde/Calmo/saudável), contradizia o apoio já existente do `homeVM` e produzia garantia sem fonte.

**Correção estritamente textual:** substituído por **"As demais areas so podem ser avaliadas com leitura confiavel"**. Não se alterou o dono de Calmo/Ambiente/Foco, a política temporal, os estados de ambiente, os sinais, o mapa visual, os botões nem as fontes.

**Testes e prova:**

- `tests/reporting/run-deliveryos-home-source-truth-tests.cjs`: **5/5** no job Linux [#42462122469](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42462122469), verificando guardas da faixa, hora condicional, ausência de ação e o teste visual correspondente. Este teste é estrutural/estático.
- `tests/product/run-m1b-home-visual-truth-tests.ts` foi ampliado para inspecionar o **texto realmente renderizado** na cena degradada, recusando a garantia antiga. Rodou no Chromium headless, em servidor Product System local exclusivamente demo, em **quatro estados** (`calmo`, `ambiente`, `foco`, `degradado`) × **seis larguras** (320/375/390/768/1024/1440): **24/24 PASS** no job `L4 Home degraded-state Chromium (synthetic only)` da CI [#42462122469](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42462122469). Cobriu indicação `simulado`, viewport sem overflow, texto e layout.
- Foram geradas **24 capturas de tela e `measurements.json`**, armazenadas no artifact `l4-home-degraded-visual-fixture` do run indicado, identificador 13610122301; **não** são screenshots de produção, nem prova de aprovação visual humana.
- A CI passa a monitorar especificamente os arquivos da Home, da fila do motoboy e seus testes, evitando mudanças futuras silenciosas.

## Efeitos e fronteira de aceite

**Sem efeito externo:** nenhuma ação no caixa, SQL, leitor nativo instalado, serviço Windows, impressora, iFood, GPS real, Xiaomi, app instalado, deploy, merge, cutover, banco de produção ou assinatura de serviço. Runner de GitHub e Chromium descartável. Não houve implementação de novo motor, reinterpretação dos seis ambientes ou mudança de design de autoridade.

**Fronteiras de prova:** `L4_DEGRADED_MESSAGE_BROWSER_LAB=PASS_24/24`; `L4_HOME_SOURCE_TRUTH_STATIC=PASS_5/5`; `L6_QUEUE_COPY_4XX_STATIC_PURE=PASS_39/39`; `L4_REAL_ORDER_HOME=HOLD`; `L4_SOURCE_FRESHNESS_FIELD=UNKNOWN`; `L6_XIAOMI_FIELD=NOT_RUN`; `L6_SERVER_ACK_REAL=UNKNOWN`; `L6_PERSISTENT_REJECTION_POLICY=HOLD`; `L7_INTEGRATED_JOURNEY=HOLD`; `L8_FIELD_SILENCE=HOLD`; **V1=0/8 aceites integrais de campo**.

**Próximo movimento de valor:** continuar a L6 pelo percurso observável de evento local→tentativa HTTP→recibo do servidor→sinal claro ao motoboy, em **bancada autorizada e descartável**, ou ampliar L4 por cenários de fonte real sem perder a autoridade da Operação Viva. Nenhuma promoção da Home a estado ao vivo ou instalação no Xiaomi sem prova e autorização.
