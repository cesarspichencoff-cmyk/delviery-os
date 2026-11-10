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


## Retificação de campo — leitura estrutural do Odhen Retail no Foxxy (10/11/2026)
- **Prova anterior preservada:** o operador abriu um único detalhe na seção **Manutenção de Vendas**, e a árvore de acessibilidade do Opera apresentou a região de detalhe em uma terceira subárvore `form` com referências ao Itaim e iFood. A amostragem foi estrutural, não continha atestação da identidade de cada linha, da origem nativa, da revisão, da completude nem do estado do pedido.
- **Correção obrigatória:** a busca por rótulos como “produto”, “item”, “quantidade” ou “observação” não é teste de ausência desses campos. Os nomes dos produtos podem constituir diretamente a estrutura visual da lista. Portanto, `PRODUCT_ITEMS_PRESENT=UNKNOWN_FROM_ACCESSIBILITY_FILTER` e `OBSERVATION_COMPLETENESS=UNPROVEN`; é incorreto registrar `ITEMS_ABSENT`.
- **Mudança de contexto observada:** uma leitura posterior da mesma aba mostrou a seção **Manutenção dos Lançamentos de Caixa** (rota `vnd00300_manutencaolancamentocaixa`), unidade `0001 - TATA ITAIM` e entradas classificadas como `IFOOD` / `PAGAMENTO DELIVERY AUTO`. São registros de caixa, **não comprovação de itens de venda, de pedido individual ou de comanda ativa**. Em verificação subsequente a aba já estava em **Parâmetros de Integração de Fechamento de Cupom** (rota `fis08600_parametros_integracao_fechamento_cupom`). Não atribuir essas mudanças ao leitor: ele somente consultou a página; não navegou.
- **Limite do código:** `gestor_visible_detail_probe_v1.js` exige `data-testid` de fixtures e um diálogo único aberto. Compatibilidade com o DOM real do Odhen Retail continua `UNKNOWN`. Ausência de correspondência de seletor deve resultar em HOLD estrutural, jamais em `ITEMS_ABSENT` ou publicação silenciosa.
- **Próxima prova mínima:** na sessão isolada autorizada no Foxxy, observar uma **única venda com detalhe já aberto** na seção exata de Manutenção de Vendas; contar os nós/linhas que representem itens e conferir correspondência visual de nome, quantidade, modificadores e observações por **hierarquia e nomes de produtos**, não apenas rótulos genéricos. Antes de reconhecer a venda como pedido do Itaim, verificar o vínculo inequívoco com unidade, identidade da venda e momento/revisão. Evitar copiar cliente, endereço, telefone, identificadores de pedido, valores e observações livres para GitHub/chat. Não tentar URL artificial, `javascript:`, extração de sessão, automação de clique por shell ou interação no caixa.
- **Fronteira de segurança:** `DETAIL_SECTION_NOW_OPEN=NO` na última verificação da tela de vendas; tela atual pertence a outra seção. `COMPLETE_ORDER=HOLD`, `SOURCE_VERIFIED=false`, `ORDERS_PUBLISHABLE=0`, sem autorização de Copiloto/Home. Esta retificação é documental: não demonstra extração de item real, prova no dispositivo, merge ou deploy.
