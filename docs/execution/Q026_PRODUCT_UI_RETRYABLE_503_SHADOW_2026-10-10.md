# Q-026 — UX de sobrecarga 503 sem destruir leitura anterior (SHADOW / HOLD)

**Data:** 10/10/2026 · **PR #60** empilhado no #59 · alterações somente no frontend de apresentação, módulo de mensagens, teste e reancoragem da fonte técnica de governança nesta branch.

## Mudança funcional

O `src/product/ui/app.js` já possuía releitura `relerSemApagar`, preservando a leitura da rua e sua idade quando a nova consulta falhava. Porém a falha HTTP 503 mostrava um texto técnico genérico, não explicava a sobrecarga nem o `Retry-After` opcional do servidor.

O módulo **puro** `src/product/ui/http-leitura.js` normaliza apenas o status HTTP e um header `Retry-After` inteiro entre 1 e 60 segundos. O corpo da resposta e a URL não são incorporados em erros usados na UI. Somente a rota de Entregas apresenta mensagem em português sobre leitura temporariamente ocupada.

Quando a leitura anterior existe, o erro NÃO substitui a área com skeleton/zero: a interface mantém o conteúdo anterior, texto que avisa da defasagem, o horário da leitura e os controles de releitura reabilitados. Quando a visita é nova e não existe leitura, mostra erro recuperável dizendo que indisponibilidade não significa ausência de entregas. Outras rotas e HTTP 500 preservam fluxo de erro anterior.

## Evidência verificável

**[CI #38091778341](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38091778341)**: 3/3 jobs SUCCESS — verificação ESM `app.js` e `http-leitura.js`, módulo puro importado em Node via data URL, testes sem URL/SQL/script refletido no texto, integração estática e política de preservar informação anterior, além de regressões Q-016/Product/governança. Matriz PG16 efêmero de HTTP real cobre fila pool checkout 503 `Retry-After` e SQLSTATE 42501 que não deve gerar falso 503.

No primeiro CI **#38091678212**, a governança G6b reprovou `docs/execution/STATE.json`: após alteração real em `src/product/ui/app.js` no commit `300969f`, a base observada permanecia `6f52755` (obsoleta). Corrigimos **somente na branch SHADOW** a `_lifecycle.state_basis` apontando ao commit da UI e a data de manutenção; **não** afrouxamos a guarda nem afirmamos produção validada. Após a correção, governança voltou a passar.

O teste puro registra `Q026_PRODUCT_UI_503_SHADOW_PASS`, mas não deve reivindicar número de asserts sem instrumentação. Os resultados são sobre módulo + integração estática, **não** prova visual física de navegador.

## Limitações

- Não houve browser de verdade, avaliação de leitor de tela, teste mobile ou Preview.
- O backend e o consumo de memória do leitor canônico não mudaram neste PR; Q-026 mantém gates pendentes de memória e concorrência CPU.
- O feedback de Retry-After não agenda repetição automática: o usuário deve pedir a releitura. Isso evita tempestade de retry involuntária, mas requer observação de UX.
- Alterar `STATE.json` em uma branch de pesquisa não é promoção de estado técnico à branch principal.
- Todos os PRs #51–#60 estão em HOLD/DRAFT; main/integration e banco operacional inalterados; sem merge/deploy/gasto.

**Q-026 OPEN. Evidência SHADOW é restrita ao cenário descrito.**
