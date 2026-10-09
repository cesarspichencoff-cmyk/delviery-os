# B5 — frescor do último relato de fila offline na tela Entregas
Data: 2026-10-09
Branch: `feat/deliveryos-b5-queue-freshness-20261009`
Base anterior: `feat/deliveryos-b5-queue-order-20261009` @ `ea73a10fc29faddde7841886061964553f5d6c13`.

## Contexto e obrigação
O Android `SyncWorker.kt` tem sincronização periódica de 15 minutos (sujeita à execução do Android). A porta B5 já fornece `pending_points`, `pending_events` e `queue_depth_reported_at`. Antes desta mudança, a tela mostrava `10 pendente(s)` com horário técnico, sem classificar idade. O número podia ser real e estar obsoleto. Não havia base para inferir conexão atual a partir desse snapshot.

## Implementação
1. `src/product/viewmodels/entregas-vm.ts`: acrescenta `fila_offline_frescor`, independente de `gps`, usando `classificarFrescor` com janelas de apresentação de 30 minutos (fresh) e 45 minutos (aging); acima disso stale. Horário futuro incoerente = unknown. Os limites são heurísticos de exibição para a cadência do worker, **não prova de SLA, disponibilidade do aparelho ou leitura instantânea**.
2. `src/platform/projections/operacao-viva.ts`: explicita o tipo numérico de janelas na função existente; valores-padrão e comportamento do GPS permanecem inalterados.
3. `src/product/ui/surfaces/entregas.js`: mostra sempre 'Ultimo relato do aparelho'; preserva totais e componentes medidos; acrescenta selo `stale` para relato com mais de 45 minutos, `parcial` de 30 a 45, `evidencia_insuficiente` para relógio inválido. Remove mensagem obsoleta de 'integracao pendente' agora que B5 possui rota. O bloco simulado permanece segregado.
4. `src/platform/run-device-queue-depth-tests.ts`: casos B5.11 e B5.12, inclusive relógio futuro e aging.
5. `tests/product/run-b5-freshness-render-smoke.ts`: HTML renderizado de `telaEntregas` usando o dicionário **real** de `docs/figma/DESIGN_TOKENS.json`; verifica aviso acessível no snapshot antigo, sua ausência no snapshot recente, separação demo e ausência da mensagem obsoleta.
6. `package.json`: o comando `test:platform:queue-depth` executa também a prova de HTML.

## Provas: vermelho antes / verde depois
**RED antes de implementar:**
- `B5_QUEUE_DEPTH: 10/12 PASS`; B5.11 falhou porque `fila_offline_frescor` não existia; B5.12 falhou porque não havia marcação UI.
- A primeira checagem TypeScript após adicionar as janelas falhou por tipo literal excessivamente restrito; alterada só a assinatura de tipo de `classificarFrescor`.

**GREEN no Foxxy, sem CAIXA:**
- `npm run -s test:platform:queue-depth`: **B5_QUEUE_DEPTH 12/12 PASS + B5_FRESHNESS_HTML_RENDER PASS**, exit 0.
- `npx --no-install tsc --noEmit`: PASS, exit 0.
- `npx --no-install tsx src/platform/run-device-queue-depth-pg-tests.ts`: **12/12 PASS**, PostgreSQL local isolado.
- `npm run -s build:platform`: PASS.
- `npx --no-install tsx src/platform/run-device-queue-depth-http-pg-tests.ts`: **8/8 PASS**, HTTP contra PostgreSQL local isolado.
- O smoke HTML inicial sem dicionário foi inválido (os estados são injetados pelo aplicativo). A prova foi corrigida para carregar os tokens do produto e passou; este harness correto foi publicado no repo.

## Fronteira
`CODE_READY + TEST_PASS` **somente**. Nenhum deploy, cutover, mudança de permissões ou escrita em serviços de produção. Não acessou a CAIXA, SQL Teknisa, TATÁ Comanda, impressão, fiscal ou SEFAZ. Não faz afirmações sobre aparelho Android físico: essa prova permanece pendente.

A classificação é de **idade do último relato**, não da conectividade efetiva; `fresh` não significa telefone online.
