# Delivery OS — linha nativa do Reader → trabalho por praça R5-D3 (04/11/2026)

**Resultado:** 12/12 verificações com dados fictícios, Foxxy e CI GitHub. **Nenhuma integração em produção ou autoridade física comprovada.** Este gate faz o vínculo de identidade necessário para que um trabalho registrado não seja atribuído a outro item ou à revisão anterior.

## Difference Check — o que já estava feito
- O Reader V2 `runtime/reporting/copiloto_tata_reader_adapter_v1.cjs` já preservava `line_no=NRPRODCOMVEN` e `product_code/quantity` **internamente** na revisão adaptada.
- O resumo `runtime/reporting/copiloto_tata_orders_v1.cjs` intencionalmente expunha somente `product_code` e `quantity`: duas linhas com o mesmo produto tornavam-se indistinguíveis para um futuro cruzamento com estados físicos. **Preservamos o resumo sem acrescentar identificadores de linha à interface pública.**
- `src/product/eventos/produtor-trabalho-praca.ts` já emitia `trabalho_praca_observado` com pedido, grupo, praça, estado, revisão, operador opaco e quantidade; `projetar-leitura.ts` já fornecia deduplicação, conflitos e carga em aberto. **Não recriamos produtor, projetor, classificação de praças ou motor de Foco.**
- PR #135 já contém classificadores e revisores de Comandas; `docs/comandas/READER_V2_CACHED_SQL_PLAN_AND_ATOMICITY_GATE_20261104.md` confirma que houve captura metadata-only do plano SQL V2 existente, mas **não do plano da consulta candidata**. O SQL segue `RCSI OFF` e `SNAPSHOT OFF`, e a atomicidade da revisão não foi provada. Não executar SQL alternativo para contornar esse bloqueio.

## Slice implementado na PR #137
- `src/product/eventos/vinculo-reader-trabalho-praca.ts`: revisão somente leitura e sem I/O. Restringe unidade `0001/01` e origem `DLV_IFO`, valida identidades de linhas nativas não duplicadas, quantidades explícitas e digest canônico em formato conhecido. Gera **referências opacas diferentes por linha**, mesmo com SKU igual.
- A referência de linha inclui **chave nativa de quatro partes + hash da revisão + número da linha + SKU + quantidade**. Assim, mudar revisão, SKU ou quantidade não herda silenciosamente a declaração anterior de uma bancada.
- Um evento existente de `trabalho_praca_observado` só produz **vínculo candidato** quando coincide com pedido opaco, referência de linha exata, quantidade, origem `registro-operacao`, tenant/unidade e identidade de trabalho do produtor R5-D3. Troca de praça, linha, unidade ou evento inválido fica `HOLD`.
- O vínculo reaproveita **`validarEvento` e `projetarLeitura`**, sem recalcular máquina de estados. Todas as projeções de evento **não atestado** recebem origem interna `fixture:`, para que a linhagem diga `demonstracao`, **nunca `real` por autodeclaração**.
- A saída não contém texto de observações, dados do cliente, nem executa pedido ou ação. **`conclusao_fisica_comprovada=false`, `reader_transaction_attested=false`, `physical_event_attested=false`, `ready_for_dispatch=null` e `live_home_authorized=false` são invariantes**, inclusive após evento nominal `concluido`.
- A API pública do Reader, a Home, a gramática canônica de praças, o catálogo de eventos e o aplicativo Android não foram alterados.

## Prova executada, por ambiente

- Foxxy, worktree isolada `reader-station-link-20261104`, fonte commit `db96b4e5`: `node dist/src/platform/run-reader-station-link-review-tests.js` = **12/12 PASS**. Testes: mesmo SKU em duas linhas; linha e quantidade exatas; sequência aguardando/iniciado/concluído; troca de revisão/SKU; quantidade errada; outra unidade/tenant/pedido; duas praças conflitantes; reenvio duplicado; identidade nativa inválida; autodeclaração `real` sem promoção; Reader CJS verdadeiro de código → novo vínculo TS sem expor texto privado.
- Primeira tentativa de compilação geral no Foxxy falhou por módulos ausentes `playwright` e `pg` no `node_modules` compartilhado do laboratório. Nenhum erro foi relatado nos novos arquivos; o `tsc` gerou o JS e o teste focal passou. **Não** usar esse ambiente incompleto como prova de compilação completa.
- GitHub Actions, **run `41784841075`, commit `db96b4e5`, `completed/success`**: job `Exact Reader line to R5D3 work (synthetic only)` instalou dependências com `npm ci --ignore-scripts`, compilou `npm run build` e repetiu **12/12**; job `Static fixture contracts` passou; job `Windows no-console native fixture` passou.
- Provas não contêm PII ou pedidos reais. Nenhum acesso a SQL, administrador, Reader instalado, impressora, GPS, Android físico ou Home de produção nesta execução.

## Gate restante para o objetivo de lançamento

1. Validar leitura nativa completa **transacionalmente**, sem causar bloqueio prejudicial ao POS. O plano do SELECT de uma comanda ainda não foi obtido; não repetir a tentativa SHOWPLAN já malsucedida como se fosse prova nova. O plano cacheado existente indicou varredura de PRODUTO. A candidata `SERIALIZABLE` na PR #135 permanece review-only sem execução.
2. Resolver **identidade/catálogo item → praça** com fonte aprovada e exceções, preservando nomenclatura D45/D46. Este módulo não adivinha praça a partir de `CDARVPROD` nem faz uma classificação concorrente.
3. Comprovar **ato físico por praça** e atestar o produtor sob um canal autenticado existente. O texto `concluido` em envelope não é recibo externo de que o item ficou pronto; um futuro código QR próprio só será autoridade após prova no balcão.
4. Reconciliar fatos confiáveis e eventuais conflitos via o projetor e a **Home V3.3**, sem criar outro Copiloto, sem mover `#/copiloto` diagnóstico para Home por engano.
5. Homologar leitura real, prontidão, conferência e Entregas no Xiaomi/iPhone, respeitando consentimento e custos zero.

**Fronteiras:** `READER_TO_LINE_IDENTITY_CODE=CODE_READY`; `FIXTURE_TESTS=12/12`; `GITHUB_CI=SUCCESS`; `SOURCE_ATOMIC=UNKNOWN`; `PHYSICAL_WORK_SOURCE_ATTESTED=NO`; `LIVE_HOME=HOLD`; `PRINT=NO`; `DEPLOY=NO`; `HUMAN_ACCEPTED=NO`.
