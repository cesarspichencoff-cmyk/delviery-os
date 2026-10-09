# Integração controlada — DeliveryOS Product UX + Android
Data: 2026-10-09
Branch de integração: `integration/deliveryos-product-ux-android-20261009`
Base preservada: `feat/deliveryos-android-event-receipt-fixed-20261009` @ `90a2278ef981bd79f0c2a408f3ea625e3146f033`
Fonte Claude: `feat/claude-product-ux-autonomous-20261009` @ `2c4fc75b645735fb2a946791b0b13a08f05bb990`

## Autorização e fronteira
César respondeu **"Sim pode seguir"** à pergunta explícita de autorização da exceção **Q-022, classe ENTREGAS_STREET_READING_ONLY**, limitada à leitura da rua e à experiência da tela Entregas. `docs/execution/PERGUNTAS.jsonl#Q-022` passou para `answered` com a fronteira completa.
Este aceite permite integrar e testar numa branch isolada. **Não** autoriza merge em `main`, publicação produtiva, impressão, comandos sobre pedidos reais, alterações no TATÁ Comanda/CAIXA/Teknisa/SEFAZ, novas permissões ou custos. **Q-020, Q-021, Q-023 e Q-024 permanecem abertas.**

## Origem dos commits, reaplicados sem conflito
O Git de Foxxy aplicou com `cherry-pick`, sobre a base Android:
- `2782b31` missão Claude → `642fa1e` (documentação da missão);
- `c886f87` correção CSS shell/inspetor → `fda009f`;
- `d722ec0` leitura da rua: view model, UI, CSS, servidor, testes → `aeb1fd2`;
- `4091d17` CI e classificador de falhas novas → `7b4101e`;
- `2c4fc75` handback, STATE, evidências e capturas → `9050d5e`.
Nenhum arquivo do Android foi reescrito pelo Claude; o Android mantém a base com as correções acumuladas até os recibos individuais (77 testes JVM).

## Testes e controle de governança
- Rodada local Foxxy (primeira): leitura da rua **22/22 PASS**; B5 **12/12 PASS**, smoke HTML PASS.
- `npm run -s test:platform:product` no Windows Foxxy não completou: o caso de subprocesso do harness retornou `null !== 0`, comportamento observado nesse ambiente anteriormente. Não classificá-lo como sucesso; a prova adequada de Product System é o runner Linux do GitHub Actions.
- `tsc --noEmit` + `build:platform`: ambos concluíram (9 migrations copiadas). `git diff --check` detectou duas linhas vazias finais em documentos importados; foram removidas.
- Primeiro CI Product UX da integração (run `37940969750`) falhou **em governança** por `state_basis` referir SHAs originais que não eram ancestrais após cherry-pick (`2782b31`, `d722ec0`). As provas de produto chegaram ao gate de governança.
- Corrigido sem alterar lógica: `docs/design/M1_VISUAL_CHANGE_ENVELOPE.md state_basis=642fa1e`; `docs/execution/STATE.json state_basis=aeb1fd2`. O CI Product UX no commit `d19ba416` concluiu SUCCESS.
- Workflows ampliados **somente para esta branch**, sem deploy: `.github/workflows/deliveryos-product-ux.yml` (PostgreSQL 16 + Chromium + gates Product) e `.github/workflows/deliveryos-android-event-receipt.yml` (Java 17, JVM Android/Room).
- Acompanhamento das provas finais no mesmo HEAD via GitHub Actions (não fabricar status):
  - Produto: https://github.com/cesarspichencoff-cmyk/delviery-os/actions/workflows/deliveryos-product-ux.yml
  - Android: https://github.com/cesarspichencoff-cmyk/delviery-os/actions/workflows/deliveryos-android-event-receipt.yml
- O git local integrador é um worktree isolado Foxxy em `C:\Users\italo\deliveryos-integration-ux-android-20261009`; nenhum serviço de produção foi usado.

## Correção de escopo operacional — autoridade César, 2026-10-09
César esclareceu que **o uso operacional pretendido é exclusivamente no Itaim; não há utilização em Pinheiros**. Portanto, não priorizar riscos, navegação ou investimentos com base na hipótese de alternância real entre Itaim e Pinheiros. Referências a outras unidades, como `VILA-LAB`, são dados de demonstração/teste, não prova de implantação multiunidade.
- O teste de resposta atrasada entre filtros de unidades (branch `feat/deliveryos-entregas-response-order-fixed-20261009`) mede robustez genérica de interface, **não um bloqueio real da operação do Itaim**. Não promover esse caso a requisito operacional prioritário nem fundir esse ramo só por existir.
- Continuar priorizando fluxos reais do Itaim: pedidos, motoboys, recuperação Android, sincronização, procedência e frescor dos dados; não inferir que uma UI multiunidade da demo represente escopo de implantação.
- O uso exclusivo no Itaim não prova ausência de qualquer corrida técnica entre leituras sucessivas da mesma unidade; tratar isso apenas como hipótese de qualidade, subordinada a problemas operacionais comprovados.

## O que a integração entrega
- Primeira leitura da rua da expedição com hora e idade do dado, filtro por unidade declarado, grupos por ciclo de vida, status de evidência e demonstração separada.
- Mantém as garantias Android acumuladas: sincronização offline, persistência Room, falhas idempotentes e recibos individuais de eventos.
- Não introduz filtro por turno (Q-024), source_mode B5 ainda é decisão aberta (Q-023), nem mistura a linhagem `tmp/product-reader-official-wiring-20261005` (Q-021).
- Sem deploy/merge principal, sem uso humano real da tela, sem prova física Android. `CODE_READY` existe no ramo isolado; `TEST_PASS` só é declarado por gate e SHA.

## Próxima ação
Verificar ambos os workflows da integração no **mesmo commit**, revalidar diff/HEAD/worktree limpa e preparar revisão humana visual. Só depois considerar pedido separado de publicação controlada. Nenhuma promoção automática.
