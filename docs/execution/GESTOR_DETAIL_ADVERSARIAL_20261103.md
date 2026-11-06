# Auditoria adversarial do leitor de detalhes — 03/11/2026

## Objetivo e fronteira
Fortalecer a leitura de **detalhes já abertos** no visualizador do Gestor, em uma futura sessão isolada do Itaim, sem assumir acesso a pedido real nem modificar o caixa. O módulo é `runtime/reporting/gestor_visible_detail_probe_v1.js` na PR #137, ainda DRAFT/HOLD.

## Falhas encontradas e corrigidas
1. **Linhas escondidas:** a versão inicial ignorava linhas ocultas e podia apresentar uma leitura parcial como candidata. Agora retorna `HOLD_HIDDEN_ITEM_ROWS`; nada é publicado.
2. **Campos duplicados:** nomes ou quantidades com seletores repetidos agora produzem `HOLD_AMBIGUOUS_ITEM_FIELDS`.
3. **Complementos ocultos:** produzem `HOLD_HIDDEN_OPTION_FIELDS`.
4. **Modal fechado com CSS conflitante:** o Edge podia mostrar um `dialog` fechado como visualmente presente. Agora é obrigatório `dialog[open]`.
5. **Texto escondido em nomes:** `textContent` incluía filhos invisíveis. Agora a leitura prefere `innerText` renderizado, com verificação de elementos ancestrais escondidos.
6. **Privacidade e completude:** a saída explicita `personalDataAbsentProven=false`, `completeDetailProven=false`. O texto de produtos/complementos pode incluir conteúdo fornecido por humanos; não gravar dados brutos em logs ou relatórios.

## Provas no CAIXA_MOOCA — somente fixtures
- Node 24: `run-visible-detail-probe-tests.cjs` **22/22 PASS**.
- Microsoft Edge headless real, página fictícia isolada: `run-visible-detail-browser-fixture.cjs` **18/18 PASS**. Testes de fechamento, linhas ocultas, quantidade duplicada, `aria-hidden`, texto filho escondido e ausência de saída pessoal.
- Benchmark do Edge real com **20 itens fictícios e 20 complementos**, 200 leituras: p50 **0,8 ms**, p95 **1,6 ms**, máximo **2,4 ms**. DOM, foco, rolagem inalterados e **0 requisições de rede**. É microbenchmark de página fictícia; **não** mede o Gestor real, a carga concorrente, sessão oculta nem leitura de 20 pedidos.

## Estado que a prova NÃO estabelece
- O Gestor real usa exatamente os seletores `data-testid` desses testes? **UNKNOWN**.
- Uma sessão de observação independente está autenticada na loja Itaim? **UNKNOWN**.
- Itens, quantidades, adicionais e notas reais foram extraídos? **NÃO**.
- Abrir e fechar pedidos na sessão isolada não altera recibos, leitura ou outros estados? **NÃO COMPROVADO**.
- Existe conciliação forte com o Reader, cobertura total de pedidos, cardápio pausado, acesso Copiloto autorizado e prova no iPhone? **NÃO**.

## Gates para o próximo teste
Confirmar autenticação e identidade do Itaim na sessão isolada; observar primeiro um detalhe real aberto legitimamente sem mudança de estado; comparar visualmente um conjunto mínimo de itens e complementos; medir tempo/CPU/efeitos reais; ampliar 1→5→20 somente após invariância e conciliação. Sem navegação automática ou deploy antes disso.

**Status:** CODE_READY + SYNTHETIC_TEST_PASS + EDGE_FIXTURE_PASS. REAL_ORDER_DETAIL_PROVEN e OPERATIONAL_10/10 permanecem em HOLD.
