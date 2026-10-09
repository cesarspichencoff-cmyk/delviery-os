# DeliveryOS — prova de ordem das respostas na tela Entregas
Data: 2026-10-09
Branch: `feat/deliveryos-entregas-response-order-fixed-20261009`
Base integrada: `integration/deliveryos-product-ux-android-20261009` @ `a19b4662d9831925e7dae74893c5d3642d65e624`
Estado: **CODE_READY + TEST_PASS no Chromium e no CI Product UX**, **NÃO DEPLOYED**, **NÃO WORLD_PROVEN**.

## Problema reproduzido
`src/product/ui/app.js` usa `desenhar(rota)` de forma assíncrona a cada filtro/rota, mas nenhuma verificação anterior impedia que uma resposta da primeira consulta substituísse o conteúdo da segunda. O navegador podia estar em `#/entregas?unidade=VILA-LAB`, enquanto o corpo mostrava ITAIM.

**Prova RED** preservada na branch de teste `feat/deliveryos-entregas-response-order-20261009` @ `dc16c46b6da4170166af74acccd16e8aaaa51220`:
- Chromium real, fixture simulada e endpoint `/api/entregas` interceptado, sem banco operacional.
- N10 segura artificialmente a resposta da consulta de ITAIM, navega para VILA-LAB e libera o retorno antigo.
- GitHub Actions run [37951427710](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37951427710): `ENTREGAS_BROWSER 10/11 PASS`; N10 reprovou porque a tela mostrou **`3 viagens na rua em ITAIM`** sob o hash VILA-LAB.

## Correção mínima
`src/product/ui/app.js`:
- `estado.versaoDoDesenho` monotônica incrementada a cada nova requisição de desenho;
- depois do `fetch`, **ignora resultado de requisição anterior** ao gerar HTML e inspecionar/ligar leitura;
- também ignora erro anterior (não substitui leitura posterior por mensagem de erro antiga);
- só a versão atual pode liberar `aria-busy` no `finally`.
- Não mexe na rota, nos dados lidos, no banco, na API, em ações operacionais ou na lógica de produção.

`tests/product/run-entregas-browser-tests.ts`: N10, a corrida de duas seleções de unidade no Chromium.

`docs/execution/STATE.json`: atualiza `state_basis` de `aeb1fd2` para `b414d7d`, commit que contém o último delta em `src/product`. A primeira rodada green N10 (run 37951636970) passou no navegador 11/11 mas falhou apenas em `G6b` pelo ponteiro antigo; corrigido, nunca classificado como totalmente verde.

## Prova GREEN
GitHub Actions [37951961117](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37951961117), commit `70ca4943b56a915f116f232af67e063d9b5257f5`: **SUCCESS**.
- Leitura da rua: **22/22 PASS**.
- Chromium: **11/11 PASS**, inclusive N10 reproduzido.
- Servidor + PostgreSQL descartável: **5/5 PASS**.
- B5: **12/12 PASS**.
- `SEM_FAIL_NOVO: OK`, com falha C6 da Q-019 classificada como preexistente (12 caminhos inalterados). Este trabalho **não resolve Q-019**.
- Compilação TypeScript, build e outras suites do workflow: concluídas com sucesso.
- No Foxxy: worktree isolado de `70ca494`, árvore limpa, `git diff --check` exit 0, divergência local/remoto 0/0.

## Revisão visual independente
Foram inspecionadas as capturas existentes do Claude em desktop e celular na branch integrada. A hierarquia prioriza a leitura da rua; a própria interface assinala dados simulados no exemplo. A revisão não se confunde com uso por um gerente na operação nem prova de dados reais.

## Limites e próximo passo
- Arquivos efetivamente alterados frente à base: `src/product/ui/app.js`, `tests/product/run-entregas-browser-tests.ts`, workflow da branch e `docs/execution/STATE.json`; este recibo acrescenta documentação.
- Nenhum arquivo `android/**` foi alterado. A base Android anterior está provada separadamente (77 JVM tests) e foi preservada.
- Sem merge em `main`, deploy, movimentação de pedidos, acesso à CAIXA ou ao TATÁ Comanda.
- Q-022: autorização já registrada. Q-019, Q-020, Q-021, Q-023 e Q-024 permanecem conforme fonte.
- Recomendado para próxima rodada: testar chegada tardia de **erro** (em vez de sucesso), navegar para módulo futuro enquanto uma leitura antiga ainda está pendente, validar `aria-busy` e reforçar regressões. Nenhuma prova de Android físico ou expedição em campo.
